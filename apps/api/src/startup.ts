import type { AppContext } from './app';
import type { Config } from './config';
import { openDatabase } from './db/client';
import { runMigrations } from './db/migrate';
import { snapshotsDir } from './db/snapshot';
import { trustedProxiesFromSettings } from './http/clientIp';
import { retentionJob } from './jobs/retention';
import { createScheduler } from './jobs/scheduler';
import { createAttemptsService } from './modules/attempts/service';
import { createAuditService } from './modules/audit/service';
import { createAuthService } from './modules/auth/service';
import { seedCatalog } from './modules/catalog/seed';
import { createCharacterService } from './modules/character/service';
import { createCatalogService } from './modules/catalog/service';
import { createImportService } from './modules/import/service';
import { createLedgerService } from './modules/ledger/service';
import { createMediaService } from './modules/media/service';
import { createProgressService } from './modules/progress/service';
import { createQuestionsService } from './modules/questions/service';
import { seedRewardReasons } from './modules/rewards/seed';
import { createRewardsService } from './modules/rewards/service';
import { createKeyring } from './modules/settings/crypto';
import { loadOrCreateMasterKey } from './modules/settings/masterKey';
import { createSettingsService } from './modules/settings/service';
import { itemHasPurchases } from './modules/shop/ownership';
import { createShopService } from './modules/shop/service';
import { createStreakService } from './modules/streak/service';
import { seedSubjectsOnFirstStart } from './modules/subjects/seed';
import { createSubjectsService } from './modules/subjects/service';
import { createTasksService } from './modules/tasks/service';
import { createChoresService } from './task-types/chore/service';
import { createTaskTypeRegistry } from './task-types/registry';
import { createWatchService } from './task-types/video_lesson/watch';
import { createUploadsService } from './modules/uploads/service';
import { createUsersService } from './modules/users/service';
import { createWishesService } from './modules/wishes/service';

/** Releases a resource on shutdown (closed in reverse order of registration). */
export type Closer = () => void | Promise<void>;

/** A server-only step that must complete before the server accepts requests. */
export type StartupHook = (ctx: AppContext) => void | Promise<void>;

/** Ordered server startup hooks (seeds, scheduler…). Each module adds its line here. */
const STARTUP_HOOKS: readonly StartupHook[] = [
  (ctx) => {
    const token = ctx.auth.ensureSetupToken();
    if (token) {
      console.info(`No admin yet. One-time setup token: ${token}`);
      console.info('Open /setup and enter this token to create the first admin.');
    }
  },
  (ctx) => {
    seedSubjectsOnFirstStart(ctx.db);
  },
  (ctx) => {
    seedRewardReasons(ctx.db);
  },
  (ctx) => {
    seedCatalog(ctx.db, ctx.catalog);
  },
  (ctx) => {
    ctx.scheduler.start();
  },
];

export interface Runtime {
  readonly ctx: AppContext;
  readonly closers: readonly Closer[];
}

/**
 * Opens resources, builds the shared context and applies migrations. Used by the server and
 * by CLI commands (which must not run the server hooks).
 */
export async function openRuntime(config: Config): Promise<Runtime> {
  const closers: Closer[] = [];
  try {
    const keyring = createKeyring(loadOrCreateMasterKey(config.dataDir));
    const db = openDatabase(config.dataDir);
    closers.push(() => {
      db.$client.close();
    });
    await runMigrations(db, { snapshotDir: snapshotsDir(config.dataDir) });
    const audit = createAuditService(db);
    const settings = createSettingsService(db, { audit, keyring });
    const users = createUsersService(db, { audit });
    const auth = createAuthService(db, { config, audit, settings, keyring, users });
    const ledger = createLedgerService(db, { settings });
    const taskTypes = createTaskTypeRegistry();
    // `uploads` is created further down (it needs media); the lookup runs per request.
    const subjects = createSubjectsService(db, {
      audit,
      describeUpload: (id) => uploads.describe(id),
    });
    const tasks = createTasksService(db, { audit, settings, ledger, users, subjects, taskTypes });
    const questions = createQuestionsService(db, { audit });
    const streak = createStreakService(db, { settings, ledger });
    const progress = createProgressService(db, {
      audit,
      settings,
      ledger,
      users,
      tasks,
      subjects,
      streak,
    });
    const attempts = createAttemptsService(db, {
      audit,
      settings,
      users,
      tasks,
      questions,
      progress,
      streak,
      taskTypes,
    });
    const media = createMediaService(db, { dataDir: config.dataDir, tasks });
    const watch = createWatchService(db, { audit, settings, users, tasks, progress, media });
    const imports = createImportService(db, {
      audit,
      settings,
      tasks,
      subjects,
      questions,
      media,
      taskTypes,
    });
    const rewards = createRewardsService(db, { audit, ledger, users, subjects, tasks });
    const chores = createChoresService(db, { audit, settings, ledger, tasks, progress });
    const uploads = createUploadsService(db, { audit, media });
    const catalog = createCatalogService(db, {
      audit,
      describeUpload: (id) => uploads.describe(id),
      hasPurchases: (id) => itemHasPurchases(db, id),
    });
    const shop = createShopService(db, { catalog, ledger });
    const wishes = createWishesService(db, { audit, users });
    const character = createCharacterService(db, { ownership: shop.ownership });
    const scheduler = createScheduler(db, [
      retentionJob({ db, media, tasks, progress, users, settings }),
    ]);
    closers.push(() => {
      scheduler.stop();
    });
    const ctx: AppContext = {
      config,
      db,
      audit,
      keyring,
      settings,
      users,
      auth,
      ledger,
      taskTypes,
      subjects,
      tasks,
      questions,
      progress,
      streak,
      attempts,
      media,
      watch,
      imports,
      rewards,
      chores,
      catalog,
      uploads,
      shop,
      wishes,
      character,
      scheduler,
      trustedProxies: trustedProxiesFromSettings(settings),
    };
    return { ctx, closers };
  } catch (err) {
    await closeAll(closers);
    throw err;
  }
}

/**
 * Prepares everything the server needs before it accepts requests: the runtime (with
 * migrations applied) and then the startup hooks in order. On failure, whatever was already
 * opened is closed again.
 */
export async function startup(config: Config): Promise<Runtime> {
  const runtime = await openRuntime(config);
  try {
    for (const hook of STARTUP_HOOKS) {
      await hook(runtime.ctx);
    }
    return runtime;
  } catch (err) {
    await closeAll(runtime.closers);
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
