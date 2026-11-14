import { z } from 'zod';
import type { RewardType, TicketArtDto } from '../catalog/dto';
import { requestIdSchema } from '../economy/dto';

/** All Robux tickets of a learner form this one group. */
export const ROBUX_GROUP = 'robux';

/** `robux`, or `wish:<itemId>:<hash of title and description>`. */
export const groupKeySchema = z
  .string()
  .regex(/^(robux|wish:\d{1,10}:[a-f0-9]{12})$/, 'Нет такой награды');

export const wishRequestSchema = z.object({ groupKey: groupKeySchema });

export const fulfillmentRequestSchema = z.object({
  groupKey: groupKeySchema,
  /** How much is handed out now (Robux, or wishes). */
  amount: z.number().int().min(1).max(1_000_000),
  /** The remaining amount the admin saw; another value means something changed meanwhile. */
  expectedRemaining: z.number().int().min(0).max(1_000_000_000),
  requestId: requestIdSchema,
});
export type FulfillmentRequest = z.infer<typeof fulfillmentRequestSchema>;

export const WISH_STATUSES = ['ready', 'requested'] as const;
/** `ready` — «можно использовать», `requested` — «Просьба отправлена». */
export type WishStatus = (typeof WISH_STATUSES)[number];

/** Tickets of one kind a learner still has. */
export interface WishGroupDto {
  readonly groupKey: string;
  readonly rewardType: RewardType;
  /** «Robux» for the Robux group. */
  readonly title: string;
  readonly description: string;
  readonly ticket: TicketArtDto | null;
  /** Robux left, or wishes left. */
  readonly remaining: number;
  readonly status: WishStatus;
  /** ISO 8601 of the open request. */
  readonly requestedAt: string | null;
}

/** «Выданы родителем». */
export interface ReceiptDto {
  readonly id: number;
  readonly groupKey: string;
  readonly rewardType: RewardType;
  readonly title: string;
  readonly amount: number;
  /** ISO 8601 */
  readonly at: string;
  /** How the amount was taken from the purchases (oldest first). */
  readonly allocations: { readonly purchaseId: number; readonly amount: number }[];
}

export interface WishesDto {
  readonly groups: WishGroupDto[];
  readonly history: { readonly items: ReceiptDto[]; readonly nextCursor: string | null };
}

/** The admin's queue: a learner's groups that wait. */
export interface LearnerWishesDto {
  readonly learnerId: number;
  readonly learnerName: string;
  readonly groups: WishGroupDto[];
}
