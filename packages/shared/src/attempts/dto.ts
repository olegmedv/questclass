import { z } from 'zod';
import type { RewardDto } from '../progress/dto';
import type { Evidence, OptionId } from '../questions/schema';
import { OPTION_IDS } from '../questions/schema';

/** `abandoned`: left unfinished when a reset started a new epoch. */
export const ATTEMPT_STATUSES = ['in_progress', 'finished', 'abandoned'] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const RETRY_REQUEST_STATUSES = ['open', 'granted'] as const;
export type RetryRequestStatus = (typeof RETRY_REQUEST_STATUSES)[number];

export const answerRequestSchema = z.object({ optionId: z.enum(OPTION_IDS) });

export const retryGrantRequestSchema = z.object({
  learnerId: z.number().int().positive(),
  taskId: z.number().int().positive(),
});

export interface AttemptOptionDto {
  readonly id: OptionId;
  readonly text: string;
  readonly image: string | null;
}

/** A question of an attempt (a snapshot: later edits of the bank do not change it). */
export interface AttemptQuestionDto {
  readonly id: number;
  readonly position: number;
  readonly text: string;
  readonly image: string | null;
  /** In the order shown to the learner. */
  readonly options: AttemptOptionDto[];
  /** The learner's answer, if given. */
  readonly answer: OptionId | null;
  /** Only after the attempt is finished (or for the admin). */
  readonly correct?: OptionId;
  readonly isCorrect?: boolean;
  readonly evidence?: Evidence | null;
}

/** What the learner may do after a finished attempt. */
export interface RetryStateDto {
  /** A new attempt can be started now (free retry or the admin's permission). */
  readonly canRetry: boolean;
  /** Free retries are used up: the learner can ask the admin. */
  readonly canRequest: boolean;
  /** A request is waiting for the admin. */
  readonly requestOpen: boolean;
}

export interface AttemptResultDto {
  readonly correct: number;
  readonly total: number;
  readonly passed: boolean;
  /** What this attempt actually paid (a reward is paid once per task). */
  readonly reward: RewardDto;
  /** Streak bonus paid by this attempt, if it completed a cycle. */
  readonly streakReward: RewardDto;
}

export interface AttemptDto {
  readonly id: number;
  readonly taskId: number;
  readonly epoch: number;
  readonly status: AttemptStatus;
  /** ISO 8601 */
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly questions: AttemptQuestionDto[];
  readonly result: AttemptResultDto | null;
  /** Present once the attempt is finished. */
  readonly retry: RetryStateDto | null;
}

/** The admin's view of an attempt: the snapshot with answers and the correct options. */
export interface AdminAttemptDto extends AttemptDto {
  readonly learnerId: number;
  /** Used the admin's permission for a retry. */
  readonly retryGrantId: number | null;
}

export interface AttemptSummaryDto {
  readonly id: number;
  readonly taskId: number;
  readonly epoch: number;
  readonly status: AttemptStatus;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly correct: number | null;
  readonly total: number;
  readonly passed: boolean | null;
}

export interface RetryRequestDto {
  readonly id: number;
  readonly learnerId: number;
  readonly taskId: number;
  readonly taskTitle: string;
  /** The failed attempt the request follows. */
  readonly attemptId: number | null;
  readonly status: RetryRequestStatus;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

export interface RetryGrantDto {
  readonly id: number;
  readonly learnerId: number;
  readonly taskId: number;
  readonly epoch: number;
  readonly grantedAt: string;
  /** Set once an attempt used the permission. */
  readonly usedByAttemptId: number | null;
}
