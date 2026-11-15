import { subjectNameKey } from '@questclass/shared/tasks/dto';
import type { Db } from '../../db/client';
import { createSubjectsRepo } from './repo';

export interface SeedSubject {
  readonly key: string;
  readonly name: string;
  /** Asset key of the pixel icon. */
  readonly icon: string;
  readonly sort: number;
}

/** The six starter subjects of the original (spec/01 §2.1), in its order. */
export const SEED_SUBJECTS: readonly SeedSubject[] = [
  { key: 'russian', name: 'Русский язык', icon: 'game/subjects-pixel/russian', sort: 10 },
  { key: 'world', name: 'Окружающий мир', icon: 'game/subjects-pixel/world', sort: 20 },
  { key: 'math', name: 'Математика', icon: 'game/subjects-pixel/math', sort: 30 },
  { key: 'reading', name: 'Чтение', icon: 'game/subjects-pixel/reading', sort: 40 },
  { key: 'art', name: 'ИЗО', icon: 'game/subjects-pixel/art', sort: 50 },
  { key: 'craft', name: 'Труд', icon: 'game/subjects-pixel/craft', sort: 60 },
];

/**
 * Inserts the starter subjects that are missing, matched by `key` (and by name, so an admin's
 * own subject with the same name is not duplicated). Existing rows are never changed, so admin
 * edits survive. Returns the number of inserted subjects.
 */
export function seedSubjects(db: Db, now: number = Date.now()): number {
  const repo = createSubjectsRepo(db);
  return db.transaction(() => {
    let inserted = 0;
    for (const subject of SEED_SUBJECTS) {
      const added = repo.insertIfAbsent({
        ...subject,
        nameKey: subjectNameKey(subject.name),
        createdAt: now,
        updatedAt: now,
      });
      if (added) {
        inserted += 1;
      }
    }
    return inserted;
  });
}

/**
 * Startup hook: seeds a brand-new installation only. Once subjects exist, an admin who deleted
 * a starter subject does not see it come back on the next restart.
 */
export function seedSubjectsOnFirstStart(db: Db): number {
  return createSubjectsRepo(db).count() === 0 ? seedSubjects(db) : 0;
}
