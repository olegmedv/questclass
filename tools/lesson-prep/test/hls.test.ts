import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  detectEncoder,
  hlsArgs,
  hlsDuration,
  playlistDuration,
  spawnRunner,
  transcodeToHls,
  type Runner,
  type Tools,
} from '../src/hls';
import { fakeFfmpeg } from './fakeFfmpeg';

const dir = mkdtempSync(path.join(os.tmpdir(), 'qc-lesson-prep-hls-'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const value = (args: readonly string[], flag: string) => args[args.indexOf(flag) + 1];

describe('ffmpeg arguments', () => {
  it('two H.264 renditions 360p and 480p, 4-second segments, AAC audio', () => {
    const args = hlsArgs('in.mp4', path.join('C:', 'out'), { encoder: 'nvenc', audio: true });
    expect(value(args, '-c:v')).toBe('h264_nvenc');
    expect(value(args, '-filter_complex')).toBe(
      '[0:v]format=yuv420p,split=2[s0][s1];[s0]scale=-2:360[v0];[s1]scale=-2:480[v1]',
    );
    expect(value(args, '-hls_time')).toBe('4');
    expect(value(args, '-force_key_frames')).toBe('expr:gte(t,n_forced*4)');
    expect(value(args, '-hls_playlist_type')).toBe('vod');
    expect(value(args, '-c:a')).toBe('aac');
    expect(value(args, '-var_stream_map')).toBe('v:0,a:0,name:360p v:1,a:1,name:480p');
    expect(value(args, '-master_pl_name')).toBe('master.m3u8');
    // Forward slashes, or the master playlist would list `360p\index.m3u8` on Windows.
    expect(args.at(-1)).toBe('C:/out/%v/index.m3u8');
    expect(value(args, '-hls_segment_filename')).toBe('C:/out/%v/seg_%05d.ts');
  });

  it('libx264 fallback; no audio arguments for a silent video', () => {
    const args = hlsArgs('in.mp4', 'out', { encoder: 'x264', audio: false });
    expect(value(args, '-c:v')).toBe('libx264');
    expect(args).not.toContain('-c:a');
    expect(args.filter((a) => a === '0:a:0')).toHaveLength(0);
    expect(value(args, '-var_stream_map')).toBe('v:0,name:360p v:1,name:480p');
  });
});

describe('encoder choice', () => {
  const probe = (code: number): Tools => ({
    ffmpeg: 'ffmpeg',
    ffprobe: 'ffprobe',
    run: () =>
      Promise.resolve({ code, stdout: '', stderr: code === 0 ? '' : 'No NVENC capable devices' }),
  });

  it('NVENC when a test encode on the GPU works, libx264 otherwise', async () => {
    expect(await detectEncoder(probe(0), 'auto')).toBe('nvenc');
    expect(await detectEncoder(probe(1), 'auto')).toBe('x264');
    expect(await detectEncoder(probe(0), 'x264')).toBe('x264');
    await expect(detectEncoder(probe(1), 'nvenc')).rejects.toThrow('NVENC');
  });

  it('a missing ffmpeg means libx264 for auto (and fails later with a clear error)', async () => {
    const missing: Runner = () => Promise.reject(new Error('spawn ffmpeg ENOENT'));
    expect(await detectEncoder({ ffmpeg: 'x', ffprobe: 'y', run: missing }, 'auto')).toBe('x264');
  });
});

describe('transcodeToHls (ffmpeg mocked)', () => {
  it('runs ffmpeg once into a temporary folder and renames it when done', async () => {
    const source = path.join(dir, 'video.mp4');
    writeFileSync(source, 'not really a video');
    const fake = fakeFfmpeg({ nvenc: true, segments: 3 });
    const out = path.join(dir, 'hls');
    const result = await transcodeToHls(fake.tools, source, out, 'auto');
    expect(result.encoder).toBe('nvenc');
    expect(fake.transcodes).toHaveLength(1);
    expect(fake.transcodes[0]).toContain('h264_nvenc');
    expect(existsSync(`${out}.tmp`)).toBe(false);
    expect(readdirSync(out).sort()).toEqual(['360p', '480p', 'master.m3u8']);
    expect(await hlsDuration(out)).toBe(10.5);
  });

  it('a failed ffmpeg leaves no half-made HLS folder', async () => {
    const source = path.join(dir, 'broken.mp4');
    writeFileSync(source, 'x');
    const fake = fakeFfmpeg({ nvenc: false, fail: true });
    const out = path.join(dir, 'broken-hls');
    await expect(transcodeToHls(fake.tools, source, out, 'auto')).rejects.toThrow('ffmpeg');
    expect(existsSync(out)).toBe(false);
    expect(existsSync(`${out}.tmp`)).toBe(false);
  });
});

describe('playlist duration', () => {
  it('sums #EXTINF', () => {
    expect(
      playlistDuration(
        '#EXTM3U\n#EXTINF:4.000000,\na.ts\n#EXTINF:4.0,\nb.ts\n#EXTINF:1.25,\nc.ts\n',
      ),
    ).toBe(9.25);
  });
});

const ffmpegAvailable =
  spawnSync('ffmpeg', ['-hide_banner', '-version'], { windowsHide: true }).status === 0;

describe.skipIf(!ffmpegAvailable)('real ffmpeg (skipped without ffmpeg)', () => {
  it('turns a test clip into playable HLS 360p + 480p', async () => {
    const source = path.join(dir, 'testsrc.mp4');
    const made = spawnSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=854x480:rate=25:duration=9',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=9',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        source,
      ],
      { windowsHide: true },
    );
    expect(made.status).toBe(0);
    const tools: Tools = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', run: spawnRunner };
    const out = path.join(dir, 'real-hls');
    await transcodeToHls(tools, source, out, 'auto');
    const master = readFileSync(path.join(out, 'master.m3u8'), 'utf8');
    expect(master).toContain('360p/index.m3u8');
    expect(master).toContain('480p/index.m3u8');
    expect(master).toContain('RESOLUTION=854x480');
    expect(master).toContain('RESOLUTION=640x360');
    expect(await hlsDuration(out)).toBeCloseTo(9, 0);
    const variant = readFileSync(path.join(out, '480p', 'index.m3u8'), 'utf8');
    expect(variant).toContain('#EXT-X-TARGETDURATION:4');
    const probe = spawnSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_name',
        '-of',
        'csv=p=0',
        path.join(out, '480p', 'seg_00000.ts'),
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    // MPEG-TS lists the streams of its program too, hence the set.
    const codecs = new Set(probe.stdout.split(/\r?\n/).filter(Boolean));
    expect([...codecs].sort()).toEqual(['aac', 'h264']);
  }, 60_000);
});
