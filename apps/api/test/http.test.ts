import { serve, type ServerType } from '@hono/node-server';
import { DEFAULT_TRUSTED_PROXIES } from '@questclass/shared/net';
import { Hono, type MiddlewareHandler } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp, type HttpContext } from '../src/app';
import { DEFAULT_BODY_LIMIT } from '../src/http/bodyLimit';
import { clientIp } from '../src/http/clientIp';
import { conflict } from '../src/http/errors';
import { readJson, readQuery } from '../src/http/validate';
import { mountRoutes, route, type AppEnv, type RouteDef } from '../src/http/route';

interface ErrorJson {
  error: { code: string; message: string; details?: { path: string; message: string }[] };
}

function testCtx(trusted: readonly string[] = DEFAULT_TRUSTED_PROXIES): HttpContext {
  return { trustedProxies: () => trusted };
}

const probeRoutes: RouteDef[] = [
  route({
    method: 'POST',
    path: '/api/probe/echo',
    roles: ['public'],
    handler: async (c) => {
      const body = await readJson(c, z.object({ name: z.string().min(1) }));
      return c.json({ name: body.name });
    },
  }),
  route({
    method: 'GET',
    path: '/api/probe/page',
    roles: ['public'],
    handler: (c) => {
      const query = readQuery(c, z.object({ limit: z.coerce.number().int().positive() }));
      return c.json(query);
    },
  }),
  route({
    method: 'POST',
    path: '/api/probe/raw',
    roles: ['public'],
    handler: async (c) => c.json({ bytes: (await c.req.arrayBuffer()).byteLength }),
  }),
  route({
    method: 'POST',
    path: '/api/probe/tiny',
    roles: ['public'],
    bodyLimit: 10,
    handler: async (c) => c.json({ bytes: (await c.req.arrayBuffer()).byteLength }),
  }),
  route({
    method: 'GET',
    path: '/api/probe/conflict',
    roles: ['public'],
    handler: () => {
      throw conflict('already_done', 'Уже сделано');
    },
  }),
  route({
    method: 'GET',
    path: '/api/probe/crash',
    roles: ['public'],
    handler: () => {
      throw new Error('secret internal detail');
    },
  }),
  route({
    method: 'GET',
    path: '/api/probe/ip',
    roles: ['public'],
    handler: (c) => c.json({ ip: clientIp(c) }),
  }),
  route({
    method: 'GET',
    path: '/api/probe/admin-only',
    roles: ['admin'],
    handler: (c) => c.json({ ok: true }),
  }),
];

/** Test-only auth stand-in: the `x-test-role` header becomes the request actor. */
const fakeAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const role = c.req.header('x-test-role');
  if (role === 'admin' || role === 'learner' || role === 'import') {
    c.set('actor', { role, id: 1 });
  }
  await next();
};

function probeApp(trusted?: readonly string[]) {
  return buildApp(testCtx(trusted), probeRoutes, { middlewares: [fakeAuth] }).app;
}

async function errorOf(res: Response): Promise<ErrorJson['error']> {
  const body = (await res.json()) as ErrorJson;
  return body.error;
}

function withPeer(remoteAddress: string): AppEnv['Bindings'] {
  return { incoming: { socket: { remoteAddress } } } as unknown as AppEnv['Bindings'];
}

describe('error responses', () => {
  it('uses the common JSON shape for expected errors', async () => {
    const res = await probeApp().request('/api/probe/conflict');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: 'already_done', message: 'Уже сделано' } });
  });

  it('hides internal details of unexpected errors', async () => {
    const res = await probeApp().request('/api/probe/crash');
    expect(res.status).toBe(500);
    const error = await errorOf(res);
    expect(error.code).toBe('internal_error');
    expect(JSON.stringify(error)).not.toContain('secret internal detail');
  });

  it('answers unknown API paths with a JSON 404', async () => {
    const res = await probeApp().request('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect((await errorOf(res)).code).toBe('not_found');
  });
});

