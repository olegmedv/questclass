import { asc, count, eq, isNull, max } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { subjects, type SubjectRow } from '../../db/schema/subjects';

/** Plain queries on `subjects`. */
export function createSubjectsRepo(db: Db) {
  return {
    list(options: { includeArchived: boolean }): SubjectRow[] {
      return db
        .select()
        .from(subjects)
        .where(options.includeArchived ? undefined : isNull(subjects.archivedAt))
        .orderBy(asc(subjects.sort), asc(subjects.id))
        .all();
    },

    findById(id: number): SubjectRow | undefined {
      return db.select().from(subjects).where(eq(subjects.id, id)).get();
    },

    findByKey(key: string): SubjectRow | undefined {
      return db.select().from(subjects).where(eq(subjects.key, key)).get();
    },

    count(): number {
      return db.select({ n: count() }).from(subjects).get()?.n ?? 0;
    },

    maxSort(): number {
      return (
        db
          .select({ value: max(subjects.sort) })
          .from(subjects)
          .get()?.value ?? 0
      );
    },

    insert(values: typeof subjects.$inferInsert): SubjectRow {
      return db.insert(subjects).values(values).returning().get();
    },

    /** Inserts unless the key or the name is already taken; returns whether it was inserted. */
    insertIfAbsent(values: typeof subjects.$inferInsert): boolean {
      return db.insert(subjects).values(values).onConflictDoNothing().run().changes > 0;
    },

    update(id: number, set: Partial<typeof subjects.$inferInsert>): SubjectRow | undefined {
      return db.update(subjects).set(set).where(eq(subjects.id, id)).returning().get();
    },

    delete(id: number): void {
      db.delete(subjects).where(eq(subjects.id, id)).run();
    },
  };
}

export type SubjectsRepo = ReturnType<typeof createSubjectsRepo>;
