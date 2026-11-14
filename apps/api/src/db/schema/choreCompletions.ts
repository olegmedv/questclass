import type { ChoreCompletionStatus } from '@questclass/shared/task-types/chore/dto';
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { tasks } from './tasks';
import { users } from './users';

/**
 * «Я сделал» of a chore: one row per report. A review changes the row once (pending →
 * approved | rejected); an approval pays through the ledger (`chore:<id>`). At most one live
 * report (pending or approved) per learner, chore and period; a rejected one can be followed
 * by a new report of the same period.
 */
export const choreCompletions = sqliteTable(
  'chore_completions',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    learnerId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    taskId: integer()
      .notNull()
      .references(() => tasks.id, { onDelete: 'restrict' }),
    /** `once`, `dayKey()` or `weekKey()` of the report, by the chore's `repeat`. */
    periodKey: text().notNull(),
    status: text().$type<ChoreCompletionStatus>().notNull().default('pending'),
    /** The admin's comment of a rejection. */
    note: text(),
    /** What the approval paid (snapshot of the task's reward at that moment). */
    rewardXp: integer(),
    rewardCoins: integer(),
    reviewedBy: integer().references(() => users.id, { onDelete: 'restrict' }),
    /** Epoch milliseconds. */
    reviewedAt: integer(),
    createdAt: integer().notNull(),
  },
  (t) => [
    uniqueIndex('chore_completions_live_uq')
      .on(t.learnerId, t.taskId, t.periodKey)
      .where(sql`status IN ('pending', 'approved')`),
    index('chore_completions_status_idx').on(t.status, t.createdAt),
    index('chore_completions_learner_task_idx').on(t.learnerId, t.taskId),
  ],
);

export type ChoreCompletionRow = typeof choreCompletions.$inferSelect;
