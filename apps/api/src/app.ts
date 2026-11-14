import { Hono, type MiddlewareHandler } from 'hono';
import type { Config } from './config';
import { clientIpMiddleware, type TrustedProxiesSource } from './http/clientIp';
import { handleError, handleNotFound } from './http/errors';
import { sameOriginOnly } from './http/origin';
import { mountRoutes, type AppEnv, type RouteDef } from './http/route';
import { healthRoutes } from './modules/health/routes';

/** Dependencies shared by all modules; built once at startup (see startup.ts). */
export interface AppContext {
  readonly config: Config;
  /** Trusted reverse-proxy CIDRs used by `clientIp()`. */
  readonly trustedProxies: TrustedProxiesSource;
}

export interface BuiltApp {
  readonly app: Hono<AppEnv>;
  /** Every mounted route with its declared roles (used by the access-matrix test). */
  readonly routes: readonly RouteDef[];
}

export interface BuildOptions {
  /** Request middlewares that run after the common guards and before routes (e.g. auth). */
  readonly middlewares?: readonly MiddlewareHandler<AppEnv>[];
}

/** All API routes. Each module adds its line here. */
function collectRoutes(_ctx: AppContext): RouteDef[] {
  return [...healthRoutes()];
}

/** Request middlewares contributed by modules (session → actor, etc.). */
function collectMiddlewares(_ctx: AppContext): MiddlewareHandler<AppEnv>[] {
  return [];
}

/** Assembles a Hono app from explicit routes; used directly by tests of the HTTP layer. */
export function buildApp(
  ctx: AppContext,
  routes: readonly RouteDef[],
  options: BuildOptions = {},
): BuiltApp {
  const app = new Hono<AppEnv>();
  app.onError(handleError);
  app.notFound(handleNotFound);
  app.use('*', async (c, next) => {
    c.set('actor', null);
    await next();
  });
  app.use('*', clientIpMiddleware(ctx.trustedProxies));
  app.use('/api/*', sameOriginOnly());
  for (const middleware of options.middlewares ?? []) {
    app.use('/api/*', middleware);
  }
  mountRoutes(app, routes);
  return { app, routes: Object.freeze([...routes]) };
}

/** The production app: every module's routes and middlewares. */
export function createApp(ctx: AppContext): BuiltApp {
  return buildApp(ctx, collectRoutes(ctx), { middlewares: collectMiddlewares(ctx) });
}
