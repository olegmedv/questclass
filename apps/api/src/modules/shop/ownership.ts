import type { ItemKind } from '@questclass/shared/catalog/dto';
import type { PurchaseSnapshot } from '@questclass/shared/shop/dto';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { catalogItems, type CatalogItemRow } from '../../db/schema/catalog';
import { purchases } from '../../db/schema/purchases';
import type { CatalogService } from '../catalog/service';

type VisualColumns = Pick<
  CatalogItemRow,
  'kind' | 'characterId' | 'roomId' | 'animationId' | 'imageUploadId' | 'animationUploadId'
>;

/**
 * What an outfit or a room looks like — its picture and its animation. Two items with the same
 * key are the same thing to own (the original's «same image + animation»). Tickets have none.
 */
export function visualKey(row: VisualColumns): string | null {
  if (row.kind === 'ticket') {
    return null;
  }
  const builtIn = row.kind === 'outfit' ? row.characterId : row.roomId;
  const picture = builtIn !== null ? `lib${builtIn}` : `upload${row.imageUploadId ?? 0}`;
  const motion =
    row.animationId !== null
      ? `lib${row.animationId}`
      : row.animationUploadId !== null
        ? `upload${row.animationUploadId}`
        : 'still';
  return `${row.kind}:${picture}:${motion}`;
}

/** A look or a room a learner may use. */
export interface OwnedThing {
  readonly itemId: number;
  /** Null for a starter (owned without buying). */
  readonly purchaseId: number | null;
  readonly kind: Exclude<ItemKind, 'ticket'>;
  readonly title: string;
  readonly visualKey: string;
  /** As bought (a starter: as the catalog has it now). */
  readonly snapshot: PurchaseSnapshot;
}

/** Whether learners bought the item (catalog: its kind may not change then). */
export function itemHasPurchases(db: Db, itemId: number): boolean {
  return (
    db
      .select({ id: purchases.id })
      .from(purchases)
      .where(eq(purchases.itemId, itemId))
      .limit(1)
      .get() !== undefined
  );
}

export interface Ownership {
  /** Starters, then purchases in order; duplicates (same visual key) appear once. */
  owned(learnerId: number): OwnedThing[];
  /** The learner has this item or one that looks the same. Tickets are never "owned". */
  ownsItem(learnerId: number, item: CatalogItemRow): boolean;
}

export function createOwnership(db: Db, catalog: Pick<CatalogService, 'item'>): Ownership {
  const starterRows = (): CatalogItemRow[] =>
    db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.starter, true))
      .orderBy(asc(catalogItems.id))
      .all()
      .filter((row) => row.kind !== 'ticket');

  const boughtRows = (learnerId: number) =>
    db
      .select()
      .from(purchases)
      .where(eq(purchases.learnerId, learnerId))
      .orderBy(asc(purchases.id))
      .all()
      .filter((row) => row.kind !== 'ticket' && row.visualKey !== null);

  return {
    owned(learnerId) {
      const seen = new Set<string>();
      const out: OwnedThing[] = [];
      for (const row of starterRows()) {
        const key = visualKey(row);
        if (key === null || seen.has(key)) continue;
        seen.add(key);
        const item = catalog.item(row.id);
        out.push({
          itemId: row.id,
          purchaseId: null,
          kind: row.kind as OwnedThing['kind'],
          title: row.title,
          visualKey: key,
          snapshot: {
            animated: item.animated,
            hero: item.hero,
            room: item.room,
            roomCategory: item.roomCategory,
            animation: item.animation,
            ticket: item.ticket,
          },
        });
      }
      for (const row of boughtRows(learnerId)) {
        const key = row.visualKey ?? '';
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          itemId: row.itemId,
          purchaseId: row.id,
          kind: row.kind as OwnedThing['kind'],
          title: row.title,
          visualKey: key,
          snapshot: row.snapshot,
        });
      }
      return out;
    },

    ownsItem(learnerId, item) {
      const key = visualKey(item);
      if (key === null) {
        return false;
      }
      if (starterRows().some((row) => row.id === item.id || visualKey(row) === key)) {
        return true;
      }
      return boughtRows(learnerId).some((row) => row.itemId === item.id || row.visualKey === key);
    },
  };
}
