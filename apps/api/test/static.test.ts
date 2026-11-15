import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, type ServerType } from '@hono/node-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { CACHE_ASSETS, CACHE_DOCUMENT, CACHE_IMMUTABLE, WEB_ROOT } from '../src/static';
import { createTempDir, createTestRuntime, removeDir, type TestRuntime } from './helpers/db';

const INDEX = '<!doctype html><title>КвестКласс</title><div id="root"></div>';
const BUNDLE = 'console.log("app");';
const SECRET = 'top-secret-outside-the-web-root';
const OGG = Buffer.from('OggS-0123456789');

let runtime: TestRuntime;
let tmp: string;
let webRoot: string;
let app: ReturnType<typeof createApp>['app'];

beforeAll(async () => {
  runtime = await createTestRuntime();
  tmp = createTempDir('qc-static-');
  webRoot = path.join(tmp, 'web');
  mkdirSync(path.join(webRoot, '_app'), { recursive: true });
  mkdirSync(path.join(webRoot, 'assets', 'game', 'audio'), { recursive: true });
  writeFileSync(path.join(webRoot, 'index.html'), INDEX);
  writeFileSync(path.join(webRoot, '_app', 'index-Dpg5PiNM.js'), BUNDLE);
  writeFileSync(path.join(webRoot, 'assets', 'game', 'hero.webp'), 'RIFF....WEBP');
  writeFileSync(path.join(webRoot, 'assets', 'game', 'audio', 'tap.ogg'), OGG);
  writeFileSync(path.join(webRoot, '.env'), 'NOT_PUBLIC=1');
  writeFileSync(path.join(tmp, 'secret.txt'), SECRET);
  const old = new Date('2026-01-01T00:00:00Z');
  utimesSync(path.join(webRoot, 'assets', 'game', 'hero.webp'), old, old);
  app = createApp(runtime.ctx, { webRoot }).app;
});

afterAll(async () => {
  await runtime.close();
  removeDir(tmp);
});

