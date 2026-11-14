import { index, integer, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { fulfillments } from './fulfillments';
import { purchases } from './purchases';

/** How much of one ticket purchase a receipt used. Remaining = reward − SUM(amount). */
export const fulfillmentAllocations = sqliteTable(
  'fulfillment_allocations',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    fulfillmentId: integer()
      .notNull()
      .references(() => fulfillments.id, { onDelete: 'restrict' }),
    purchaseId: integer()
      .notNull()
      .references(() => purchases.id, { onDelete: 'restrict' }),
    amount: integer().notNull(),
  },
  (t) => [
    uniqueIndex('fulfillment_allocations_uq').on(t.fulfillmentId, t.purchaseId),
    index('fulfillment_allocations_purchase_idx').on(t.purchaseId),
  ],
);

export type FulfillmentAllocationRow = typeof fulfillmentAllocations.$inferSelect;
