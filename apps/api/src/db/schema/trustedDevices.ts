import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * Browsers an admin marked as "child's device". Only they may show the profile picker and
 * accept PIN logins. The cookie token is stored as its SHA-256 hash.
 */
export const trustedDevices = sqliteTable(
  'trusted_devices',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    tokenHash: text().notNull(),
    name: text().notNull(),
    createdBy: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Epoch milliseconds. */
    createdAt: integer().notNull(),
    revokedAt: integer(),
    revokedBy: integer().references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [uniqueIndex('trusted_devices_token_hash_uq').on(t.tokenHash)],
);

export type TrustedDeviceRow = typeof trustedDevices.$inferSelect;
