import { integer, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { media } from './media';
import { users } from './users';

/**
 * Built-in files the admin replaced with an own upload (FEAT-059): one row per replaced slot
 * (`@questclass/shared/assets/slots`). Restoring the built-in file deletes the row; the history
 * stays in the audit log. The upload is never deleted while a row refers to it.
 */
export const assetOverrides = sqliteTable('asset_overrides', {
  /** Slot key: the manifest file (`game/rooms/room-bright.webp`; a sound — its `.mp3`). */
  slot: text().primaryKey(),
  uploadId: integer()
    .notNull()
    .references((): AnySQLiteColumn => media.id, { onDelete: 'restrict' }),
  /** Epoch milliseconds. */
  updatedAt: integer().notNull(),
  updatedBy: integer().references(() => users.id, { onDelete: 'restrict' }),
});

export type AssetOverrideRow = typeof assetOverrides.$inferSelect;
