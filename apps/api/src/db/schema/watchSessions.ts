import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { media } from './media';
import { tasks } from './tasks';
import { users } from './users';

/**
 * One opening of a lesson video. Only the newest session of a (learner, task) is open: starting
 * another one closes it, and a closed session accepts no more batches (a second tab gets 409).
 * `last_batch_at` bounds what the next batch may credit (real time × `watch.maxRate`).
 */
export const watchSessions = sqliteTable(
  'watch_sessions',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    learnerId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    taskId: integer()
      .notNull()
      .references(() => tasks.id, { onDelete: 'restrict' }),
    mediaId: integer()
      .notNull()
      .references(() => media.id, { onDelete: 'restrict' }),
    /** Epoch milliseconds. */
    startedAt: integer().notNull(),
    lastBatchAt: integer().notNull(),
    /** Seconds this session credited in total. */
    creditedSec: real().notNull().default(0),
    closedAt: integer(),
  },
  (t) => [
    index('watch_sessions_learner_task_idx').on(t.learnerId, t.taskId),
    uniqueIndex('watch_sessions_one_open_uq')
      .on(t.learnerId, t.taskId)
      .where(sql`closed_at IS NULL`),
  ],
);

export type WatchSessionRow = typeof watchSessions.$inferSelect;
