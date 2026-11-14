import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { tasks } from './tasks';
import { users } from './users';

/**
 * `reset` forgets results (one task, or all when `task_id` is null); `reopen` («Пройти с мамой»)
 * starts a new try of one task that keeps its completion. Each row adds one epoch to the tasks
 * it covers. Rows are never changed or deleted.
 */
export type ProgressResetKind = 'reset' | 'reopen';

export const progressResets = sqliteTable(
  'progress_resets',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    learnerId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Null = every task of the learner. */
    taskId: integer().references(() => tasks.id, { onDelete: 'restrict' }),
    kind: text().$type<ProgressResetKind>().notNull().default('reset'),
    /** Client id of the request; a repeat is a no-op. */
    requestId: text(),
    /** Epoch milliseconds. */
    at: integer().notNull(),
    by: integer().references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [
    index('progress_resets_learner_idx').on(t.learnerId, t.taskId),
    uniqueIndex('progress_resets_request_uq').on(t.learnerId, t.requestId),
  ],
);

export type ProgressResetRow = typeof progressResets.$inferSelect;
