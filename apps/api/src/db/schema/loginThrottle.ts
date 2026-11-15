import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Failed-login counters, one row per throttle key: `pair:<account>|<ip>` (exponential delay
 * per account and address) and `ip:<ip>` (overall limit per address).
 */
export const loginThrottle = sqliteTable('login_throttle', {
  key: text().primaryKey(),
  failures: integer().notNull(),
  /** Epoch milliseconds. */
  lastFailureAt: integer().notNull(),
  lockedUntil: integer().notNull(),
});

export type LoginThrottleRow = typeof loginThrottle.$inferSelect;
