import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { media } from './media';
import { tasks } from './tasks';
import { users } from './users';

/** A played stretch of a video, `[start, end]` in seconds. */
export type WatchSpan = readonly [number, number];

/**
 * How much of one video of a task a learner has watched: one row per (learner, task, media), so
 * a replaced video is counted from scratch. `intervals` holds the merged, disjoint spans of this
 * row — a value object read and written as a whole (CLAUDE.md rule 1b).
 */
export const watchProgress = sqliteTable(
  'watch_progress',
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
    intervals: text({ mode: 'json' }).$type<WatchSpan[]>().notNull(),
    /** Total length of `intervals` (unique seconds). */
    watchedSec: real().notNull().default(0),
    percent: integer().notNull().default(0),
    /** Resume point (seconds). */
    lastPosition: real().notNull().default(0),
    /** When the `percent` threshold was first reached (epoch ms); stays even if it is raised. */
    completedAt: integer(),
    /** Admin who confirmed the watching by hand, and when. */
    confirmedBy: integer().references(() => users.id, { onDelete: 'restrict' }),
    confirmedAt: integer(),
    /** Epoch milliseconds. */
    createdAt: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (t) => [uniqueIndex('watch_progress_learner_task_media_uq').on(t.learnerId, t.taskId, t.mediaId)],
);

export type WatchProgressRow = typeof watchProgress.$inferSelect;
