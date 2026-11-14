import type { CatalogItemDto } from '@questclass/shared/catalog/dto';
import type {
  PurchaseDto,
  PurchaseOutcomeDto,
  PurchaseRequest,
  PurchaseSnapshot,
  ShopDto,
} from '@questclass/shared/shop/dto';
import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { catalogItems } from '../../db/schema/catalog';
import { purchases, type PurchaseRow } from '../../db/schema/purchases';
import { conflict } from '../../http/errors';
import type { CatalogService } from '../catalog/service';
import { requestKey, type LedgerService } from '../ledger/service';
import { createOwnership, visualKey, type Ownership } from './ownership';

export interface ShopService {
  /** The learner's shop: active items not owned yet (tickets always), live ones first. */
  shop(learnerId: number): ShopDto;
  /**
   * Buys one item: a snapshot and the payment in one transaction. A repeated `requestId` returns
   * the first purchase (`created: false`); another item under the same id is refused.
   */
  purchase(
    learnerId: number,
    input: PurchaseRequest,
  ): {
    readonly outcome: PurchaseOutcomeDto;
    readonly created: boolean;
  };
  /** Everything the learner bought, oldest first. */
  purchases(learnerId: number): PurchaseDto[];
  readonly ownership: Ownership;
}

export interface ShopDeps {
  readonly catalog: CatalogService;
  readonly ledger: LedgerService;
  readonly clock?: () => number;
}

const snapshotOf = (item: CatalogItemDto): PurchaseSnapshot => ({
  animated: item.animated,
  hero: item.hero,
  room: item.room,
  roomCategory: item.roomCategory,
  animation: item.animation,
  ticket: item.ticket,
});

export function toPurchaseDto(row: PurchaseRow): PurchaseDto {
  return {
    ...row.snapshot,
    id: row.id,
    itemId: row.itemId,
    itemVersion: row.itemVersion,
    kind: row.kind,
    title: row.title,
    description: row.description,
    price: row.price,
    rewardType: row.rewardType,
    rewardAmount: row.rewardAmount,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

export function createShopService(db: Db, deps: ShopDeps): ShopService {
  const { catalog, ledger, clock = Date.now } = deps;
  const ownership = createOwnership(db, catalog);

  const byRequest = (learnerId: number, requestId: string): PurchaseRow | undefined =>
    db
      .select()
      .from(purchases)
      .where(and(eq(purchases.learnerId, learnerId), eq(purchases.requestId, requestId)))
      .get();

  return {
    ownership,

    shop(learnerId) {
      const { coins } = ledger.balance(learnerId);
      const owned = new Set(ownership.owned(learnerId).map((thing) => thing.visualKey));
      const bought = new Set(
        db
          .select({ itemId: purchases.itemId })
          .from(purchases)
          .where(eq(purchases.learnerId, learnerId))
          .all()
          .map((row) => row.itemId),
      );
      const rows = new Map(
        db
          .select()
          .from(catalogItems)
          .all()
          .map((row) => [row.id, row]),
      );
      const items = catalog
        .items({ activeOnly: true })
        .filter((item) => {
          if (item.starter) return false;
          if (item.kind === 'ticket') return true;
          const row = rows.get(item.id);
          const key = row ? visualKey(row) : null;
          return !bought.has(item.id) && (key === null || !owned.has(key));
        })
        .map((item) => {
          const affordable = coins >= 0 && coins >= item.price;
          return { ...item, affordable, missingCoins: affordable ? 0 : item.price - coins };
        })
        // Live items first, then the catalog order.
        .sort((a, b) => Number(b.animated) - Number(a.animated) || a.id - b.id);
      return { coins, items };
    },

    purchase(learnerId, input) {
      const key = requestKey('purchase', learnerId, input.requestId);
      const now = clock();
      return db.transaction(() => {
        const earlier = byRequest(learnerId, input.requestId);
        if (earlier) {
          if (earlier.itemId !== input.itemId) {
            throw conflict('request_conflict', 'Обнови магазин и попробуй ещё раз');
          }
          return {
            outcome: { purchase: toPurchaseDto(earlier), coins: ledger.balance(learnerId).coins },
            created: false,
          };
        }
        const row = catalog.findRow(input.itemId);
        if (!row?.active || row.starter) {
          throw conflict('item_unavailable', 'Этот товар пока недоступен');
        }
        if (row.version !== input.version) {
          throw conflict(
            'item_changed',
            'Родитель изменил товар. Обнови магазин и посмотри новые условия',
            { version: row.version },
          );
        }
        if (row.kind !== 'ticket' && ownership.ownsItem(learnerId, row)) {
          throw conflict(
            'already_owned',
            row.kind === 'room'
              ? 'Эта комната уже у тебя есть'
              : 'Этот образ уже есть в твоём гардеробе',
          );
        }
        const item = catalog.item(row.id);
        const purchase = db
          .insert(purchases)
          .values({
            learnerId,
            itemId: row.id,
            itemVersion: row.version,
            requestId: input.requestId,
            kind: row.kind,
            title: row.title,
            description: row.description,
            price: row.price,
            visualKey: visualKey(row),
            rewardType: row.kind === 'ticket' ? row.rewardType : null,
            rewardAmount: row.kind === 'ticket' ? row.rewardAmount : null,
            snapshot: snapshotOf(item),
            createdAt: now,
          })
          .returning()
          .get();
        ledger.spend({
          learnerId,
          price: row.price,
          sourceType: 'purchase',
          sourceId: purchase.id,
          idemKey: key,
          note: row.title,
          at: now,
        });
        return {
          outcome: { purchase: toPurchaseDto(purchase), coins: ledger.balance(learnerId).coins },
          created: true,
        };
      });
    },

    purchases: (learnerId) =>
      db
        .select()
        .from(purchases)
        .where(eq(purchases.learnerId, learnerId))
        .orderBy(asc(purchases.id))
        .all()
        .map(toPurchaseDto),
  };
}
