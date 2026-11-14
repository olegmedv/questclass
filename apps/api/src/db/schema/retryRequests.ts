import type { RetryRequestStatus } from '@questclass/shared/attempts/dto';
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { attempts } from './attempts';
import { tasks } from './tasks';
import { users } from './users';

/**
 * A learner asks for one more attempt after the free retries are used up. At most one open
 * request per learner and task; granting it sets `status = granted` (one update).
 */
export const retryRequests = sqliteTable(
  'retry_requests',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    learnerId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    taskId: integer()
      .notNull()
      .references(() => tasks.id, { onDelete: 'restrict' }),
    epoch: integer().notNull(),
    /** The failed attempt the request follows. */
    attemptId: integer().references(() => attempts.id, { onDelete: 'restrict' }),
    status: text().$type<RetryRequestStatus>().notNull().default('open'),
    /** Epoch milliseconds. */
    createdAt: integer().notNull(),
    resolvedAt: integer(),
    resolvedBy: integer().references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [
    uniqueIndex('retry_requests_one_open_uq')
      .on(t.learnerId, t.taskId)
      .where(sql`status = 'open'`),
    index('retry_requests_status_idx').on(t.status, t.createdAt),
  ],
);

export type RetryRequestRow = typeof retryRequests.$inferSelect;
