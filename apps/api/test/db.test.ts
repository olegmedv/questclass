import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { BUSY_TIMEOUT_MS, DB_FILENAME, openDatabase, type Db } from '../src/db/client';
import { pendingMigrations, readMigrations, runMigrations } from '../src/db/migrate';
import { listSnapshots, snapshotsDir, takeSnapshot } from '../src/db/snapshot';
import { registerShutdown } from '../src/shutdown';
import { createTempDir, createTestRuntime, removeDir } from './helpers/db';

interface FixtureMigration {
  readonly tag: string;
  readonly sql: string;
}

const BASE_WHEN = 1_763_000_000_000;

/** Writes a Drizzle-style migrations folder (journal + SQL files). */
function writeMigrations(folder: string, migrations: readonly FixtureMigration[]): void {
  mkdirSync(path.join(folder, 'meta'), { recursive: true });
  const entries = migrations.map((m, idx) => ({
    idx,
    version: '6',
    when: BASE_WHEN + idx * 1000,
    tag: m.tag,
    breakpoints: true,
  }));
  const journal = { version: '7', dialect: 'sqlite', entries };
  writeFileSync(path.join(folder, 'meta', '_journal.json'), JSON.stringify(journal));
  for (const m of migrations) {
    writeFileSync(path.join(folder, `${m.tag}.sql`), m.sql);
  }
}

function tableNames(sqlite: Database.Database): string[] {
  const rows = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  return rows.map((r) => r.name).sort();
}

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

function tempDataDir(): string {
  const dir = createTempDir();
  cleanups.push(() => removeDir(dir));
  return dir;
}

function open(dataDir: string): Db {
  const db = openDatabase(dataDir);
  cleanups.push(() => void db.$client.close());
  return db;
}

describe('database connection', () => {
  it('uses WAL, enforces foreign keys and waits on a busy database', () => {
    const db = open(tempDataDir());
    expect(db.$client.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.$client.pragma('busy_timeout', { simple: true })).toBe(BUSY_TIMEOUT_MS);
  });

  it('rejects rows that violate a foreign key', () => {
    const sqlite = open(tempDataDir()).$client;
    sqlite.exec('CREATE TABLE parent (id INTEGER PRIMARY KEY)');
    sqlite.exec(
      'CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL ' +
        'REFERENCES parent(id) ON DELETE RESTRICT)',
    );
    expect(() => sqlite.prepare('INSERT INTO child (parent_id) VALUES (42)').run()).toThrow(
      /FOREIGN KEY/,
    );
    sqlite.prepare('INSERT INTO parent (id) VALUES (1)').run();
    sqlite.prepare('INSERT INTO child (parent_id) VALUES (1)').run();
    expect(() => sqlite.prepare('DELETE FROM parent WHERE id = 1').run()).toThrow(/FOREIGN KEY/);
  });

  it('stores the database file inside DATA_DIR', () => {
    const dataDir = tempDataDir();
    open(dataDir).$client.exec('CREATE TABLE t (id INTEGER)');
    expect(existsSync(path.join(dataDir, DB_FILENAME))).toBe(true);
  });
});

