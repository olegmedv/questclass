/**
 * A stand-in for ffmpeg/ffprobe in tests: answers the NVENC probe and the audio probe, and for an
 * HLS run writes a plausible HLS folder (master playlist, two variants, segments) where the real
 * ffmpeg would.
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Runner, Tools } from '../src/hls';

export interface FakeOptions {
  readonly nvenc?: boolean;
  readonly audio?: boolean;
  readonly segments?: number;
  readonly segmentBytes?: number;
  readonly fail?: boolean;
}

export interface FakeFfmpeg {
  readonly tools: Tools;
  /** Arguments of every HLS run. */
  readonly transcodes: string[][];
}

/** Segments last 4 s except the last one (2.5 s): 3 segments = 10.5 s. */
export function fakeFfmpeg(options: FakeOptions = {}): FakeFfmpeg {
  const { nvenc = true, audio = true, segments = 3, segmentBytes = 5000, fail = false } = options;
  const transcodes: string[][] = [];
  const run: Runner = (command, args) => {
    if (command === 'ffprobe') {
      return Promise.resolve({ code: 0, stdout: audio ? '1\n' : '', stderr: '' });
    }
    if (args.includes('null')) {
      return Promise.resolve({ code: nvenc ? 0 : 1, stdout: '', stderr: nvenc ? '' : 'no GPU' });
    }
    if (!args.includes('hls')) {
      return Promise.resolve({ code: 1, stdout: '', stderr: 'unexpected call' });
    }
    transcodes.push([...args]);
    if (fail) {
      return Promise.resolve({ code: 1, stdout: '', stderr: 'Invalid data found' });
    }
    const out = (args.at(-1) ?? '').replace('/%v/index.m3u8', '');
    const master = ['#EXTM3U', '#EXT-X-VERSION:6'];
    for (const [name, size] of [
      ['360p', '640x360'],
      ['480p', '854x480'],
    ] as const) {
      mkdirSync(path.join(out, name), { recursive: true });
      const lines = ['#EXTM3U', '#EXT-X-TARGETDURATION:4', '#EXT-X-PLAYLIST-TYPE:VOD'];
      for (let i = 0; i < segments; i += 1) {
        const file = `seg_${String(i).padStart(5, '0')}.ts`;
        writeFileSync(path.join(out, name, file), randomBytes(segmentBytes + i));
        lines.push(`#EXTINF:${i === segments - 1 ? '2.500000' : '4.000000'},`, file);
      }
      lines.push('#EXT-X-ENDLIST', '');
      writeFileSync(path.join(out, name, 'index.m3u8'), lines.join('\n'));
      master.push(`#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=${size}`, `${name}/index.m3u8`);
    }
    writeFileSync(path.join(out, 'master.m3u8'), `${master.join('\n')}\n`);
    return Promise.resolve({ code: 0, stdout: '', stderr: '' });
  };
  return { tools: { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', run }, transcodes };
}
