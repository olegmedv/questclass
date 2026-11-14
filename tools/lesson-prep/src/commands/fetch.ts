import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Runner } from '../hls';

/** Best stream up to 480p (SPEC §9), merged into MP4; any codec ffmpeg decodes is fine. */
export const YT_FORMAT = 'bv*[height<=480]+ba/b[height<=480]';
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export class FetchError extends Error {
  override name = 'FetchError';
}

/** yt-dlp arguments that save `<out>/<videoId>.mp4`. */
export function ytDlpArgs(videoId: string, out: string): string[] {
  return [
    '--no-playlist',
    '-f',
    YT_FORMAT,
    '--merge-output-format',
    'mp4',
    '-o',
    path.join(out, '%(id)s.%(ext)s'),
    `https://www.youtube.com/watch?v=${videoId}`,
  ];
}

export interface FetchOptions {
  readonly out: string;
  readonly run: Runner;
  /** yt-dlp executable (default: from PATH). */
  readonly ytDlp?: string;
  readonly log?: (line: string) => void;
}

export interface FetchResult {
  readonly downloaded: string[];
  /** Already in the folder. */
  readonly skipped: string[];
}

/** `lesson-prep fetch <ids> --out <folder>`: downloads videos with the installed yt-dlp. */
export async function fetchVideos(
  ids: readonly string[],
  options: FetchOptions,
): Promise<FetchResult> {
  const log = options.log ?? (() => undefined);
  const ytDlp = options.ytDlp ?? 'yt-dlp';
  const wrong = ids.filter((id) => !VIDEO_ID.test(id));
  if (wrong.length > 0) {
    throw new FetchError(`Это не id видео YouTube: ${wrong.join(', ')}`);
  }
  await mkdir(options.out, { recursive: true });
  const downloaded: string[] = [];
  const skipped: string[] = [];
  for (const id of ids) {
    if (existsSync(path.join(options.out, `${id}.mp4`))) {
      skipped.push(id);
      log(`  ${id}: уже скачано`);
      continue;
    }
    log(`  ${id}: скачиваю…`);
    const result = await options
      .run(ytDlp, ytDlpArgs(id, options.out), { showProgress: true })
      .catch((err: unknown) => {
        throw new FetchError(
          `Не удалось запустить ${ytDlp} (${err instanceof Error ? err.message : String(err)}). Установите yt-dlp: https://github.com/yt-dlp/yt-dlp`,
        );
      });
    if (result.code !== 0) {
      throw new FetchError(`${ytDlp} завершился с кодом ${result.code} для ${id}`);
    }
    downloaded.push(id);
  }
  return { downloaded, skipped };
}
