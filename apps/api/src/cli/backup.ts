import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { loadConfig } from '../config';
import { DB_FILENAME, openDatabase } from '../db/client';
import type { CliIo } from './index';

export const BACKUP_USAGE =
  'backup <path>            consistent copy of the database (into a directory: questclass-<time>.db)';

/** `questclass-2026-11-14T20-30-00-000Z.db`: sorts by time, safe on every file system. */
export function backupFileName(now: Date = new Date()): string {
  return `questclass-${now.toISOString().replace(/[:.]/g, '-')}.db`;
}

function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Makes the copy one self-contained file (rollback journal instead of WAL, so no `-wal`/`-shm`
 * appear next to it when it is opened) and runs PRAGMA quick_check: a damaged backup is worse
 * than none. Returns the problem, or null.
 */
function finalizeCopy(file: string): string | null {
  const copy = new Database(file, { fileMustExist: true });
  try {
    copy.pragma('journal_mode = DELETE');
    const result = copy.pragma('quick_check', { simple: true });
    return result === 'ok' ? null : String(result);
  } finally {
    copy.close();
  }
}

/**
 * `node dist/cli.js backup <path>` (inside the container via `docker exec`): copies the live
 * database with SQLite's online backup API (`db.backup()`), safe while the server writes. The
 * copy is written next to the target, checked and only then renamed into place, so a reader
 * never sees half a file. Migrations are not run and nothing else is touched: the master key
 * and media are not part of this copy (FEAT-047 backs them up separately).
 */
export async function backupCommand(args: readonly string[], io: CliIo): Promise<number> {
  const [rawTarget] = args;
  if (!rawTarget || args.length > 1) {
    io.stderr(`Usage: ${BACKUP_USAGE}`);
    return 2;
  }
  const config = loadConfig(io.env);
  const source = path.join(config.dataDir, DB_FILENAME);
  if (!existsSync(source)) {
    io.stderr(`No database at ${source}: check DATA_DIR.`);
    return 1;
  }
  const requested = path.resolve(rawTarget);
  // An existing directory, or a path written with a trailing slash, receives a timestamped file.
  const asDirectory = isDirectory(requested) || /[\\/]$/.test(rawTarget);
  const target = asDirectory ? path.join(requested, backupFileName()) : requested;
  if (existsSync(target)) {
    io.stderr(`${target} already exists; choose another name.`);
    return 1;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  const partial = `${target}.partial`;
  rmSync(partial, { force: true });

  const db = openDatabase(config.dataDir);
  try {
    await db.$client.backup(partial);
  } catch (err) {
    rmSync(partial, { force: true });
    throw err;
  } finally {
    db.$client.close();
  }
  const problem = finalizeCopy(partial);
  if (problem !== null) {
    rmSync(partial, { force: true });
    io.stderr(`The copy failed its integrity check: ${problem}`);
    return 1;
  }
  chmodSync(partial, 0o600);
  renameSync(partial, target);
  io.stdout(`Backup written: ${target} (${statSync(target).size} bytes)`);
  return 0;
}
