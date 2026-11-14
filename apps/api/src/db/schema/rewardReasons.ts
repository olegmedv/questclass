import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { subjects } from './subjects';
import { tasks } from './tasks';
import { users } from './users';

/**
 * Ready-made reasons for manual awards («Присутствие на уроке», «Домашняя работа»…), shared by
 * all learners (CLAUDE.md rule 5). Never deleted: awards refer to them; archived instead.
 */
export const rewardReasons = sqliteTable(
  'reward_reasons',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    /** Identity of a seeded reason (the seed inserts missing keys and never changes rows). */
    seedKey: text(),
    name: text().notNull(),
    /** Lower-cased name with collapsed spaces: unique among active reasons. */
    nameKey: text().notNull(),
    xp: integer().notNull(),
    coins: integer().notNull(),
    /** Epoch milliseconds. */
    createdAt: integer().notNull(),
    updatedAt: integer().notNull(),
    archivedAt: integer(),
  },
  (t) => [
    uniqueIndex('reward_reasons_seed_key_uq').on(t.seedKey),
    uniqueIndex('reward_reasons_active_name_uq')
      .on(t.nameKey)
      .where(sql`archived_at IS NULL`),
  ],
);

export type RewardReasonRow = typeof rewardReasons.$inferSelect;

/**
 * One manual award of an admin to a learner. The money is the ledger row with key
 * `award:<learner>:<requestId>` and `source_id` = this id; a cancellation is the compensating
 * ledger row, so this row is never updated. Names are snapshots (renames keep history).
 */
export const awards = sqliteTable(
  'awards',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    learnerId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    requestId: text().notNull(),
    /** Null for «Своя награда». */
    reasonId: integer().references(() => rewardReasons.id, { onDelete: 'restrict' }),
    reasonName: text().notNull(),
    title: text().notNull(),
    /** Lower-cased title with collapsed spaces (duplicate check). */
    titleKey: text().notNull(),
    /** `YYYY-MM-DD` of the lesson or deed. */
    date: text().notNull(),
    subjectId: integer().references(() => subjects.id, { onDelete: 'restrict' }),
    subjectName: text().notNull(),
    taskId: integer().references(() => tasks.id, { onDelete: 'restrict' }),
    xp: integer().notNull(),
    coins: integer().notNull(),
    note: text(),
    createdBy: integer().references(() => users.id, { onDelete: 'restrict' }),
    /** Epoch milliseconds. */
    createdAt: integer().notNull(),
  },
  (t) => [
    uniqueIndex('awards_learner_request_uq').on(t.learnerId, t.requestId),
    index('awards_learner_date_idx').on(t.learnerId, t.date),
  ],
);

export type AwardRow = typeof awards.$inferSelect;
