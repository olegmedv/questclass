import { lstat } from 'node:fs/promises';
import path from 'node:path';

/** File types a media directory may hold (HLS, MP4, pictures, sounds, subtitles, metadata). */
export const MEDIA_EXTENSIONS = [
  '.m3u8',
  '.ts',
  '.m4s',
  '.mp4',
  '.webp',
  '.png',
  '.jpg',
  '.mp3',
  '.ogg',
  '.vtt',
  '.json',
] as const;
export type MediaExtension = (typeof MEDIA_EXTENSIONS)[number];

/** Nesting limit inside a media directory (`480p/seg_0001.ts` is two segments). */
export const MAX_PATH_SEGMENTS = 4;
export const MAX_PATH_LENGTH = 200;

const DIR_SEGMENT = /^[a-z0-9_-]{1,64}$/;
const FILE_SEGMENT = /^[a-z0-9_-]{1,64}(\.[a-z0-9]{1,5})$/;

/** A relative path that does not name a file inside the media directory. */
export class UnsafePathError extends Error {
  constructor(readonly input: string) {
    super('Unsafe media path');
    this.name = 'UnsafePathError';
  }
}

export interface MediaPath {
  /** Validated segments, e.g. `['480p', 'seg_0001.ts']`. */
  readonly segments: readonly string[];
  /** `segments.join('/')`. */
  readonly relative: string;
  readonly extension: MediaExtension;
}

function isMediaExtension(value: string): value is MediaExtension {
  return (MEDIA_EXTENSIONS as readonly string[]).includes(value);
}

/**
 * Parses a relative media path as it comes from a URL: percent-decoded exactly once, then only
 * `[a-z0-9_-]` segments and a whitelisted extension on the last one are accepted. `..`,
 * absolute paths, drive letters, backslashes, empty segments, NUL and leftover `%` (double
 * encoding) are all rejected.
 */
export function parseMediaPath(raw: string): MediaPath {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    throw new UnsafePathError(raw);
  }
  if (decoded.length === 0 || decoded.length > MAX_PATH_LENGTH) {
    throw new UnsafePathError(raw);
  }
  const segments = decoded.split('/');
  if (segments.length > MAX_PATH_SEGMENTS) {
    throw new UnsafePathError(raw);
  }
  const file = segments.at(-1) ?? '';
  const match = FILE_SEGMENT.exec(file);
  const extension = match?.[1] ?? '';
  if (!match || !isMediaExtension(extension)) {
    throw new UnsafePathError(raw);
  }
  if (!segments.slice(0, -1).every((segment) => DIR_SEGMENT.test(segment))) {
    throw new UnsafePathError(raw);
  }
  return { segments, relative: segments.join('/'), extension };
}

function isNotFound(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * The absolute path of `raw` inside `root`, or `UnsafePathError`. Besides the syntax check of
 * `parseMediaPath`, no existing component below `root` may be a symbolic link (or a Windows
 * junction); components that do not exist yet are allowed (upload targets).
 */
export async function safePath(root: string, raw: string): Promise<string> {
  const { segments } = parseMediaPath(raw);
  const base = path.resolve(root);
  const target = path.join(base, ...segments);
  const relative = path.relative(base, target);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new UnsafePathError(raw);
  }
  let current = base;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new UnsafePathError(raw);
      }
    } catch (err) {
      if (isNotFound(err)) {
        break;
      }
      throw err;
    }
  }
  return target;
}
