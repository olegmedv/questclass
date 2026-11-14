import { Hono, type MiddlewareHandler } from 'hono';
import type { Config } from './config';
import type { Db } from './db/client';
import { clientIpMiddleware, type TrustedProxiesSource } from './http/clientIp';
import { handleError, handleNotFound } from './http/errors';
import type { Scheduler } from './jobs/scheduler';
import { sameOriginOnly } from './http/origin';
import { mountRoutes, type AppEnv, type RouteDef } from './http/route';
import { attemptsRoutes } from './modules/attempts/routes';
import type { AttemptsService } from './modules/attempts/service';
import { auditRoutes } from './modules/audit/routes';
import type { AuditService } from './modules/audit/service';
import { authMiddleware, authRoutes } from './modules/auth/routes';
import type { AuthService } from './modules/auth/service';
import { catalogRoutes } from './modules/catalog/routes';
import { characterRoutes } from './modules/character/routes';
import type { CharacterService } from './modules/character/service';
import type { CatalogService } from './modules/catalog/service';
import { importRoutes, importTokenMiddleware } from './modules/import/routes';
import type { ImportService } from './modules/import/service';
import { ledgerRoutes } from './modules/ledger/routes';
import { mediaRoutes } from './modules/media/routes';
import type { MediaService } from './modules/media/service';
import { progressRoutes } from './modules/progress/routes';
import type { ProgressService } from './modules/progress/service';
import { questionsRoutes } from './modules/questions/routes';
import { rewardsRoutes } from './modules/rewards/routes';
import type { RewardsService } from './modules/rewards/service';
import type { QuestionsService } from './modules/questions/service';
import type { LedgerService } from './modules/ledger/service';
import type { Keyring } from './modules/settings/crypto';
import { settingsRoutes } from './modules/settings/routes';
import { shopRoutes } from './modules/shop/routes';
import type { ShopService } from './modules/shop/service';
import { streakRoutes } from './modules/streak/routes';
import type { StreakService } from './modules/streak/service';
import type { SettingsService } from './modules/settings/service';
import { subjectsRoutes } from './modules/subjects/routes';
import type { SubjectsService } from './modules/subjects/service';
import { tasksRoutes } from './modules/tasks/routes';
import type { TasksService } from './modules/tasks/service';
import { uploadsRoutes } from './modules/uploads/routes';
import type { UploadsService } from './modules/uploads/service';
import { usersRoutes } from './modules/users/routes';
import type { UsersService } from './modules/users/service';
import { healthRoutes } from './modules/health/routes';
import { wishesRoutes } from './modules/wishes/routes';
import type { WishesService } from './modules/wishes/service';
import { choreRoutes } from './task-types/chore/routes';
import type { ChoresService } from './task-types/chore/service';
import type { TaskTypeRegistry } from './task-types/registry';
import { videoLessonRoutes } from './task-types/video_lesson/routes';
import type { WatchService } from './task-types/video_lesson/watch';

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
  readonly streak: StreakService;
  readonly attempts: AttemptsService;
  /** Media files under DATA_DIR/media. */
  readonly media: MediaService;
  /** Watching of lesson videos (video_lesson). */
  readonly watch: WatchService;
  /** Import tokens, lesson packages, uploads and revisions. */
  readonly imports: ImportService;
  /** Reward reasons and manual awards. */
  readonly rewards: RewardsService;
  /** Reports of chores and their review (chore). */
  readonly chores: ChoresService;
  /** Shared catalog: shop items, heroes, rooms, animations. */
  readonly catalog: CatalogService;
  /** Pictures uploaded by the admin (media `role = upload`). */
  readonly uploads: UploadsService;
  /** The learner's shop, purchases and what they own. */
  readonly shop: ShopService;
  /** Ticket requests and handing out wishes and Robux. */
  readonly wishes: WishesService;
  /** The learner's hero: look, room, name. */
  readonly character: CharacterService;
  /** Background jobs of the process (started by the server only). */
  readonly scheduler: Scheduler;
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
    ...streakRoutes(ctx),
    ...attemptsRoutes(ctx),
    ...mediaRoutes(ctx),
    ...videoLessonRoutes(ctx),
    ...importRoutes(ctx),
    ...rewardsRoutes(ctx),
    ...choreRoutes(ctx),
    ...catalogRoutes(ctx),
    ...uploadsRoutes(ctx),
    ...shopRoutes(ctx),
    ...wishesRoutes(ctx),
    ...characterRoutes(ctx),
  ];
}

/** Request middlewares contributed by modules (session → actor, etc.). */
function collectMiddlewares(ctx: AppContext): MiddlewareHandler<AppEnv>[] {
  return [authMiddleware(ctx), importTokenMiddleware(ctx)];
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