describe('the built SPA', () => {
  it('serves index.html at the root, revalidated on every navigation', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
    expect(res.headers.get('cache-control')).toBe(CACHE_DOCUMENT);
    expect(await res.text()).toBe(INDEX);
  });

  it('falls back to index.html for client routes (deep links)', async () => {
    for (const route of ['/admin', '/admin/users/3', '/tasks/12', '/login?as=admin', '/shop/']) {
      const res = await app.request(route);
      expect(res.status, route).toBe(200);
      expect(res.headers.get('cache-control'), route).toBe(CACHE_DOCUMENT);
      expect(await res.text(), route).toBe(INDEX);
    }
  });

  it('serves hashed bundles as immutable', async () => {
    const res = await app.request('/_app/index-Dpg5PiNM.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/javascript/);
    expect(res.headers.get('cache-control')).toBe(CACHE_IMMUTABLE);
    expect(await res.text()).toBe(BUNDLE);
  });

  it('serves game assets revalidated by ETag (the admin may replace them), not immutable', async () => {
    const res = await app.request('/assets/game/hero.webp');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toBe(CACHE_ASSETS);
    expect(res.headers.get('etag')).toMatch(/^W\/"b12-\d+"$/);
    expect(res.headers.get('last-modified')).toBeNull();
    const audio = await app.request('/assets/game/audio/tap.ogg');
    expect(audio.headers.get('content-type')).toBe('audio/ogg');
    expect(Buffer.from(await audio.arrayBuffer())).toEqual(OGG);
  });

  it('answers a missing file with 404, never with the document', async () => {
    for (const missing of ['/assets/game/nope.webp', '/_app/index-OLDHASH.js', '/favicon.ico']) {
      const res = await app.request(missing);
      expect(res.status, missing).toBe(404);
      expect(await res.text(), missing).not.toContain('<!doctype html>');
    }
  });

  it('keeps /api for the API: unknown API paths are a JSON 404', async () => {
    expect((await app.request('/api/health')).status).toBe(200);
    for (const apiPath of ['/api', '/api/', '/api/no-such-thing', '/api/admin/nothing.js']) {
      const res = await app.request(apiPath);
      expect(res.status, apiPath).toBe(404);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('not_found');
    }
  });

  it('serves only GET and HEAD', async () => {
    const head = await app.request('/assets/game/hero.webp', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe('12');
    expect(await head.text()).toBe('');
    expect((await app.request('/', { method: 'POST' })).status).toBe(404);
    expect((await app.request('/admin', { method: 'DELETE' })).status).toBe(404);
  });

  it('honours Range (audio elements seek with it)', async () => {
    const res = await app.request('/assets/game/audio/tap.ogg', {
      headers: { range: 'bytes=0-3' },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes 0-3/${OGG.length}`);
    expect(await res.text()).toBe('OggS');
    const beyond = await app.request('/assets/game/audio/tap.ogg', {
      headers: { range: 'bytes=999-' },
    });
    expect(beyond.status).toBe(416);
  });

  it('answers If-Modified-Since with 304 for an unchanged document or bundle', async () => {
    const first = await app.request('/_app/index-Dpg5PiNM.js');
    const since = first.headers.get('last-modified') ?? '';
    const res = await app.request('/_app/index-Dpg5PiNM.js', {
      headers: { 'if-modified-since': since },
    });
    expect(res.status).toBe(304);
    const changed = await app.request('/_app/index-Dpg5PiNM.js', {
      headers: { 'if-modified-since': new Date('2000-01-01T00:00:00Z').toUTCString() },
    });
    expect(changed.status).toBe(200);
  });

  it('revalidates a game asset by its ETag only: If-Modified-Since alone never gives 304', async () => {
    const first = await app.request('/assets/game/hero.webp');
    const etag = first.headers.get('etag') ?? '';
    const same = await app.request('/assets/game/hero.webp', {
      headers: { 'if-none-match': etag },
    });
    expect(same.status).toBe(304);
    const other = await app.request('/assets/game/hero.webp', {
      headers: { 'if-none-match': '"r12"' },
    });
    expect(other.status).toBe(200);
    // A browser that cached a replacement asks with its date: the built-in file is sent again.
    const dated = await app.request('/assets/game/hero.webp', {
      headers: { 'if-modified-since': new Date('2030-01-01T00:00:00Z').toUTCString() },
    });
    expect(dated.status).toBe(200);
  });

  it('is not served outside production unless a web root is given', async () => {
    const apiOnly = createApp(runtime.ctx).app;
    expect((await apiOnly.request('/')).status).toBe(404);
    expect((await apiOnly.request('/admin')).status).toBe(404);
  });

  it('defaults to apps/web/dist, the layout kept by the production image', () => {
    const expected = fileURLToPath(new URL('../../web/dist', import.meta.url));
    expect(path.resolve(WEB_ROOT)).toBe(path.resolve(expected));
  });
});

describe('paths outside the web root over real HTTP', () => {
  let server: ServerType;
  let port: number;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
        port = info.port;
        resolve();
      });
    });
  });

  afterAll(() => {
    server.close();
  });

  /** Sends the path exactly as written (fetch would normalise dot segments first). */
  function rawGet(rawPath: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, path: rawPath, method: 'GET' }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  it('never leaks files above the root or dot-files', async () => {
    const attempts = [
      '/../secret.txt',
      '/assets/../../secret.txt',
      '/%2e%2e/secret.txt',
      '/assets/%2e%2e%2f%2e%2e%2fsecret.txt',
      '/..%2fsecret.txt',
      '/..%5csecret.txt',
      '/assets%5c..%5c..%5csecret.txt',
      '/%00/secret.txt',
      '/.env',
      '/%2eenv',
    ];
    for (const attempt of attempts) {
      const res = await rawGet(attempt);
      expect(res.body, attempt).not.toContain(SECRET);
      expect(res.body, attempt).not.toContain('NOT_PUBLIC');
    }
  });

  it('serves the document for a deep link over real HTTP', async () => {
    const res = await rawGet('/admin/settings');
    expect(res.status).toBe(200);
    expect(res.body).toBe(INDEX);
  });
});
