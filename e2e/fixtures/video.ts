// Video fixtures for player tests: a 5-second test pattern with a tone, as MP4 and as HLS.
// Generated with ffmpeg (lavfi testsrc) before the run and never committed (CLAUDE.md rule 14).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { OUTPUT_DIR } from './paths';

export const VIDEO_DIR = join(OUTPUT_DIR, 'fixtures/video');
export const VIDEO_SECONDS = 5;

export interface VideoFixtures {
  /** Progressive MP4 (H.264 + AAC, faststart). */
  readonly mp4: string;
  /** HLS playlist (VOD, 2-second fMP4 segments) of the same clip. */
  readonly hls: string;
}

function ffmpeg(args: string[], cwd: string): void {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    encoding: 'utf8',
    cwd,
  });
  if (result.error) {
    throw new Error(
      'ffmpeg is required to generate the e2e video fixtures. Install it and make sure it is on PATH.',
    );
  }
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed (${result.status}): ${result.stderr}`);
  }
}

export function ensureVideoFixtures(): VideoFixtures {
  const mp4 = join(VIDEO_DIR, 'sample.mp4');
  const hlsDir = join(VIDEO_DIR, 'hls');
  const hls = join(hlsDir, 'index.m3u8');
  if (existsSync(mp4) && existsSync(hls) && existsSync(join(hlsDir, 'init.mp4'))) {
    return { mp4, hls };
  }
  rmSync(VIDEO_DIR, { recursive: true, force: true });
  mkdirSync(hlsDir, { recursive: true });
  const seconds = String(VIDEO_SECONDS);
  ffmpeg(
    [
      ...['-f', 'lavfi', '-i', `testsrc=duration=${seconds}:size=640x360:rate=25`],
      ...['-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`],
      ...['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p'],
      // A keyframe every 2 s so the HLS copy below can cut 2-second segments.
      ...['-g', '50', '-keyint_min', '50', '-sc_threshold', '0'],
      ...['-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', '-shortest', mp4],
    ],
    VIDEO_DIR,
  );
  // ffmpeg writes the fMP4 init segment relative to its working directory, so the HLS step
  // runs inside the output folder with relative names only.
  ffmpeg(
    [
      ...['-i', mp4, '-c', 'copy', '-f', 'hls', '-hls_time', '2', '-hls_playlist_type', 'vod'],
      // fMP4 segments (.m4s): hls.js and Safari play them, and no `.ts` files confuse the tooling.
      ...['-hls_segment_type', 'fmp4', '-hls_fmp4_init_filename', 'init.mp4'],
      ...['-hls_segment_filename', 'segment-%03d.m4s', 'index.m3u8'],
    ],
    hlsDir,
  );
  return { mp4, hls };
}
