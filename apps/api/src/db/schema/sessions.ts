import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { trustedDevices } from './trustedDevices';
import { users } from './users';

/**
 * Login sessions. The cookie token is stored only as its SHA-256 hash. Validating a session
 * never writes: the admin idle timeout lives in a signed activity cookie instead of a
 * "last seen" column.
 */
export const sessions = sqliteTable(
  'sessions',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    tokenHash: text().notNull(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    role: text({ enum: ['admin', 'learner'] }).notNull(),
    /** Trusted device a learner session was opened on. */
    deviceId: integer().references(() => trustedDevices.id, { onDelete: 'restrict' }),
    /** Epoch milliseconds. */
    createdAt: integer().notNull(),
    /** Absolute end of the session (admin: max hours, learner: days). */
    expiresAt: integer().notNull(),
    revokedAt: integer(),
    revokedReason: text(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_uq').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_device_idx').on(t.deviceId),
  ],
);

export type SessionRow = typeof sessions.$inferSelect;
