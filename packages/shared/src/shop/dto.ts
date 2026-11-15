import { z } from 'zod';
import type { CatalogItemDto, ItemKind, RewardType } from '../catalog/dto';
import { requestIdSchema } from '../economy/dto';

export const purchaseRequestSchema = z.object({
  itemId: z.number().int().positive(),
  /** The version the learner saw; a newer one means the admin changed the item. */
  version: z.number().int().positive(),
  /** Created when the confirmation opens; a retry returns the same purchase. */
  requestId: requestIdSchema,
});
export type PurchaseRequest = z.infer<typeof purchaseRequestSchema>;

/** How a bought item looks, frozen at the purchase. */
export type PurchaseSnapshot = Pick<
  CatalogItemDto,
  'animated' | 'hero' | 'room' | 'roomCategory' | 'animation' | 'ticket'
>;

export interface PurchaseDto extends PurchaseSnapshot {
  readonly id: number;
  readonly itemId: number;
  readonly itemVersion: number;
  readonly kind: ItemKind;
  readonly title: string;
  readonly description: string;
  readonly price: number;
  readonly rewardType: RewardType | null;
  readonly rewardAmount: number | null;
  /** ISO 8601 */
  readonly createdAt: string;
}

/** An item of the learner's shop. */
export interface ShopItemDto extends CatalogItemDto {
  readonly affordable: boolean;
  /** «Ещё N монет» (0 when affordable). */
  readonly missingCoins: number;
}

export interface ShopDto {
  readonly coins: number;
  /** Not owned yet (tickets always), live ones first. */
  readonly items: ShopItemDto[];
}

export interface PurchaseOutcomeDto {
  readonly purchase: PurchaseDto;
  /** Coins left after the purchase. */
  readonly coins: number;
}
