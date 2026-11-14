// A throwaway installation for e2e: the built API on a temporary DATA_DIR and the built SPA
// served by `vite preview`, which proxies /api to that API (same origin, like production).
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

export const REPO_DIR = fileURLToPath(new URL('../../', import.meta.url));
const API_ENTRY = join(REPO_DIR, 'apps/api/dist/index.js');
const WEB_DIR = join(REPO_DIR, 'apps/web');
const HOST = '127.0.0.1';

export interface Stack {
  /** Origin of the SPA (and, through the proxy, of the API). */
  readonly baseURL: string;
  /** The API itself, for fixtures that talk to it directly. */
  readonly apiURL: string;
  readonly dataDir: string;
  /** One-time setup token printed by a fresh API (null once an admin exists). */
  readonly setupToken: string | null;
  stop(): Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

/** Starts the API and resolves once it listens; collects the setup token from its log. */
function startApi(
  port: number,
  dataDir: string,
): Promise<{ child: ChildProcess; token: string | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [API_ENTRY], {
      cwd: REPO_DIR,
      env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    let token: string | null = null;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`API did not start within 20 s. Log:\n${log}`));
    }, 20_000);
    const onData = (chunk: Buffer) => {
      log += chunk.toString();
      token ??= /setup token: (\S+)/.exec(log)?.[1] ?? null;
      if (/listening on port/.test(log)) {
        clearTimeout(timer);
        resolve({ child, token });
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`API exited with code ${code}. Log:\n${log}`));
    });
  });
}

function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    child.once('exit', () => resolve());
    child.kill();
  });
}

export async function startStack(): Promise<Stack> {
  if (!existsSync(API_ENTRY) || !existsSync(join(WEB_DIR, 'dist/index.html'))) {
    throw new Error('Build the app first: `pnpm build` (or run `pnpm e2e`, which builds).');
  }
  const dataDir = mkdtempSync(join(tmpdir(), 'qc-e2e-'));
  const apiPort = await freePort();
  const { child, token } = await startApi(apiPort, dataDir);
  const apiURL = `http://${HOST}:${apiPort}`;
  try {
    const webPort = await freePort();
    const web = await preview({
      root: WEB_DIR,
      configFile: join(WEB_DIR, 'vite.config.ts'),
      logLevel: 'error',
      preview: {
        host: HOST,
        port: webPort,
        strictPort: true,
        proxy: { '/api': apiURL },
      },
    });
    return {
      baseURL: `http://${HOST}:${webPort}`,
      apiURL,
      dataDir,
      setupToken: token,
      async stop() {
        await new Promise<void>((resolve) => web.httpServer.close(() => resolve()));
        await stopChild(child);
        rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      },
    };
  } catch (err) {
    await stopChild(child);
    rmSync(dataDir, { recursive: true, force: true });
    throw err;
  }
}
