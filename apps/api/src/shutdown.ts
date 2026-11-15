import type { ServerType } from '@hono/node-server';
import { closeAll, type Closer } from './startup';

export interface SignalSource {
  once(event: 'SIGTERM' | 'SIGINT', listener: () => void): unknown;
}

export interface ShutdownOptions {
  readonly server: ServerType;
  /** Resources to release after the HTTP server has stopped (the database last). */
  readonly closers: readonly Closer[];
  readonly signals?: SignalSource;
  readonly exit?: (code: number) => void;
  /** How long in-flight requests may take before connections are cut. */
  readonly graceMs?: number;
}

const DEFAULT_GRACE_MS = 10_000;

function closeServer(server: ServerType, graceMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      if ('closeAllConnections' in server) {
        server.closeAllConnections();
      }
    }, graceMs);
    timer.unref();
    server.close((err) => {
      clearTimeout(timer);
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * On SIGTERM/SIGINT: stop accepting connections, let in-flight requests finish (up to
 * `graceMs`), close resources (DB), then exit. Returns the idempotent shutdown function.
 */
export function registerShutdown(options: ShutdownOptions): () => Promise<void> {
  const {
    server,
    closers,
    signals = process,
    exit = (code: number) => process.exit(code),
    graceMs = DEFAULT_GRACE_MS,
  } = options;

  let pending: Promise<void> | null = null;
  const run = async (): Promise<void> => {
    console.info('Shutting down');
    let ok = true;
    try {
      await closeServer(server, graceMs);
    } catch (err) {
      ok = false;
      console.error('Failed to close the HTTP server', err);
    }
    ok = (await closeAll(closers)) && ok;
    exit(ok ? 0 : 1);
  };
  const shutdown = (): Promise<void> => {
    pending ??= run();
    return pending;
  };

  signals.once('SIGTERM', () => void shutdown());
  signals.once('SIGINT', () => void shutdown());
  return shutdown;
}
