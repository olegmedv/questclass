import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export const DB_FILENAME = 'questclass.db';
export const BUSY_TIMEOUT_MS = 5000;

export type Schema = typeof schema;
export type Db = BetterSQLite3Database<Schema> & { $client: Database.Database };

/** Connection settings every handle must have: WAL, enforced foreign keys, busy timeout. */
export function applyPragmas(sqlite: Database.Database): void {
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
}

/** Opens (creating if needed) the application database in `dataDir`. */
export function openDatabase(dataDir: string): Db {
  mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(path.join(dataDir, DB_FILENAME));
  applyPragmas(sqlite);
  return drizzle(sqlite, { schema, casing: 'snake_case' });
}
