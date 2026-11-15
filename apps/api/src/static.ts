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
/** Built-in game files (`public/assets`): the admin may replace any of them (FEAT-059). */
const ASSETS_PREFIX = '/assets/';

export const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';
/** The SPA document is revalidated on every navigation, so a new release is picked up at once. */
export const CACHE_DOCUMENT = 'no-cache';
/** Other unhashed files may change between releases. */
export const CACHE_PUBLIC = 'public, max-age=86400';
/**
 * Game files under /assets are revalidated (ETag → 304): a replacement made in «Оформление» or
 * the built-in file put back shows on the next load, never a day later.
 */
export const CACHE_ASSETS = 'no-cache';

/** A replacement of a built-in file: sent instead of it, at the same URL. */
export interface ServedReplacement {
  readonly file: string;
  /** e.g. `.png` — the content type follows the replacement, not the requested name. */
  readonly extension: string;
  readonly etag: string;
}

/** `game/x.webp` (the path under /assets) → its replacement, if the admin made one. */
export type AssetReplacements = (file: string) => ServedReplacement | undefined;

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

/** `If-None-Match: "a", W/"b"` contains the given validator (weak comparison). */
function matchesEtag(header: string | undefined, etag: string): boolean {
  if (header === undefined) {
    return false;
  }
  const bare = (tag: string) => tag.trim().replace(/^W\//, '');
  return header.split(',').some((tag) => tag.trim() === '*' || bare(tag) === bare(etag));
}

interface SendOptions {
  /** Revalidate by ETag only (game files): `If-Modified-Since` is ignored, no Last-Modified. */
  readonly etag?: (size: number, mtime: Date) => string;
  readonly cacheControl?: string;
  /** Content type by this extension instead of the file's own. */
  readonly extension?: string;
}

/** HTTP dates have a resolution of one second. */
function notModifiedSince(header: string | undefined, modified: Date): boolean {
  if (header === undefined) {
    return false;
  }
  const since = Date.parse(header);
  return !Number.isNaN(since) && Math.floor(modified.getTime() / 1000) * 1000 <= since;
}

async function sendFile(
  c: Context<AppEnv>,
  root: string,
  file: string,
  options: SendOptions = {},
): Promise<Response | null> {
  const info = await fileInfo(file);
  if (info === null) {
    return null;
  }
  const isDocument = path.relative(root, file) === INDEX_FILE;
  const typed = options.extension === undefined ? file : `file${options.extension}`;
  const etag = options.etag?.(info.size, info.mtime);
  const headers: Record<string, string> = {
    'Content-Type': getMimeType(typed, MIME_TYPES) ?? 'application/octet-stream',
    'Cache-Control': options.cacheControl ?? cacheControlFor(root, file),
    ...(etag === undefined ? { 'Last-Modified': info.mtime.toUTCString() } : { ETag: etag }),
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    ...(isDocument && { 'X-Frame-Options': 'DENY' }),
  };
  const rangeHeader = c.req.header('range');
  const notModified =
    etag === undefined
      ? notModifiedSince(c.req.header('if-modified-since'), info.mtime)
      : matchesEtag(c.req.header('if-none-match'), etag);
  if (rangeHeader === undefined && notModified) {
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

/** Sends a replacement of a game file with the game files' cache rules; null if it is gone. */
export function sendReplacement(
  c: Context<AppEnv>,
  replacement: ServedReplacement,
): Promise<Response | null> {
  return sendFile(c, path.dirname(replacement.file), replacement.file, {
    cacheControl: CACHE_ASSETS,
    etag: () => replacement.etag,
    extension: replacement.extension,
  });
}

/** Built-in game file: a weak validator of its size and time (a new release changes it). */
const builtinEtag = (size: number, mtime: Date): string => `W/"b${size}-${mtime.getTime()}"`;

/** The path under /assets a URL names (`/assets/game/x.webp` → `game/x.webp`), or null. */
function assetPathOf(urlPath: string): string | null {
  if (!urlPath.startsWith(ASSETS_PREFIX)) {
    return null;
  }
  try {
    return decodeURIComponent(urlPath.slice(ASSETS_PREFIX.length));
  } catch {
    return null;
  }
}

/**
 * Serves the built SPA from `root` for every GET/HEAD outside `/api`: an existing file as is
 * (hashed `/_app/*` immutable, `index.html` and game files under `/assets` revalidated, the rest
 * cached for a day; Range, If-Modified-Since and — for game files — If-None-Match honoured), any
 * other path without an extension → `index.html`, so deep links reach the client router. A game
 * file the admin replaced is answered with the replacement at the same URL (`replacements`, read
 * from memory). A missing file (`/assets/x.webp`, an old bundle) is a 404 and never the document.
 * Mounted after the API routes.
 */
export function mountStaticSite(
  app: Hono<AppEnv>,
  root: string,
  replacements?: AssetReplacements,
): void {
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
    const asset = file === null ? null : assetPathOf(urlPath);
    if (asset !== null) {
      const replacement = replacements?.(asset);
      const replaced = replacement && (await sendReplacement(c, replacement));
      if (replaced) {
        return replaced;
      }
    }
    const served =
      file === null
        ? null
        : await sendFile(
            c,
            base,
            file,
            asset === null ? {} : { cacheControl: CACHE_ASSETS, etag: builtinEtag },
          );
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
