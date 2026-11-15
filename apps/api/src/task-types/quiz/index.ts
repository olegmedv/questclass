import {
  quizContract,
  type QuizConfig,
  type QuizSubmission,
} from '@questclass/shared/task-types/quiz/contract';
import { and, count, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { questions } from '../../db/schema/questions';
// Types only: the registry imports this module.
import type { TaskTypePlugin } from '../registry';

/** Live, active questions of a task's bank (what attempts draw from). */
export function activeQuestionCount(db: Db, taskId: number): number {
  return (
    db
      .select({ n: count() })
      .from(questions)
      .where(
        and(
          eq(questions.taskId, taskId),
          isNull(questions.archivedAt),
          eq(questions.state, 'active'),
        ),
      )
      .get()?.n ?? 0
  );
}

/** `quiz`: N random questions of the bank per attempt (the attempts engine does the rest). */
export const quizTaskType: TaskTypePlugin<QuizConfig, QuizSubmission> = {
  contract: quizContract,
  grade: ({ submission, expected }) => ({ correct: submission.optionId === expected }),
  // A plain quiz has no conditions of its own (availability is checked by the engine).
  canStart: () => ({ ok: true }),
  publishChecks(task, { db, settings }) {
    const needed = settings.get('quiz.questionsPerAttempt');
    const have = activeQuestionCount(db, task.id);
    return have < needed ? [`Нужно не меньше ${needed} вопросов в банке (сейчас ${have})`] : [];
  },
};
