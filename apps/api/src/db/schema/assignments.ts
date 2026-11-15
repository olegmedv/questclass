import { index, integer, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { tasks } from './tasks';
import { users } from './users';

/**
 * Who a task is for. A task without rows here is for every active learner; with rows, only for
 * those learners, and it comes first in their "next task" (`position` = their queue order).
 */
export const taskAssignments = sqliteTable(
  'task_assignments',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    taskId: integer()
      .notNull()
      .references(() => tasks.id, { onDelete: 'restrict' }),
    learnerId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    position: integer().notNull(),
    createdBy: integer().references(() => users.id, { onDelete: 'restrict' }),
    /** Epoch milliseconds. */
    createdAt: integer().notNull(),
  },
  (t) => [
    uniqueIndex('task_assignments_task_learner_uq').on(t.taskId, t.learnerId),
    index('task_assignments_learner_position_idx').on(t.learnerId, t.position),
  ],
);

export type TaskAssignmentRow = typeof taskAssignments.$inferSelect;
