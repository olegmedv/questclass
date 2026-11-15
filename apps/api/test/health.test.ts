import { EventEmitter } from 'node:events';
import path from 'node:path';
import { serve, type ServerType } from '@hono/node-server';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { buildApp, createApp } from '../src/app';
import { ConfigError, DEFAULT_PORT, loadConfig } from '../src/config';
import { route } from '../src/http/route';
import { registerShutdown } from '../src/shutdown';
import { createTestRuntime, type TestRuntime } from './helpers/db';

const runtimes: TestRuntime[] = [];
afterAll(async () => {
  for (const runtime of runtimes) {
    await runtime.close();
  }
});

async function testRuntime() {
  const runtime = await createTestRuntime();
  runtimes.push(runtime);
  return runtime;
}

function listen(fetchHandler: Parameters<typeof serve>[0]['fetch']) {
  return new Promise<{ server: ServerType; base: string }>((resolve) => {
    const server = serve({ fetch: fetchHandler, port: 0, hostname: '127.0.0.1' }, (info) => {
      resolve({ server, base: `http://127.0.0.1:${info.port}` });
    });
  });
}

describe('GET /api/health', () => {
  it('answers 200 without a session', async () => {
    const { app } = createApp((await testRuntime()).ctx);
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('is served over HTTP by the real server', async () => {
    const { app } = createApp((await testRuntime()).ctx);
    const { server, base } = await listen(app.fetch);
    try {
      const res = await fetch(`${base}/api/health`);
      expect(res.status).toBe(200);
    } finally {
      server.close();
    }
  });

  it('is registered in the route registry as public', async () => {
    const { routes } = createApp((await testRuntime()).ctx);
    const health = routes.find((r) => r.path === '/api/health' && r.method === 'GET');
    expect(health?.roles).toEqual(['public']);
    expect(routes.every((r) => r.roles.length > 0)).toBe(true);
  });
});

describe('launch configuration', () => {
  it('reads only PORT, DATA_DIR and NODE_ENV', () => {
    const config = loadConfig(
      {
        PORT: '9090',
        DATA_DIR: '/srv/qc',
        NODE_ENV: 'production',
        ADMIN_PASSWORD: 'ignored',
        OPENAI_API_KEY: 'ignored',
        TZ: 'UTC',
      },
      '/',
    );
    expect(Object.keys(config).sort()).toEqual(['dataDir', 'isProduction', 'nodeEnv', 'port']);
    expect(config).toMatchObject({ port: 9090, nodeEnv: 'production', isProduction: true });
    expect(config.dataDir).toBe(path.resolve('/', '/srv/qc'));
    expect(JSON.stringify(config)).not.toContain('ignored');
  });

  it('defaults to port 8080 and a local data directory in development', () => {
    const config = loadConfig({}, '/work');
    expect(config.port).toBe(DEFAULT_PORT);
    expect(config.nodeEnv).toBe('development');
    expect(config.dataDir).toBe(path.resolve('/work', '.data'));
  });

  it('requires DATA_DIR in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(ConfigError);
  });

  it('rejects invalid values', () => {
    expect(() => loadConfig({ PORT: 'eighty' })).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: '70000' })).toThrow(ConfigError);
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow(ConfigError);
  });
});

describe('graceful shutdown on SIGTERM', () => {
  let server: ServerType | undefined;
  afterEach(() => {
    if (server?.listening) {
      server.close();
    }
    server = undefined;
  });

  it('lets in-flight requests finish, closes HTTP, then resources, then exits 0', async () => {
    let releaseSlow: () => void = () => undefined;
    const slowGate = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    const slow = route({
      method: 'GET',
      path: '/api/slow',
      roles: ['public'],
      handler: async (c) => {
        await slowGate;
        return c.json({ done: true });
      },
    });
    const { app } = buildApp((await testRuntime()).ctx, [slow]);
    const started = await listen(app.fetch);
    server = started.server;

    const events: string[] = [];
    const signals = new EventEmitter();
    const exitCodes: number[] = [];
    const shutdown = registerShutdown({
      server,
      closers: [() => void events.push('db closed'), () => void events.push('cache closed')],
      signals,
      exit: (code) => exitCodes.push(code),
    });

    const inFlight = fetch(`${started.base}/api/slow`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    signals.emit('SIGTERM');
    releaseSlow();

    const res = await inFlight;
    expect(res.status).toBe(200);
    await shutdown();

    expect(server.listening).toBe(false);
    await expect(fetch(`${started.base}/api/health`)).rejects.toThrow();
    // Resources close in reverse order of registration: the database last.
    expect(events).toEqual(['cache closed', 'db closed']);
    expect(exitCodes).toEqual([0]);
  });

  it('exits with code 1 when a resource fails to close', async () => {
    const { app } = createApp((await testRuntime()).ctx);
    server = (await listen(app.fetch)).server;
    const signals = new EventEmitter();
    const exitCodes: number[] = [];
    const shutdown = registerShutdown({
      server,
      closers: [
        () => {
          throw new Error('disk gone');
        },
      ],
      signals,
      exit: (code) => exitCodes.push(code),
    });
    signals.emit('SIGTERM');
    await shutdown();
    expect(exitCodes).toEqual([1]);
  });
});
