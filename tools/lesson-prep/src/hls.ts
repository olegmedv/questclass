import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EncoderChoice } from './config';

/** Result of a finished child process. */
export interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Runs a program. `showProgress` passes its stderr through to the terminal (ffmpeg's `-stats`)
 * instead of collecting it.
 */
export type Runner = (
  command: string,
  args: readonly string[],
  options?: { readonly showProgress?: boolean },
) => Promise<RunResult>;

export const spawnRunner: Runner = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      stdio: ['ignore', 'pipe', options.showProgress ? 'inherit' : 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });

export interface Tools {
  readonly ffmpeg: string;
  readonly ffprobe: string;
  readonly run: Runner;
}

export type Encoder = 'nvenc' | 'x264';

/** The two renditions of SPEC §4: 360p and 480p H.264 with AAC audio. */
export const RENDITIONS = [
  { name: '360p', height: 360, videoKbps: 400, maxKbps: 500, audioKbps: 64 },
  { name: '480p', height: 480, videoKbps: 700, maxKbps: 900, audioKbps: 96 },
] as const;
export const SEGMENT_SECONDS = 4;
export const MASTER_PLAYLIST = 'master.m3u8';

export class FfmpegError extends Error {
  override name = 'FfmpegError';
}

/** NVENC is used only if a tiny test encode on the GPU really works. */
export async function detectEncoder(tools: Tools, choice: EncoderChoice): Promise<Encoder> {
  if (choice === 'x264') {
    return 'x264';
  }
  const probe = await tools
    .run(tools.ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=256x144:d=0.2',
      '-c:v',
      'h264_nvenc',
      '-f',
      'null',
      '-',
    ])
    .catch(() => ({ code: 1, stdout: '', stderr: 'ffmpeg not found' }));
  if (probe.code === 0) {
    return 'nvenc';
  }
  if (choice === 'nvenc') {
    throw new FfmpegError(`NVENC недоступен: ${probe.stderr.trim()}`);
  }
  return 'x264';
}

/** Whether the source has an audio track (ffprobe). */
export async function hasAudio(tools: Tools, input: string): Promise<boolean> {
  const result = await tools.run(tools.ffprobe, [
    '-v',
    'error',
    '-select_streams',
    'a',
    '-show_entries',
    'stream=index',
    '-of',
    'csv=p=0',
    input,
  ]);
  if (result.code !== 0) {
    throw new FfmpegError(`ffprobe не прочитал ${input}: ${result.stderr.trim()}`);
  }
  return result.stdout.trim() !== '';
}

/** ffmpeg wants forward slashes, otherwise the master playlist lists `360p\index.m3u8`. */
const forward = (p: string): string => p.split(path.sep).join('/');

function encoderArgs(encoder: Encoder): string[] {
  return encoder === 'nvenc'
    ? [
        '-c:v',
        'h264_nvenc',
        '-preset',
        'p5',
        '-rc',
        'vbr',
        '-profile:v',
        'main',
        '-forced-idr',
        '1',
      ]
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main', '-sc_threshold', '0'];
}

/**
 * One ffmpeg run producing both renditions: `<out>/master.m3u8`, `<out>/<360p|480p>/index.m3u8`
 * and 4-second segments `seg_00000.ts` (keyframe every 4 s so segments are cut exactly).
 */
