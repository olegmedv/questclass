import type { OptionId } from '@questclass/shared/questions/schema';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { attemptQuestions } from './attemptQuestions';
import { attempts } from './attempts';

/** The learner's answer to one question of an attempt: given once, never changed. */
export const attemptAnswers = sqliteTable(
  'attempt_answers',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    attemptId: integer()
      .notNull()
      .references(() => attempts.id, { onDelete: 'restrict' }),
    attemptQuestionId: integer()
      .notNull()
      .references(() => attemptQuestions.id, { onDelete: 'restrict' }),
    optionId: text().$type<OptionId>().notNull(),
    correct: integer({ mode: 'boolean' }).notNull(),
    /** Epoch milliseconds. */
    answeredAt: integer().notNull(),
  },
  (t) => [uniqueIndex('attempt_answers_question_uq').on(t.attemptQuestionId)],
);

export type AttemptAnswerRow = typeof attemptAnswers.$inferSelect;
