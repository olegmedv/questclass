import type { ItemKind, RewardType } from '@questclass/shared/catalog/dto';
import type { PurchaseSnapshot } from '@questclass/shared/shop/dto';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { catalogItems } from './catalog';
import { users } from './users';

/**
 * A learner's purchase: a snapshot of the item at that moment (later catalog edits do not
 * change it) paid by one ledger row `purchase:<learner>:<requestId>` (`source_id` = this id).
 * Never updated; wishes and Robux are handed out by inserts of their own (FEAT-020).
 */
export const purchases = sqliteTable(
  'purchases',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    learnerId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    itemId: integer()
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'restrict' }),
    itemVersion: integer().notNull(),
    requestId: text().notNull(),
    kind: text().$type<ItemKind>().notNull(),
    title: text().notNull(),
    description: text().notNull(),
    price: integer().notNull(),
    /** What the item looks like (picture + animation); equal keys are the same thing to own. */
    visualKey: text(),
    rewardType: text().$type<RewardType>(),
    rewardAmount: integer(),
    /** Pictures, scene and animation as bought (value object, read whole). */
    snapshot: text({ mode: 'json' }).$type<PurchaseSnapshot>().notNull(),
    /** Epoch milliseconds. */
    createdAt: integer().notNull(),
  },
  (t) => [
    uniqueIndex('purchases_learner_request_uq').on(t.learnerId, t.requestId),
    index('purchases_learner_item_idx').on(t.learnerId, t.itemId),
    index('purchases_item_idx').on(t.itemId),
  ],
);

export type PurchaseRow = typeof purchases.$inferSelect;
