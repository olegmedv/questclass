import type { TranscriptSegment, TranscriptSource } from '@questclass/shared/questions/schema';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { tasks } from './tasks';
import { users } from './users';

/**
 * Timed transcript of a lesson video (subtitles). `segments` is a single-row value object read
 * and written as a whole (CLAUDE.md rule 1b). Kept after the video itself is deleted.
 *
 * `media_id` has no FK: the media table arrives later (FEAT-011) and SQLite cannot add an FK to
 * an existing column without rebuilding the table (expand-only migrations).
 */
export const transcripts = sqliteTable(
  'transcripts',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    taskId: integer()
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    mediaId: integer(),
    lang: text().notNull(),
    source: text().$type<TranscriptSource>().notNull(),
    segments: text({ mode: 'json' }).$type<TranscriptSegment[]>().notNull(),
    createdBy: integer().references(() => users.id, { onDelete: 'restrict' }),
    /** Epoch milliseconds. */
    createdAt: integer().notNull(),
  },
  (t) => [index('transcripts_task_idx').on(t.taskId, t.createdAt)],
);

export type TranscriptRow = typeof transcripts.$inferSelect;
