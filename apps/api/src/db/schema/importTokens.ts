import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * Tokens of the lesson-prep tool (role `import`, only `/api/import/*`). The token itself is shown
 * once on creation; only its SHA-256 hash is stored. Revoked tokens stay as history.
 */
export const importTokens = sqliteTable(
  'import_tokens',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    tokenHash: text().notNull(),
    createdBy: integer().references(() => users.id, { onDelete: 'restrict' }),
    /** Epoch milliseconds. */
    createdAt: integer().notNull(),
    revokedAt: integer(),
    revokedBy: integer().references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [uniqueIndex('import_tokens_token_hash_uq').on(t.tokenHash)],
);

export type ImportTokenRow = typeof importTokens.$inferSelect;
