import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import { media } from './media';

/**
 * School subjects (Русский язык, Математика…). Never deleted while a task refers to them;
 * archived instead (`archived_at`), which hides them and their tasks from learners.
 */
export const subjects = sqliteTable(
  'subjects',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    /** Stable machine name (`math`), referenced by settings and imports. Immutable. */
    key: text().notNull(),
    name: text().notNull(),
    /** Lower-cased name with collapsed spaces: names are unique ignoring case. */
    nameKey: text().notNull(),
    /** Asset key of a built-in icon (`game/subjects-pixel/math`). */
    icon: text(),
    /** Or a picture the admin uploaded (media `role = upload`); at most one of the two is set. */
    // Annotated: media → tasks → subjects is a cycle of table types.
    iconUploadId: integer().references((): AnySQLiteColumn => media.id, { onDelete: 'restrict' }),
    sort: integer().notNull().default(0),
    /** Epoch milliseconds. */
    createdAt: integer().notNull(),
    updatedAt: integer().notNull(),
    archivedAt: integer(),
  },
  (t) => [
    uniqueIndex('subjects_key_uq').on(t.key),
    uniqueIndex('subjects_name_key_uq').on(t.nameKey),
    index('subjects_sort_idx').on(t.sort),
  ],
);

export type SubjectRow = typeof subjects.$inferSelect;