describe('validation', () => {
  const post = (body: string) =>
    probeApp().request('/api/probe/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });

  it('accepts a valid body', async () => {
    const res = await post(JSON.stringify({ name: 'Саша' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Саша' });
  });

  it('rejects a body that fails the zod schema with 400 and issue details', async () => {
    const res = await post(JSON.stringify({ name: '' }));
    expect(res.status).toBe(400);
    const error = await errorOf(res);
    expect(error.code).toBe('validation_failed');
    expect(error.details?.[0]?.path).toBe('name');
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await post('{not json');
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('invalid_json');
  });

  it('validates the query string', async () => {
    const ok = await probeApp().request('/api/probe/page?limit=20');
    expect(await ok.json()).toEqual({ limit: 20 });
    const bad = await probeApp().request('/api/probe/page?limit=-1');
    expect(bad.status).toBe(400);
    expect((await errorOf(bad)).code).toBe('validation_failed');
  });
});

describe('body limit', () => {
  it('accepts a body of exactly 1 MB and rejects a larger one with 413', async () => {
    const app = probeApp();
    const atLimit = await app.request('/api/probe/raw', {
      method: 'POST',
      body: new Uint8Array(DEFAULT_BODY_LIMIT),
    });
    expect(atLimit.status).toBe(200);

    const over = await app.request('/api/probe/raw', {
      method: 'POST',
      body: new Uint8Array(DEFAULT_BODY_LIMIT + 1),
    });
    expect(over.status).toBe(413);
    expect((await errorOf(over)).code).toBe('payload_too_large');
  });

  it('enforces the limit for streamed bodies without Content-Length', async () => {
    const chunk = new Uint8Array(256 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= DEFAULT_BODY_LIMIT + chunk.length) {
          controller.close();
          return;
        }
        sent += chunk.length;
        controller.enqueue(chunk);
      },
    });
    const req = new Request('http://localhost/api/probe/raw', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    });
    const res = await probeApp().request(req);
    expect(res.status).toBe(413);
  });

  it('honours a per-route limit', async () => {
    const app = probeApp();
    const ok = await app.request('/api/probe/tiny', { method: 'POST', body: '0123456789' });
    expect(ok.status).toBe(200);
    const over = await app.request('/api/probe/tiny', { method: 'POST', body: '0123456789A' });
    expect(over.status).toBe(413);
  });
});

