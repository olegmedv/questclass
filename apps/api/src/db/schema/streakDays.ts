import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * Days on which a learner studied (any finished attempt of a learning task, or a task closed by
 * an admin). One insert per day at most (`insert or ignore`); rows are never changed, so the
 * past cannot be rewritten. A full progress reset does not delete them: the streak simply
 * starts counting again from the reset day.
 */
export const streakDays = sqliteTable(
  'streak_days',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    learnerId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** `YYYY-MM-DD` in the installation's time zone (`dayKey()`). */
    dayKey: text().notNull(),
    /** Epoch ms of the first event of that day. */
    at: integer().notNull(),
  },
  (t) => [uniqueIndex('streak_days_learner_day_uq').on(t.learnerId, t.dayKey)],
);

export type StreakDayRow = typeof streakDays.$inferSelect;
