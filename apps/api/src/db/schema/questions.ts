import type {
  Evidence,
  OptionId,
  QuestionOption,
  QuestionSource,
  QuestionState,
} from '@questclass/shared/questions/schema';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { tasks } from './tasks';
import { users } from './users';

/**
 * Versioned questions of a task's bank. A question is identified by `(task_id, key)`; every
 * edit or re-import adds a version and archives the previous one, so attempts can always point
 * at the exact wording they used. `options` and `evidence` are single-row value objects
 * (CLAUDE.md rule 1b). The live bank = rows with `archived_at IS NULL AND state = 'active'`.
 *
 * Questions are the task's own content, so they go with a task that is deleted while it has no
 * history; once attempts refer to them (RESTRICT there), the task can only be archived.
 */
export const questions = sqliteTable(
  'questions',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    taskId: integer()
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    key: text().notNull(),
    version: integer().notNull(),
    text: text().notNull(),
    options: text({ mode: 'json' }).$type<QuestionOption[]>().notNull(),
    correct: text().$type<OptionId>().notNull(),
    imageRef: text(),
    evidence: text({ mode: 'json' }).$type<Evidence>(),
    /** `pending` versions wait for an import revision to be accepted (FEAT-012). */
    state: text().$type<QuestionState>().notNull().default('active'),
    source: text().$type<QuestionSource>().notNull(),
    /** Order in the bank (kept by new versions). */
    position: integer().notNull(),
    createdBy: integer().references(() => users.id, { onDelete: 'restrict' }),
    /** Epoch milliseconds. */
    createdAt: integer().notNull(),
    archivedAt: integer(),
    /** Admin who archived the version (null when an import or a newer version replaced it). */
    archivedBy: integer().references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [
    uniqueIndex('questions_task_key_version_uq').on(t.taskId, t.key, t.version),
    index('questions_task_live_idx').on(t.taskId, t.archivedAt, t.state),
  ],
);

export type QuestionRow = typeof questions.$inferSelect;