describe('migrations', () => {
  const first: FixtureMigration = {
    tag: '0000_first',
    sql: 'CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);',
  };
  const second: FixtureMigration = {
    tag: '0001_second',
    sql: 'CREATE TABLE tags (id INTEGER PRIMARY KEY);\n--> statement-breakpoint\nALTER TABLE notes ADD COLUMN tag_id INTEGER;',
  };

  it('applies all migrations to a new database without taking a snapshot', async () => {
    const dataDir = tempDataDir();
    const folder = path.join(dataDir, 'fixture-migrations');
    writeMigrations(folder, [first, second]);
    const db = open(dataDir);

    const result = await runMigrations(db, {
      migrationsFolder: folder,
      snapshotDir: snapshotsDir(dataDir),
    });

    expect(result).toEqual({ applied: 2, snapshot: null });
    expect(tableNames(db.$client)).toEqual(['__drizzle_migrations', 'notes', 'tags']);
    expect(listSnapshots(snapshotsDir(dataDir))).toEqual([]);
  });

  it('does nothing when everything is applied', async () => {
    const dataDir = tempDataDir();
    const folder = path.join(dataDir, 'fixture-migrations');
    writeMigrations(folder, [first]);
    const db = open(dataDir);
    const options = { migrationsFolder: folder, snapshotDir: snapshotsDir(dataDir) };
    await runMigrations(db, options);

    expect(await runMigrations(db, options)).toEqual({ applied: 0, snapshot: null });
    expect(listSnapshots(snapshotsDir(dataDir))).toEqual([]);
  });

  it('snapshots the existing database before applying a new migration', async () => {
    const dataDir = tempDataDir();
    const folder = path.join(dataDir, 'fixture-migrations');
    writeMigrations(folder, [first]);
    const db = open(dataDir);
    const options = { migrationsFolder: folder, snapshotDir: snapshotsDir(dataDir) };
    await runMigrations(db, options);
    db.$client.prepare("INSERT INTO notes (body) VALUES ('before upgrade')").run();

    writeMigrations(folder, [first, second]);
    expect(pendingMigrations(db.$client, readMigrations(folder))).toHaveLength(1);
    const result = await runMigrations(db, options);

    expect(result.applied).toBe(1);
    expect(result.snapshot).not.toBeNull();
    expect(path.dirname(result.snapshot ?? '')).toBe(path.join(dataDir, 'snapshots'));
    const snapshot = new Database(result.snapshot ?? '', { readonly: true });
    cleanups.push(() => void snapshot.close());
    // The snapshot holds the data as it was before the migration.
    expect(tableNames(snapshot)).toEqual(['__drizzle_migrations', 'notes']);
    expect(snapshot.prepare('SELECT body FROM notes').all()).toEqual([{ body: 'before upgrade' }]);
    expect(tableNames(db.$client)).toContain('tags');
  });

  it('keeps only the 5 newest snapshots', async () => {
    const dataDir = tempDataDir();
    const folder = path.join(dataDir, 'fixture-migrations');
    const db = open(dataDir);
    const migrations: FixtureMigration[] = [];
    const snapshots: string[] = [];
    for (let round = 0; round < 7; round += 1) {
      migrations.push({
        tag: `${String(round).padStart(4, '0')}_t${round}`,
        sql: `CREATE TABLE t${round} (id INTEGER);`,
      });
      writeMigrations(folder, migrations);
      const { snapshot } = await runMigrations(db, {
        migrationsFolder: folder,
        snapshotDir: snapshotsDir(dataDir),
        now: new Date(Date.UTC(2026, 10, 14, 12, 0, round)),
      });
      if (snapshot) {
        snapshots.push(path.basename(snapshot));
      }
    }
    // Round 0 created the database (no snapshot); rounds 1–6 took six snapshots.
    expect(snapshots).toHaveLength(6);
    expect(listSnapshots(snapshotsDir(dataDir))).toEqual(snapshots.slice(1));
  });

  it('rolls back a failing migration and leaves the snapshot for recovery', async () => {
    const dataDir = tempDataDir();
    const folder = path.join(dataDir, 'fixture-migrations');
    writeMigrations(folder, [first]);
    const db = open(dataDir);
    const options = { migrationsFolder: folder, snapshotDir: snapshotsDir(dataDir) };
    await runMigrations(db, options);

    const broken: FixtureMigration = {
      tag: '0001_broken',
      sql: 'CREATE TABLE half_done (id INTEGER);\n--> statement-breakpoint\nINSERT INTO missing_table VALUES (1);',
    };
    writeMigrations(folder, [first, broken]);

    await expect(runMigrations(db, options)).rejects.toThrow(/missing_table/);
    expect(tableNames(db.$client)).toEqual(['__drizzle_migrations', 'notes']);
    expect(listSnapshots(snapshotsDir(dataDir))).toHaveLength(1);
    expect(pendingMigrations(db.$client, readMigrations(folder))).toHaveLength(1);
  });

  it('names snapshots uniquely even within the same millisecond', async () => {
    const dataDir = tempDataDir();
    const sqlite = open(dataDir).$client;
    const now = new Date(Date.UTC(2026, 10, 14));
    const a = await takeSnapshot(sqlite, snapshotsDir(dataDir), { now });
    const b = await takeSnapshot(sqlite, snapshotsDir(dataDir), { now });
    expect(a).not.toBe(b);
    expect(listSnapshots(snapshotsDir(dataDir))).toEqual([path.basename(a), path.basename(b)]);
  });
});

describe('startup and shutdown', () => {
  it('applies every shipped migration before the app is created', async () => {
    const runtime = await createTestRuntime();
    cleanups.push(() => runtime.close());
    expect(pendingMigrations(runtime.ctx.db.$client, readMigrations())).toEqual([]);
  });

  it('closes HTTP and the database on SIGTERM', async () => {
    const runtime = await createTestRuntime();
    cleanups.push(() => runtime.close());
    const { app } = createApp(runtime.ctx);
    const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
      const s = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () => resolve(s));
    });
    const signals = new EventEmitter();
    const exitCodes: number[] = [];
    const shutdown = registerShutdown({
      server,
      closers: runtime.closers,
      signals,
      exit: (code) => exitCodes.push(code),
    });

    signals.emit('SIGTERM');
    await shutdown();

    expect(server.listening).toBe(false);
    expect(runtime.ctx.db.$client.open).toBe(false);
    expect(exitCodes).toEqual([0]);
  });
});
