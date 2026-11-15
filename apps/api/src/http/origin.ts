import type { MiddlewareHandler } from 'hono';
import { forbidden } from './errors';

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

/**
 * CSRF guard for state-changing requests: a browser request from another site is rejected.
 * Non-browser clients (CLI, import tool) send neither `Origin` nor `Sec-Fetch-Site` and pass.
 * Only hosts are compared, because TLS terminates at the reverse proxy.
 */
export function sameOriginOnly(): MiddlewareHandler {
  return async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method)) {
      if (c.req.header('sec-fetch-site') === 'cross-site') {
        throw forbidden('Запрос с другого сайта отклонён', 'cross_origin');
      }
      const origin = c.req.header('origin');
      if (origin !== undefined && hostOf(origin) !== new URL(c.req.url).host) {
        throw forbidden('Запрос с другого сайта отклонён', 'cross_origin');
      }
    }
    await next();
  };
}