export function hlsArgs(
  input: string,
  outDir: string,
  options: { readonly encoder: Encoder; readonly audio: boolean },
): string[] {
  const { encoder, audio } = options;
  const out = forward(outDir);
  const split = RENDITIONS.map((_, i) => `[s${i}]`).join('');
  const scales = RENDITIONS.map((r, i) => `[s${i}]scale=-2:${r.height}[v${i}]`).join(';');
  const maps = RENDITIONS.flatMap((_, i) => [
    '-map',
    `[v${i}]`,
    ...(audio ? ['-map', '0:a:0'] : []),
  ]);
  const rates = RENDITIONS.flatMap((r, i) => [
    `-b:v:${i}`,
    `${r.videoKbps}k`,
    `-maxrate:v:${i}`,
    `${r.maxKbps}k`,
    `-bufsize:v:${i}`,
    `${r.maxKbps * 2}k`,
  ]);
  const audioArgs = audio
    ? [
        '-c:a',
        'aac',
        '-ac',
        '2',
        '-ar',
        '44100',
        ...RENDITIONS.flatMap((r, i) => [`-b:a:${i}`, `${r.audioKbps}k`]),
      ]
    : [];
  const streamMap = RENDITIONS.map((r, i) => `v:${i}${audio ? `,a:${i}` : ''},name:${r.name}`).join(
    ' ',
  );
  return [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-stats',
    '-i',
    input,
    '-filter_complex',
    `[0:v]format=yuv420p,split=${RENDITIONS.length}${split};${scales}`,
    ...maps,
    ...encoderArgs(encoder),
    ...rates,
    '-force_key_frames',
    `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
    ...audioArgs,
    '-f',
    'hls',
    '-hls_time',
    String(SEGMENT_SECONDS),
    '-hls_playlist_type',
    'vod',
    '-hls_flags',
    'independent_segments',
    '-hls_segment_filename',
    `${out}/%v/seg_%05d.ts`,
    '-master_pl_name',
    MASTER_PLAYLIST,
    '-var_stream_map',
    streamMap,
    `${out}/%v/index.m3u8`,
  ];
}

export interface TranscodeResult {
  readonly encoder: Encoder;
  readonly seconds: number;
}

/**
 * Transcodes an MP4 (any codec ffmpeg decodes) into `outDir`. Works in `<outDir>.tmp` and
 * renames at the end, so a half-finished run never looks like a ready HLS folder.
 */
export async function transcodeToHls(
  tools: Tools,
  input: string,
  outDir: string,
  choice: EncoderChoice,
): Promise<TranscodeResult> {
  if (!existsSync(input)) {
    throw new FfmpegError(`Нет видео ${input}`);
  }
  const encoder = await detectEncoder(tools, choice);
  const audio = await hasAudio(tools, input);
  const tmp = `${outDir}.tmp`;
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const started = Date.now();
  const result = await tools.run(tools.ffmpeg, hlsArgs(input, tmp, { encoder, audio }), {
    showProgress: true,
  });
  if (result.code !== 0) {
    await rm(tmp, { recursive: true, force: true });
    throw new FfmpegError(`ffmpeg завершился с кодом ${result.code}: ${result.stderr.trim()}`);
  }
  const master = path.join(tmp, MASTER_PLAYLIST);
  if (!existsSync(master)) {
    throw new FfmpegError(`ffmpeg не создал ${MASTER_PLAYLIST}`);
  }
  // Belt and braces: playlist URIs always use forward slashes.
  await writeFile(master, (await readFile(master, 'utf8')).replace(/\\/g, '/'));
  await rm(outDir, { recursive: true, force: true });
  await rename(tmp, outDir);
  return { encoder, seconds: (Date.now() - started) / 1000 };
}

/** Sum of `#EXTINF` durations of a media playlist. */
export function playlistDuration(text: string): number {
  let total = 0;
  for (const match of text.matchAll(/^#EXTINF:([\d.]+)/gm)) {
    total += Number(match[1]);
  }
  return Math.round(total * 1000) / 1000;
}

/** Length of an HLS folder: the first variant of its master playlist. */
export async function hlsDuration(dir: string): Promise<number> {
  const master = await readFile(path.join(dir, MASTER_PLAYLIST), 'utf8');
  const variant = master
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== '' && !line.startsWith('#'));
  if (!variant) {
    throw new FfmpegError(`${MASTER_PLAYLIST} без вариантов`);
  }
  const duration = playlistDuration(await readFile(path.join(dir, variant), 'utf8'));
  if (duration <= 0) {
    throw new FfmpegError(`В ${variant} нет сегментов`);
  }
  return duration;
}
