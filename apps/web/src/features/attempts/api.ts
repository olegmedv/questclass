// Attempts at the questions of a task (FEAT-010): start or resume, answer, finish, ask for a
// retry. Shared by every type with questions (quiz, video_lesson).
import type { AttemptDto, RetryRequestDto } from '@questclass/shared/attempts/dto';
import type { OptionId } from '@questclass/shared/questions/schema';
import { api, isApiError } from '../../api/client';

/** Resumes the open attempt of the task or starts a new one. */
export const startAttempt = (taskId: number) =>
  api<AttemptDto>(`/api/tasks/${taskId}/attempts`, { method: 'POST' });

export const fetchAttempt = (attemptId: number) => api<AttemptDto>(`/api/attempts/${attemptId}`);

/** Stores one answer; the same answer again is accepted, a different one is refused (409). */
export const saveAnswer = (attemptId: number, questionId: number, optionId: OptionId) =>
  api<{ questionId: number; optionId: OptionId }>(
    `/api/attempts/${attemptId}/answers/${questionId}`,
    { method: 'PUT', json: { optionId } },
  );

/** Grades the attempt; repeating returns the same result. */
export const finishAttempt = (attemptId: number) =>
  api<AttemptDto>(`/api/attempts/${attemptId}/completion`, { method: 'POST' });

export const requestRetry = (taskId: number) =>
  api<RetryRequestDto>(`/api/tasks/${taskId}/retry-requests`, { method: 'POST' });

/** Why an attempt cannot start now (409 answers of the start endpoint). */
export type StartBlock =
  | { readonly kind: 'passed'; readonly message: string }
  | { readonly kind: 'retry_needed'; readonly message: string; readonly requestOpen: boolean }
  | { readonly kind: 'not_ready'; readonly message: string };

export function startBlockOf(error: unknown): StartBlock | null {
  if (!isApiError(error) || error.status !== 409) return null;
  switch (error.code) {
    case 'already_passed':
      return { kind: 'passed', message: error.message };
    case 'retry_needed': {
      const details = error.details as { requestOpen?: unknown } | undefined;
      return {
        kind: 'retry_needed',
        message: error.message,
        requestOpen: details?.requestOpen === true,
      };
    }
    default:
      // task_locked, questions_not_ready, watch_required, watch_not_confirmed…
      return { kind: 'not_ready', message: error.message };
  }
}

/**
 * URL of a picture of a question or an option: lesson media (`media/<id>/<path>`, served by the
 * API to learners who see the task) or a built-in asset.
 */
export function imageUrl(ref: string | null): string | null {
  if (!ref) return null;
  return ref.startsWith('media/') ? `/api/${ref}` : `/assets/${ref}`;
}

/** Answer letters of the original: А Б В Г. */
export const OPTION_LETTERS = ['А', 'Б', 'В', 'Г'] as const;

/** The first question without an answer (answers go strictly in order). */
export function currentQuestionIndex(attempt: AttemptDto): number {
  const index = attempt.questions.findIndex((q) => q.answer === null);
  return index === -1 ? attempt.questions.length : index;
}
