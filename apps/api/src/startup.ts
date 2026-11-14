import type { AppContext } from './app';
import type { Config } from './config';
import { openDatabase } from './db/client';
import { runMigrations } from './db/migrate';
import { snapshotsDir } from './db/snapshot';
import { trustedProxiesFromSettings } from './http/clientIp';
import { createAuditService } from './modules/audit/service';
import { createAuthService } from './modules/auth/service';
import { createLedgerService } from './modules/ledger/service';
import { createProgressService } from './modules/progress/service';
import { createQuestionsService } from './modules/questions/service';
import { createKeyring } from './modules/settings/crypto';
import { loadOrCreateMasterKey } from './modules/settings/masterKey';
import { createSettingsService } from './modules/settings/service';
import { createStreakService } from './modules/streak/service';
import { seedSubjectsOnFirstStart } from './modules/subjects/seed';
import { createSubjectsService } from './modules/subjects/service';
import { createTasksService } from './modules/tasks/service';
import { createTaskTypeRegistry } from './task-types/registry';
import { createUsersService } from './modules/users/service';

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
    const subjects = createSubjectsService(db, { audit });
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
