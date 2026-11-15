import type { TaskStatus } from '@questclass/shared/tasks/dto';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { subjects } from './subjects';
import { users } from './users';

/**
 * A task of any type (video lesson, quiz, chore…). `config` holds the type-specific settings
 * (CLAUDE.md rule 1a) and is validated by the type plugin. Tasks with history are archived,
 * never deleted (FK `RESTRICT` from progress, attempts, media).
 */
export const tasks = sqliteTable(
  'tasks',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    type: text().notNull(),
    subjectId: integer().references(() => subjects.id, { onDelete: 'restrict' }),
    title: text().notNull(),
    description: text().notNull().default(''),
    config: text({ mode: 'json' }).$type<unknown>().notNull(),
    xp: integer().notNull(),
    coins: integer().notNull(),
    status: text().$type<TaskStatus>().notNull().default('draft'),
    /** Not visible to learners before this instant (epoch ms). */
    releaseAt: integer(),
    /** Date the lesson was given (`YYYY-MM-DD`), orders lessons in rotation. */
    lessonDate: text(),
    /** Order inside the subject (ascending). */
    sort: integer().notNull().default(0),
    /** Lesson id in the import source; import upserts by it. */
    externalId: text(),
    createdBy: integer().references(() => users.id, { onDelete: 'restrict' }),
    /** Epoch milliseconds. */
    createdAt: integer().notNull(),
    updatedAt: integer().notNull(),
    publishedAt: integer(),
  },
  (t) => [
    index('tasks_subject_sort_idx').on(t.subjectId, t.sort),
    index('tasks_status_idx').on(t.status),
    uniqueIndex('tasks_external_id_uq').on(t.externalId),
  ],
);

export type TaskRow = typeof tasks.$inferSelect;
