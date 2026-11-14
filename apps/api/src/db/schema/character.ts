import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { catalogItems } from './catalog';
import { users } from './users';

/**
 * A learner's hero: name, the worn look and the chosen room (catalog items the learner owns).
 * One row per learner, created by the first change; until then the starters are worn. Each
 * change updates one column.
 */
export const learnerCharacters = sqliteTable('learner_characters', {
  learnerId: integer()
    .primaryKey()
    .references(() => users.id, { onDelete: 'restrict' }),
  name: text().notNull().default(''),
  lookItemId: integer().references(() => catalogItems.id, { onDelete: 'restrict' }),
  roomItemId: integer().references(() => catalogItems.id, { onDelete: 'restrict' }),
  /** Epoch milliseconds. */
  updatedAt: integer().notNull(),
});

export type LearnerCharacterRow = typeof learnerCharacters.$inferSelect;
