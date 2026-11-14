import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Admins (login + password) and learners (profile + PIN). Users are never deleted, only
 * deactivated, because history (progress, ledger, audit) refers to them.
 */
export const users = sqliteTable(
  'users',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    role: text({ enum: ['admin', 'learner'] }).notNull(),
    name: text().notNull(),
    /** Lower-case; admins only. */
    login: text(),
    avatar: text(),
    /** scrypt hash (admins). */
    passwordHash: text(),
    /** scrypt hash (learners). */
    pinHash: text(),
    active: integer({ mode: 'boolean' }).notNull().default(true),
    /** Epoch milliseconds. */
    createdAt: integer().notNull(),
    updatedAt: integer().notNull(),
    deactivatedAt: integer(),
  },
  (t) => [
    uniqueIndex('users_login_uq').on(t.login),
    index('users_role_active_idx').on(t.role, t.active),
  ],
);

export type UserRow = typeof users.$inferSelect;
