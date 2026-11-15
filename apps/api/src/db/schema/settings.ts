import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Installation settings explicitly changed by an admin. A key without a row has its registry
 * default; reading never inserts. `value` is validated against the registry schema.
 */
export const settings = sqliteTable('settings', {
  key: text().primaryKey(),
  value: text({ mode: 'json' }).$type<unknown>().notNull(),
  /** Epoch milliseconds. */
  updatedAt: integer().notNull(),
  updatedBy: integer(),
});

export type SettingRow = typeof settings.$inferSelect;
