import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { Context } from 'hono';
import { notFound } from '../../http/errors';
import type { AppEnv } from '../../http/route';
import type { MediaExtension } from './safePath';

const CONTENT_TYPES: Readonly<Record<MediaExtension, string>> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.vtt': 'text/vtt; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

/** Inclusive byte range of a file. */
export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

export type RangeRequest =
  | { readonly kind: 'full' }
  | { readonly kind: 'partial'; readonly range: ByteRange }
  | { readonly kind: 'unsatisfiable' };

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

/**
 * Interprets a `Range` header for a file of `size` bytes (RFC 9110 §14). Only a single byte
 * range is honoured; several ranges or a malformed header are ignored (the whole file is sent),
 * which the RFC allows.
 */
export function parseRange(header: string | undefined, size: number): RangeRequest {
  const match = header === undefined ? null : SINGLE_RANGE.exec(header.trim());
  if (!match) {
    return { kind: 'full' };
  }
  const [, first = '', last = ''] = match;
  if (first === '' && last === '') {
    return { kind: 'full' };
  }
  if (first === '') {
    // Suffix range: the last N bytes.
    const suffix = Number(last);
    if (suffix === 0 || size === 0) {
      return { kind: 'unsatisfiable' };
    }
    return { kind: 'partial', range: { start: Math.max(0, size - suffix), end: size - 1 } };
  }
  const start = Number(first);
  if (start >= size) {
    return { kind: 'unsatisfiable' };
  }
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1);
  if (end < start) {
    return { kind: 'full' };
  }
  return { kind: 'partial', range: { start, end } };
}

export interface StreamOptions {
  readonly extension: MediaExtension;
}

/** Playlists may change on re-import; segments and pictures never do. */
function cacheControl(extension: MediaExtension): string {
  return extension === '.m3u8' ? 'private, no-cache' : 'private, max-age=86400';
}

/**
 * Answers with the file at `file` (already checked with `safePath`), streamed from disk:
 * `Range` → 206 with exactly the requested bytes, an unsatisfiable range → 416, otherwise 200.
 * A missing file or a directory → 404. HEAD gets the headers only (no file is opened).
 */
export async function streamFile(
  c: Context<AppEnv>,
  file: string,
  options: StreamOptions,
): Promise<Response> {
  let size: number;
  let modified: Date;
  try {
    const info = await stat(file);
    if (!info.isFile()) {
      throw notFound();
    }
    size = info.size;
    modified = info.mtime;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw notFound();
    }
    throw err;
  }

  const headers: Record<string, string> = {
    'Content-Type': CONTENT_TYPES[options.extension],
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheControl(options.extension),
    'Last-Modified': modified.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
  };
  const request = parseRange(c.req.header('range'), size);
  if (request.kind === 'unsatisfiable') {
    return c.body(null, 416, { ...headers, 'Content-Range': `bytes */${size}` });
  }
  const range = request.kind === 'partial' ? request.range : { start: 0, end: size - 1 };
  const length = size === 0 ? 0 : range.end - range.start + 1;
  const status = request.kind === 'partial' ? 206 : 200;
  const responseHeaders: Record<string, string> = {
    ...headers,
    'Content-Length': String(length),
    ...(request.kind === 'partial' && {
      'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
    }),
  };
  if (c.req.raw.method === 'HEAD' || length === 0) {
    return c.body(null, status, responseHeaders);
  }
  const body = Readable.toWeb(
    createReadStream(file, { start: range.start, end: range.end }),
  ) as ReadableStream<Uint8Array>;
  return c.body(body, status, responseHeaders);
}
