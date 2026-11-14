import { z } from 'zod';
import { requestIdSchema } from '../economy/dto';

export const UNLOCK_MODES = ['rotation', 'sequential', 'all'] as const;
export type UnlockMode = (typeof UNLOCK_MODES)[number];

/** State of a task in the learner's current epoch (`none` = not touched since the last reset). */
export const PROGRESS_STATES = ['none', 'started', 'passed', 'closed'] as const;
export type ProgressState = (typeof PROGRESS_STATES)[number];

/** Why a task is closed for now. */
export const LOCK_REASONS = ['previous', 'rotation'] as const;
export type LockReason = (typeof LOCK_REASONS)[number];

export const closureRequestSchema = z.object({
  /** Pay the task's full reward (once per task, ever). */
  withReward: z.boolean(),
  reason: z.string().trim().max(300).optional(),
});

export const progressResetRequestSchema = z.object({
  /** Omitted = every task of the learner. */
  taskId: z.number().int().positive().optional(),
  /** Repeating the same request is a no-op, so a retry cannot wipe newer work. */
  requestId: requestIdSchema,
});

export const coinsResetRequestSchema = z.object({ requestId: requestIdSchema });

export type ClosureRequest = z.infer<typeof closureRequestSchema>;
export type ProgressResetRequest = z.infer<typeof progressResetRequestSchema>;

export interface TaskProgressDto {
  readonly taskId: number;
  readonly title: string;
  readonly type: string;
  readonly subjectId: number | null;
  readonly assigned: boolean;
  /** Current epoch of this task for the learner (grows with every reset and reopening). */
  readonly epoch: number;
  readonly state: ProgressState;
  /** Done since the last reset (a reopened task stays done). */
  readonly completed: boolean;
  /** Correct answers of the passing (or latest) result, and out of how many. */
  readonly score: number | null;
  readonly total: number | null;
  /** ISO 8601 */
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly closedBy: number | null;
  readonly closedReason: string | null;
  readonly available: boolean;
  readonly lockReason: LockReason | null;
}

export interface LearnerProgressDto {
  readonly mode: UnlockMode;
  /** The task to suggest next: assigned ones first, then by the unlock mode. */
  readonly nextTaskId: number | null;
  readonly assignedTotal: number;
  readonly assignedDone: number;
  readonly tasks: TaskProgressDto[];
}

/** XP and coins actually paid by an action. */
export interface RewardDto {
  readonly xp: number;
  readonly coins: number;
}
