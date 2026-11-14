import type { AttemptStatus } from '@questclass/shared/attempts/dto';
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { retryGrants } from './retryGrants';
import { tasks } from './tasks';
import { users } from './users';

/**
 * One try at the questions of a task (quiz, video lesson). The questions are snapshotted in
 * `attempt_questions`, answers go to `attempt_answers`; this row changes once, when the attempt
 * is finished. Attempts of an older epoch are history and no longer count.
 */
export const attempts = sqliteTable(
  'attempts',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    learnerId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    taskId: integer()
      .notNull()
      .references(() => tasks.id, { onDelete: 'restrict' }),
    epoch: integer().notNull(),
    status: text().$type<AttemptStatus>().notNull().default('in_progress'),
    /** Questions in the attempt. */
    total: integer().notNull(),
    correct: integer(),
    passed: integer({ mode: 'boolean' }),
    /** What the finish paid: the task reward and a streak bonus. */
    rewardXp: integer().notNull().default(0),
    rewardCoins: integer().notNull().default(0),
    streakXp: integer().notNull().default(0),
    streakCoins: integer().notNull().default(0),
    /** The admin's permission this attempt used, if it was not a free one. */
    retryGrantId: integer().references(() => retryGrants.id, { onDelete: 'restrict' }),
    /** Epoch milliseconds. */
    startedAt: integer().notNull(),
    finishedAt: integer(),
  },
  (t) => [
    index('attempts_learner_task_epoch_idx').on(t.learnerId, t.taskId, t.epoch),
    uniqueIndex('attempts_one_open_uq')
      .on(t.learnerId, t.taskId)
      .where(sql`status = 'in_progress'`),
    uniqueIndex('attempts_retry_grant_uq').on(t.retryGrantId),
  ],
);

export type AttemptRow = typeof attempts.$inferSelect;
