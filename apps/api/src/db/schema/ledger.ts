import type { LedgerSourceType } from '@questclass/shared/economy/dto';
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * Append-only journal of every XP and coin change (CLAUDE.md rule 4). Balance = SUM over the
 * learner's rows. Rows are never updated or deleted: a cancellation is a new row with the
 * opposite amounts that points at the cancelled one (`reverses_id`, unique → once).
 */
export const ledger = sqliteTable(
  'ledger',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    learnerId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Epoch milliseconds. */
    at: integer().notNull(),
    xp: integer().notNull().default(0),
    coins: integer().notNull().default(0),
    sourceType: text().$type<LedgerSourceType>().notNull(),
    /** Id of the source entity (task, chore completion, purchase…), as text. */
    sourceId: text(),
    /** Built on the server only (see `idemKey()`); a retry with the same key is a no-op. */
    idemKey: text().notNull(),
    reversesId: integer().references((): AnySQLiteColumn => ledger.id, { onDelete: 'restrict' }),
    note: text(),
    /** Admin who caused the row; null for the system (task rewards, streaks). */
    createdBy: integer().references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [
    uniqueIndex('ledger_idem_key_uq').on(t.idemKey),
    uniqueIndex('ledger_reverses_id_uq').on(t.reversesId),
    index('ledger_learner_at_idx').on(t.learnerId, t.at),
    index('ledger_source_idx').on(t.sourceType, t.sourceId),
  ],
);

export type LedgerRow = typeof ledger.$inferSelect;
export type LedgerInsert = typeof ledger.$inferInsert;
