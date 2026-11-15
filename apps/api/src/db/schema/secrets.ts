import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Secrets encrypted with a key derived from DATA_DIR/master.key (AES-256-GCM). */
export const secrets = sqliteTable('secrets', {
  key: text().primaryKey(),
  /** `v1.<iv>.<auth tag>.<ciphertext>`, base64url parts; the secret key is the AAD. */
  ciphertext: text().notNull(),
  /** Epoch milliseconds. */
  updatedAt: integer().notNull(),
  updatedBy: integer(),
});

export type SecretRow = typeof secrets.$inferSelect;
