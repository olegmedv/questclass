import { z } from 'zod';
import type { ChoreRepeat } from './contract';

export const CHORE_COMPLETION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ChoreCompletionStatus = (typeof CHORE_COMPLETION_STATUSES)[number];

/** The admin's comment that the learner sees with «Не засчитано». */
export const choreRejectionSchema = z.object({
  comment: z.string().trim().max(300).optional(),
});
export type ChoreRejectionRequest = z.infer<typeof choreRejectionSchema>;

export interface ChoreCompletionDto {
  readonly id: number;
  readonly learnerId: number;
  readonly taskId: number;
  readonly taskTitle: string;
  /** `once`, a day (`YYYY-MM-DD`) or an ISO week (`YYYY-Www`). */
  readonly periodKey: string;
  readonly status: ChoreCompletionStatus;
  /** The admin's comment of a rejection. */
  readonly note: string | null;
  /** ISO 8601 */
  readonly createdAt: string;
  readonly reviewedAt: string | null;
  readonly reviewedBy: number | null;
  /** What the approval paid (null until approved). */
  readonly reward: { readonly xp: number; readonly coins: number } | null;
}

/** A learner's chore: the current period and its completions, newest first. */
export interface ChoreStatusDto {
  readonly taskId: number;
  readonly repeat: ChoreRepeat;
  readonly periodKey: string;
  /** The latest completion of the current period (a rejected one may be followed by a new one). */
  readonly current: ChoreCompletionDto | null;
  readonly items: ChoreCompletionDto[];
}
