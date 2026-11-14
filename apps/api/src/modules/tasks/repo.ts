import type { TaskStatus } from '@questclass/shared/tasks/dto';
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  max,
  notExists,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Db } from '../../db/client';
import { taskAssignments, type TaskAssignmentRow } from '../../db/schema/assignments';
import { subjects } from '../../db/schema/subjects';
import { tasks, type TaskRow } from '../../db/schema/tasks';

export interface TaskFilter {
  readonly subjectId?: number;
  readonly status?: TaskStatus;
  readonly type?: string;
}

/** A task a learner may see, with their assignment position (null = for everyone). */
export interface VisibleTaskRow {
  readonly task: TaskRow;
  readonly position: number | null;
}

const mine = alias(taskAssignments, 'mine');

/** Plain queries on `tasks` and `task_assignments`. */
export function createTasksRepo(db: Db) {
  return {
    list(filter: TaskFilter = {}): TaskRow[] {
      const conditions: SQL[] = [];
      if (filter.subjectId !== undefined) {
        conditions.push(eq(tasks.subjectId, filter.subjectId));
      }
      if (filter.status !== undefined) {
        conditions.push(eq(tasks.status, filter.status));
      }
      if (filter.type !== undefined) {
        conditions.push(eq(tasks.type, filter.type));
      }
      return db
        .select()
        .from(tasks)
        .where(and(...conditions))
        .orderBy(asc(tasks.subjectId), asc(tasks.sort), asc(tasks.id))
        .all();
    },

    findById(id: number): TaskRow | undefined {
      return db.select().from(tasks).where(eq(tasks.id, id)).get();
    },

    maxSort(subjectId: number | null): number {
      const where = subjectId === null ? isNull(tasks.subjectId) : eq(tasks.subjectId, subjectId);
      return (
        db
          .select({ value: max(tasks.sort) })
          .from(tasks)
          .where(where)
          .get()?.value ?? 0
      );
    },

    insert(values: typeof tasks.$inferInsert): TaskRow {
      return db.insert(tasks).values(values).returning().get();
    },

    update(id: number, set: Partial<typeof tasks.$inferInsert>): TaskRow | undefined {
      return db.update(tasks).set(set).where(eq(tasks.id, id)).returning().get();
    },

    delete(id: number): void {
      db.delete(tasks).where(eq(tasks.id, id)).run();
    },

    /** Assignees of each task, in assignment order. */
    assignees(taskIds: readonly number[]): Map<number, number[]> {
      const out = new Map<number, number[]>();
      if (taskIds.length === 0) {
        return out;
      }
      const rows = db
        .select({ taskId: taskAssignments.taskId, learnerId: taskAssignments.learnerId })
        .from(taskAssignments)
        .where(inArray(taskAssignments.taskId, [...taskIds]))
        .orderBy(asc(taskAssignments.id))
        .all();
      for (const row of rows) {
        out.set(row.taskId, [...(out.get(row.taskId) ?? []), row.learnerId]);
      }
      return out;
    },

    findAssignment(taskId: number, learnerId: number): TaskAssignmentRow | undefined {
      return db
        .select()
        .from(taskAssignments)
        .where(and(eq(taskAssignments.taskId, taskId), eq(taskAssignments.learnerId, learnerId)))
        .get();
    },

    /** Next position at the end of a learner's queue. */
    nextPosition(learnerId: number): number {
      const row = db
        .select({ value: max(taskAssignments.position) })
        .from(taskAssignments)
        .where(eq(taskAssignments.learnerId, learnerId))
        .get();
      return (row?.value ?? 0) + 1;
    },

    insertAssignment(values: typeof taskAssignments.$inferInsert): TaskAssignmentRow {
      return db.insert(taskAssignments).values(values).returning().get();
    },

    deleteAssignment(taskId: number, learnerId: number): boolean {
      return (
        db
          .delete(taskAssignments)
          .where(and(eq(taskAssignments.taskId, taskId), eq(taskAssignments.learnerId, learnerId)))
          .run().changes > 0
      );
    },

    deleteAssignmentsOf(taskId: number): void {
      db.delete(taskAssignments).where(eq(taskAssignments.taskId, taskId)).run();
    },

    /**
     * Published, released tasks of active subjects (or without subject) that are either
     * assigned to the learner or assigned to nobody. Ordered by subject, then task order.
     */
    visibleFor(learnerId: number, now: number, taskId?: number): VisibleTaskRow[] {
      const assignedToAnyone = db
        .select({ one: sql`1` })
        .from(taskAssignments)
        .where(eq(taskAssignments.taskId, tasks.id));
      return db
        .select({ task: tasks, position: mine.position })
        .from(tasks)
        .leftJoin(subjects, eq(subjects.id, tasks.subjectId))
        .leftJoin(mine, and(eq(mine.taskId, tasks.id), eq(mine.learnerId, learnerId)))
        .where(
          and(
            eq(tasks.status, 'published'),
            or(isNull(tasks.releaseAt), lte(tasks.releaseAt, now)),
            isNull(subjects.archivedAt),
            or(isNotNull(mine.id), notExists(assignedToAnyone)),
            taskId === undefined ? undefined : eq(tasks.id, taskId),
          ),
        )
        .orderBy(asc(subjects.sort), asc(tasks.sort), asc(tasks.id))
        .all();
    },
  };
}

export type TasksRepo = ReturnType<typeof createTasksRepo>;
