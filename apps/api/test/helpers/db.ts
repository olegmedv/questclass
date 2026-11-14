import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../../src/config';
import { openDatabase, type Db } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';
import { snapshotsDir } from '../../src/db/snapshot';
import { closeAll, startup, type Runtime } from '../../src/startup';

/** A fresh, unique directory under the OS temp dir (never inside the repository). */
export function createTempDir(prefix = 'qc-test-'): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function removeDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

export interface TestRuntime extends Runtime {
  readonly dataDir: string;
  /** Closes the database and deletes the temporary DATA_DIR. */
  close(): Promise<void>;
}

/** The real startup sequence (DB + migrations + hooks) on a temporary DATA_DIR. */
export async function createTestRuntime(): Promise<TestRuntime> {
  const dataDir = createTempDir();
  const runtime = await startup(loadConfig({ NODE_ENV: 'test', DATA_DIR: dataDir }));
  return {
    ...runtime,
    dataDir,
    close: async () => {
      await closeAll(runtime.closers);
      removeDir(dataDir);
    },
  };
}

export interface TestDb {
  readonly db: Db;
  readonly dataDir: string;
  close(): void;
}

/** A migrated database in a temporary DATA_DIR, without the rest of the runtime. */
export async function createTestDb(): Promise<TestDb> {
  const dataDir = createTempDir();
  const db = openDatabase(dataDir);
  await runMigrations(db, { snapshotDir: snapshotsDir(dataDir) });
  return {
    db,
    dataDir,
    close: () => {
      db.$client.close();
      removeDir(dataDir);
    },
  };
}
