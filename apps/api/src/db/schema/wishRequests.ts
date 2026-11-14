import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * «Хочу использовать»: one insert per request of a group of tickets (`robux` or one wish).
 * A group counts as requested while its newest request is newer than its newest fulfillment.
 */
export const wishRequests = sqliteTable(
  'wish_requests',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    learnerId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    groupKey: text().notNull(),
    /** Epoch milliseconds. */
    at: integer().notNull(),
  },
  (t) => [index('wish_requests_learner_group_idx').on(t.learnerId, t.groupKey, t.at)],
);

export type WishRequestRow = typeof wishRequests.$inferSelect;
