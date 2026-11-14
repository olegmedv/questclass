import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { tasks } from './tasks';
import { users } from './users';

export type TaskProgressState = 'started' | 'passed' | 'closed';

/**
 * Facts about a learner's work on a task, one row per epoch. A reset or a reopening starts a new
 * epoch (counted from `progress_resets`), so older rows stay as history and are simply no longer
 * current. Availability is never stored: it is computed from these facts on read.
 */
export const taskProgress = sqliteTable(
  'task_progress',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    learnerId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    taskId: integer()
      .notNull()
      .references(() => tasks.id, { onDelete: 'restrict' }),
    epoch: integer().notNull(),
    state: text().$type<TaskProgressState>().notNull(),
    /** Correct answers of the passing (or latest) result. */
    score: integer(),
    /** Out of how many. */
    total: integer(),
    /** Epoch milliseconds. */
    startedAt: integer().notNull(),
    completedAt: integer(),
    /** Admin who closed the task by hand. */
    closedBy: integer().references(() => users.id, { onDelete: 'restrict' }),
    closedReason: text(),
    updatedAt: integer().notNull(),
  },
  (t) => [
    uniqueIndex('task_progress_learner_task_epoch_uq').on(t.learnerId, t.taskId, t.epoch),
    index('task_progress_task_idx').on(t.taskId),
  ],
);

export type TaskProgressRow = typeof taskProgress.$inferSelect;
