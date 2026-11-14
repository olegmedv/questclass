import { DEFAULT_TRUSTED_PROXIES } from '@questclass/shared/net';
import type { AppContext } from './app';
import type { Config } from './config';

/** Releases a resource on shutdown (closed in reverse order of registration). */
export type Closer = () => void | Promise<void>;

/** A step that must complete before the server accepts requests. */
export type StartupHook = (ctx: AppContext) => void | Promise<void>;

/** Ordered startup hooks: migrations, seeds, scheduler. Each module adds its line here. */
const STARTUP_HOOKS: readonly StartupHook[] = [];

export interface Runtime {
  readonly ctx: AppContext;
  readonly closers: readonly Closer[];
}

/**
 * Prepares everything the server needs before it accepts requests: opens resources and
 * runs the startup hooks in order. On failure, whatever was already opened is closed again.
 */
export async function startup(config: Config): Promise<Runtime> {
  const closers: Closer[] = [];
  try {
    const ctx: AppContext = {
      config,
      trustedProxies: () => DEFAULT_TRUSTED_PROXIES,
    };
    for (const hook of STARTUP_HOOKS) {
      await hook(ctx);
    }
    return { ctx, closers };
  } catch (err) {
    await closeAll(closers);
    throw err;
  }
}

/** Runs closers in reverse order; returns false if any of them failed. */
export async function closeAll(closers: readonly Closer[]): Promise<boolean> {
  let ok = true;
  for (const close of [...closers].reverse()) {
    try {
      await close();
    } catch (err) {
      ok = false;
      console.error('Failed to close a resource', err);
    }
  }
  return ok;
}