describe('cross-site protection', () => {
  const post = (headers: Record<string, string>) =>
    probeApp().request('http://localhost/api/probe/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ name: 'x' }),
    });

  it('rejects a mutating request with a foreign Origin', async () => {
    const res = await post({ origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe('cross_origin');
  });

  it('rejects Sec-Fetch-Site: cross-site even without Origin', async () => {
    const res = await post({ 'sec-fetch-site': 'cross-site' });
    expect(res.status).toBe(403);
  });

  it('rejects an opaque (null) Origin', async () => {
    const res = await post({ origin: 'null' });
    expect(res.status).toBe(403);
  });

  it('allows same-origin browser requests regardless of scheme behind TLS proxy', async () => {
    const same = await post({ origin: 'https://localhost', 'sec-fetch-site': 'same-origin' });
    expect(same.status).toBe(200);
  });

  it('allows non-browser clients that send no Origin', async () => {
    expect((await post({})).status).toBe(200);
  });

  it('does not restrict safe methods', async () => {
    const res = await probeApp().request('http://localhost/api/probe/ip', {
      headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
    });
    expect(res.status).toBe(200);
  });
});

describe('clientIp', () => {
  const ipOf = async (peer: string, xff?: string, trusted?: readonly string[]) => {
    const headers: Record<string, string> = xff === undefined ? {} : { 'x-forwarded-for': xff };
    const res = await probeApp(trusted).request('/api/probe/ip', { headers }, withPeer(peer));
    return ((await res.json()) as { ip: string }).ip;
  };

  it('ignores a forged X-Forwarded-For from an untrusted peer', async () => {
    expect(await ipOf('203.0.113.7', '198.51.100.1')).toBe('203.0.113.7');
  });

  it('uses X-Forwarded-For from a proxy in the default private ranges', async () => {
    expect(await ipOf('172.18.0.2', '198.51.100.9')).toBe('198.51.100.9');
    expect(await ipOf('::ffff:10.1.2.3', '198.51.100.9')).toBe('198.51.100.9');
  });

  it('takes the right-most untrusted hop, so a client cannot prepend a fake address', async () => {
    expect(await ipOf('172.18.0.2', '1.1.1.1, 198.51.100.9')).toBe('198.51.100.9');
    expect(await ipOf('172.18.0.2', '198.51.100.9, 192.168.1.10')).toBe('198.51.100.9');
  });

  it('falls back to the peer when the header is malformed', async () => {
    expect(await ipOf('172.18.0.2', 'not-an-ip')).toBe('172.18.0.2');
  });

  it('follows the configured trusted list', async () => {
    expect(await ipOf('172.18.0.2', '198.51.100.9', ['203.0.113.0/24'])).toBe('172.18.0.2');
    expect(await ipOf('203.0.113.7', '198.51.100.9', ['203.0.113.0/24'])).toBe('198.51.100.9');
  });

  describe('over a real socket', () => {
    let server: ServerType | undefined;
    afterEach(() => {
      server?.close();
      server = undefined;
    });

    const start = (trusted?: readonly string[]) =>
      new Promise<string>((resolve) => {
        const app = probeApp(trusted);
        server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
          resolve(`http://127.0.0.1:${info.port}`);
        });
      });

    it('ignores X-Forwarded-For from loopback with the default list', async () => {
      const base = await start();
      const res = await fetch(`${base}/api/probe/ip`, {
        headers: { 'x-forwarded-for': '198.51.100.1' },
      });
      expect(((await res.json()) as { ip: string }).ip).toBe('127.0.0.1');
    });

    it('honours X-Forwarded-For when loopback is configured as trusted', async () => {
      const base = await start(['127.0.0.1']);
      const res = await fetch(`${base}/api/probe/ip`, {
        headers: { 'x-forwarded-for': '198.51.100.1' },
      });
      expect(((await res.json()) as { ip: string }).ip).toBe('198.51.100.1');
    });
  });
});

describe('route roles', () => {
  it('rejects anonymous callers of a non-public route with 401', async () => {
    const res = await probeApp().request('/api/probe/admin-only');
    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe('unauthenticated');
  });

  it('rejects callers with another role with 403 and admits the declared role', async () => {
    const app = probeApp();
    const asLearner = await app.request('/api/probe/admin-only', {
      headers: { 'x-test-role': 'learner' },
    });
    expect(asLearner.status).toBe(403);
    const asAdmin = await app.request('/api/probe/admin-only', {
      headers: { 'x-test-role': 'admin' },
    });
    expect(asAdmin.status).toBe(200);
  });

  it('refuses route declarations without roles or with ambiguous roles', () => {
    const handler: RouteDef['handler'] = (c) => c.json({});
    expect(() => route({ method: 'GET', path: '/api/x', roles: [], handler })).toThrow();
    expect(() =>
      route({ method: 'GET', path: '/api/x', roles: ['public', 'admin'], handler }),
    ).toThrow();
    expect(() =>
      route({ method: 'GET', path: '/api/x', roles: ['admin', 'admin'], handler }),
    ).toThrow();
    expect(() => route({ method: 'GET', path: '/x', roles: ['admin'], handler })).toThrow();
  });

  it('refuses to mount the same method and path twice', () => {
    const def = route({
      method: 'GET',
      path: '/api/x',
      roles: ['admin'],
      handler: (c) => c.json({}),
    });
    expect(() => mountRoutes(new Hono<AppEnv>(), [def, def])).toThrow(/twice/);
  });
});
