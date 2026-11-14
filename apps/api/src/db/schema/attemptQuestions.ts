import type { Evidence, OptionId, QuestionOption } from '@questclass/shared/questions/schema';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { attempts } from './attempts';
import { questions } from './questions';

/**
 * Snapshot of a question as the attempt showed it: wording, options in the shown (shuffled)
 * order, the correct option and the evidence. Edits of the bank never change it. `options` and
 * `evidence` are single-row value objects (CLAUDE.md rule 1b).
 */
export const attemptQuestions = sqliteTable(
  'attempt_questions',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    attemptId: integer()
      .notNull()
      .references(() => attempts.id, { onDelete: 'restrict' }),
    position: integer().notNull(),
    /** The exact version used (RESTRICT: a version used by an attempt is never deleted). */
    questionId: integer()
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    questionKey: text().notNull(),
    questionVersion: integer().notNull(),
    text: text().notNull(),
    options: text({ mode: 'json' }).$type<QuestionOption[]>().notNull(),
    correct: text().$type<OptionId>().notNull(),
    imageRef: text(),
    evidence: text({ mode: 'json' }).$type<Evidence>(),
  },
  (t) => [uniqueIndex('attempt_questions_attempt_position_uq').on(t.attemptId, t.position)],
);

export type AttemptQuestionRow = typeof attemptQuestions.$inferSelect;
