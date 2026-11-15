import { index, integer, sqliteTable } from 'drizzle-orm/sqlite-core';
import { tasks } from './tasks';
import { users } from './users';

/**
 * The admin's permission for one more attempt of a task in the learner's current epoch. It is
 * used by exactly one attempt (`attempts.retry_grant_id` is unique), so the row never changes.
 */
export const retryGrants = sqliteTable(
  'retry_grants',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    learnerId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    taskId: integer()
      .notNull()
      .references(() => tasks.id, { onDelete: 'restrict' }),
    epoch: integer().notNull(),
    grantedBy: integer().references(() => users.id, { onDelete: 'restrict' }),
    /** Epoch milliseconds. */
    grantedAt: integer().notNull(),
  },
  (t) => [index('retry_grants_learner_task_idx').on(t.learnerId, t.taskId, t.epoch)],
);

export type RetryGrantRow = typeof retryGrants.$inferSelect;
