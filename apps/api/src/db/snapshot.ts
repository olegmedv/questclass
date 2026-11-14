import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

export const SNAPSHOTS_DIRNAME = 'snapshots';
export const SNAPSHOT_PREFIX = 'pre-migrate-';
export const DEFAULT_KEEP_SNAPSHOTS = 5;

export function snapshotsDir(dataDir: string): string {
  return path.join(dataDir, SNAPSHOTS_DIRNAME);
}

/** Snapshot files in `dir`, oldest first (names sort chronologically). */
export function listSnapshots(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.startsWith(SNAPSHOT_PREFIX) && name.endsWith('.db'))
    .sort();
}

/** Deletes the oldest snapshots so that at most `keep` remain. */
export function pruneSnapshots(dir: string, keep: number): void {
  const files = listSnapshots(dir);
  for (const name of files.slice(0, Math.max(0, files.length - keep))) {
    rmSync(path.join(dir, name), { force: true });
  }
}

export interface SnapshotOptions {
  readonly keep?: number;
  readonly now?: Date;
}

/**
 * Copies the live database with SQLite's online backup API into
 * `<dir>/pre-migrate-<UTC timestamp>-<nn>.db`, then prunes old snapshots.
 */
export async function takeSnapshot(
  sqlite: Database.Database,
  dir: string,
  options: SnapshotOptions = {},
): Promise<string> {
  const { keep = DEFAULT_KEEP_SNAPSHOTS, now = new Date() } = options;
  mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  let seq = 0;
  let file: string;
  do {
    file = path.join(dir, `${SNAPSHOT_PREFIX}${stamp}-${String(seq).padStart(2, '0')}.db`);
    seq += 1;
  } while (existsSync(file));
  await sqlite.backup(file);
  chmodSync(file, 0o600);
  pruneSnapshots(dir, keep);
  return file;
}
