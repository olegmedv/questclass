import type { ManifestQuestion, RevisionStatus } from '@questclass/shared/import/manifest';
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { importTokens } from './importTokens';
import { media } from './media';
import { tasks } from './tasks';
import { users } from './users';

/** What a re-import proposes for the questions, key by key (FEAT-054 `ImportOutcome`). */
export interface RevisionQuestionOutcome {
  readonly created: string[];
  readonly updated: string[];
  readonly unchanged: string[];
  readonly conflicts: string[];
  readonly removed: string[];
  /** What the import proposed for the conflicting keys (shown next to the admin's version). */
  readonly proposals: Record<string, ManifestQuestion>;
}

/**
 * A re-import of a published task waiting for the admin: new question versions in
 * `state = pending` and, if the video or pictures changed, new media. Learners keep seeing the
 * current task until the revision is accepted. At most one revision per task is pending; a newer
 * import supersedes it. `questions` is a value object of this row (CLAUDE.md rule 1b).
 */
export const taskRevisions = sqliteTable(
  'task_revisions',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    taskId: integer()
      .notNull()
      .references(() => tasks.id, { onDelete: 'restrict' }),
    status: text().$type<RevisionStatus>().notNull().default('pending'),
    /** Proposed video (null = the current one stays). */
    mediaId: integer().references(() => media.id, { onDelete: 'restrict' }),
    /** Proposed question pictures (null = the current ones stay). */
    imagesMediaId: integer().references(() => media.id, { onDelete: 'restrict' }),
    questions: text({ mode: 'json' }).$type<RevisionQuestionOutcome>().notNull(),
    tokenId: integer().references(() => importTokens.id, { onDelete: 'restrict' }),
    /** Epoch milliseconds. */
    createdAt: integer().notNull(),
    decidedAt: integer(),
    decidedBy: integer().references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [
    index('task_revisions_status_idx').on(t.status, t.createdAt),
    uniqueIndex('task_revisions_one_pending_uq')
      .on(t.taskId)
      .where(sql`status = 'pending'`),
  ],
);

export type TaskRevisionRow = typeof taskRevisions.$inferSelect;
