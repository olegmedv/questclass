import { Hono, type MiddlewareHandler } from 'hono';
import type { Config } from './config';
import type { Db } from './db/client';
import { clientIpMiddleware, type TrustedProxiesSource } from './http/clientIp';
import { handleError, handleNotFound } from './http/errors';
import { sameOriginOnly } from './http/origin';
import { mountRoutes, type AppEnv, type RouteDef } from './http/route';
import { auditRoutes } from './modules/audit/routes';
import type { AuditService } from './modules/audit/service';
import { authMiddleware, authRoutes } from './modules/auth/routes';
import type { AuthService } from './modules/auth/service';
import { ledgerRoutes } from './modules/ledger/routes';
import { progressRoutes } from './modules/progress/routes';
import type { ProgressService } from './modules/progress/service';
import { questionsRoutes } from './modules/questions/routes';
import type { QuestionsService } from './modules/questions/service';
import type { LedgerService } from './modules/ledger/service';
import type { Keyring } from './modules/settings/crypto';
import { settingsRoutes } from './modules/settings/routes';
import type { SettingsService } from './modules/settings/service';
import { subjectsRoutes } from './modules/subjects/routes';
import type { SubjectsService } from './modules/subjects/service';
import { tasksRoutes } from './modules/tasks/routes';
import type { TasksService } from './modules/tasks/service';
import { usersRoutes } from './modules/users/routes';
import type { UsersService } from './modules/users/service';
import { healthRoutes } from './modules/health/routes';
import type { TaskTypeRegistry } from './task-types/registry';

/** Dependencies shared by all modules; built once at startup (see startup.ts). */
export interface AppContext {
  readonly config: Config;
  readonly db: Db;
  readonly audit: AuditService;
  /** Keys derived from DATA_DIR/master.key. */
  readonly keyring: Keyring;
  readonly settings: SettingsService;
  readonly users: UsersService;
  readonly auth: AuthService;
  readonly ledger: LedgerService;
  /** Task type plugins of this runtime. */
  readonly taskTypes: TaskTypeRegistry;
  readonly subjects: SubjectsService;
  readonly tasks: TasksService;
  readonly questions: QuestionsService;
  readonly progress: ProgressService;
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
function collectRoutes(ctx: AppContext): RouteDef[] {
  return [
    ...healthRoutes(),
    ...auditRoutes(ctx),
    ...authRoutes(ctx),
    ...usersRoutes(ctx),
    ...settingsRoutes(ctx),
    ...ledgerRoutes(ctx),
    ...subjectsRoutes(ctx),
    ...tasksRoutes(ctx),
    ...questionsRoutes(ctx),
    ...progressRoutes(ctx),
  ];
}

/** Request middlewares contributed by modules (session → actor, etc.). */
function collectMiddlewares(ctx: AppContext): MiddlewareHandler<AppEnv>[] {
  return [authMiddleware(ctx)];
}

/** What the HTTP layer itself needs (routes and middlewares bring their own dependencies). */
export type HttpContext = Pick<AppContext, 'trustedProxies'>;

/** Assembles a Hono app from explicit routes; used directly by tests of the HTTP layer. */
export function buildApp(
  ctx: HttpContext,
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
