import type { RewardType } from '@questclass/shared/catalog/dto';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * A receipt: the admin handed out `amount` of a group (Robux or a wish). Never updated; what it
 * took from which purchase is in `fulfillment_allocations` (oldest purchases first).
 */
export const fulfillments = sqliteTable(
  'fulfillments',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    learnerId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    groupKey: text().notNull(),
    /** Retrying the same handing-out returns this receipt. */
    requestId: text().notNull(),
    rewardType: text().$type<RewardType>().notNull(),
    /** «Robux» or the wish's title at the moment. */
    title: text().notNull(),
    amount: integer().notNull(),
    createdBy: integer().references(() => users.id, { onDelete: 'restrict' }),
    /** Epoch milliseconds. */
    at: integer().notNull(),
  },
  (t) => [
    uniqueIndex('fulfillments_learner_request_uq').on(t.learnerId, t.requestId),
    index('fulfillments_learner_group_idx').on(t.learnerId, t.groupKey, t.at),
  ],
);

export type FulfillmentRow = typeof fulfillments.$inferSelect;
