import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import type { Context, Hono } from 'hono';
import { getMimeType, mimes } from 'hono/utils/mime';
import { notFound } from './http/errors';
import type { AppEnv } from './http/route';
import { parseRange } from './modules/media/stream';

/**
 * The built SPA (`apps/web/dist`), resolved next to this module: `apps/api/src` from sources and
 * `apps/api/dist` in the bundle both sit two levels below `apps/`. The production image keeps
 * the same layout (deploy/Dockerfile).
 */
export const WEB_ROOT = fileURLToPath(new URL('../../web/dist', import.meta.url));

const INDEX_FILE = 'index.html';
/** Vite's hashed bundles (`build.assetsDir: '_app'`): a changed file always gets a new name. */
const HASHED_DIR = '_app';

export const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';
/** The SPA document is revalidated on every navigation, so a new release is picked up at once. */
export const CACHE_DOCUMENT = 'no-cache';
/** Unhashed files (game art under /assets, fonts, icons) may change between releases. */
export const CACHE_PUBLIC = 'public, max-age=86400';

/** Hono's table lacks a few types the game assets use. */
const MIME_TYPES: Readonly<Record<string, string>> = {
  ...mimes,
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
};

/** The file under `root` a URL path names, or null (traversal, dot-files, NUL, backslashes). */
function resolveInRoot(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) {
    return null;
  }
  const segments = decoded.split('/').filter((segment) => segment !== '');
  if (segments.some((segment) => segment.startsWith('.'))) {
    return null;
  }
  const target = path.resolve(root, ...segments);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return target;
}

/** A path whose last segment has an extension asks for a file, never for the SPA document. */
function looksLikeFile(urlPath: string): boolean {
  const last = urlPath.slice(urlPath.lastIndexOf('/') + 1);
  return last.includes('.');
}

function isApiPath(urlPath: string): boolean {
  return urlPath === '/api' || urlPath.startsWith('/api/');
}

async function fileInfo(file: string) {
  try {
    const info = await stat(file);
    return info.isFile() ? info : null;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'ENAMETOOLONG') {
      return null;
    }
    throw err;
  }
}

function cacheControlFor(root: string, file: string): string {
  const relative = path.relative(root, file).split(path.sep);
  if (relative.length === 1 && relative[0] === INDEX_FILE) {
    return CACHE_DOCUMENT;
  }
  return relative[0] === HASHED_DIR ? CACHE_IMMUTABLE : CACHE_PUBLIC;
}

/** HTTP dates have a resolution of one second. */
function notModifiedSince(header: string | undefined, modified: Date): boolean {
  if (header === undefined) {
    return false;
  }
  const since = Date.parse(header);
  return !Number.isNaN(since) && Math.floor(modified.getTime() / 1000) * 1000 <= since;
}

async function sendFile(c: Context<AppEnv>, root: string, file: string): Promise<Response | null> {
  const info = await fileInfo(file);
  if (info === null) {
    return null;
  }
  const isDocument = path.relative(root, file) === INDEX_FILE;
  const headers: Record<string, string> = {
    'Content-Type': getMimeType(file, MIME_TYPES) ?? 'application/octet-stream',
    'Cache-Control': cacheControlFor(root, file),
    'Last-Modified': info.mtime.toUTCString(),
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    ...(isDocument && { 'X-Frame-Options': 'DENY' }),
  };
  const rangeHeader = c.req.header('range');
  if (
    rangeHeader === undefined &&
    notModifiedSince(c.req.header('if-modified-since'), info.mtime)
  ) {
    return c.body(null, 304, headers);
  }
  const size = info.size;
  const request = parseRange(rangeHeader, size);
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

/**
 * Serves the built SPA from `root` for every GET/HEAD outside `/api`: an existing file as is
 * (hashed `/_app/*` immutable, `index.html` revalidated, the rest cached for a day; Range and
 * If-Modified-Since honoured), any other path without an extension → `index.html`, so deep
 * links reach the client router. A missing file (`/assets/x.webp`, an old bundle) is a 404 and
 * never the document. Mounted after the API routes; it reads only files, never the database.
 */
export function mountStaticSite(app: Hono<AppEnv>, root: string): void {
  const base = path.resolve(root);
  if (!existsSync(path.join(base, INDEX_FILE))) {
    console.warn(`The web app is not built: ${path.join(base, INDEX_FILE)} is missing`);
  }
  app.get('*', async (c) => {
    const urlPath = new URL(c.req.url).pathname;
    if (isApiPath(urlPath)) {
      throw notFound();
    }
    const file = resolveInRoot(base, urlPath);
    const served = file === null ? null : await sendFile(c, base, file);
    if (served) {
      return served;
    }
    if (file === null || looksLikeFile(urlPath)) {
      throw notFound();
    }
    const document = await sendFile(c, base, path.join(base, INDEX_FILE));
    if (!document) {
      throw notFound();
    }
    return document;
  });
}
