import { z } from 'zod';
import type { ItemKind } from '../catalog/dto';
import type { PurchaseSnapshot } from '../shop/dto';

export const characterNameSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1, 'Имя не может быть пустым').max(30, 'Имя — до 30 символов'));

export const equipRequestSchema = z.object({ itemId: z.number().int().positive() });
export const characterNameRequestSchema = z.object({ name: characterNameSchema });

/** A look or a room the learner owns (a starter or a purchase, as bought). */
export interface OwnedItemDto extends PurchaseSnapshot {
  readonly itemId: number;
  /** Null for a starter. */
  readonly purchaseId: number | null;
  readonly kind: Exclude<ItemKind, 'ticket'>;
  readonly title: string;
}

/** The hero: name, what is worn, and the wardrobe. */
export interface CharacterDto {
  readonly name: string;
  /** Null only if the catalog has no starter at all. */
  readonly look: OwnedItemDto | null;
  readonly room: OwnedItemDto | null;
  readonly looks: OwnedItemDto[];
  readonly rooms: OwnedItemDto[];
}
