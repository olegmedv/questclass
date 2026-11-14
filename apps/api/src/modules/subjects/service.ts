import {
  subjectNameKey,
  type SubjectCreateRequest,
  type SubjectDto,
  type SubjectUpdateRequest,
} from '@questclass/shared/tasks/dto';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { isForeignKeyViolation, isUniqueViolation } from '../../db/constraints';
import type { SubjectRow } from '../../db/schema/subjects';
import { conflict, notFound } from '../../http/errors';
import { auditPayload, defineAuditAction, type AuditService } from '../audit/service';
import { createSubjectsRepo } from './repo';

export const subjectCreated = defineAuditAction(
  'subject.created',
  z.object({ key: z.string(), name: z.string() }),
);
export const subjectUpdated = defineAuditAction(
  'subject.updated',
  z.object({
    changed: z.array(z.string()),
    name: z.string().optional(),
    icon: z.string().nullable().optional(),
    sort: z.number().optional(),
    archived: z.boolean().optional(),
  }),
);
export const subjectDeleted = defineAuditAction(
  'subject.deleted',
  z.object({ key: z.string(), name: z.string() }),
);

export interface SubjectsService {
  /** Active subjects by default; the admin list includes archived ones. */
  list(options?: { includeArchived?: boolean }): SubjectDto[];
  get(id: number): SubjectDto;
  findRow(id: number): SubjectRow | undefined;
  findByKey(key: string): SubjectRow | undefined;
  create(input: SubjectCreateRequest, actorId: number | null): SubjectDto;
  update(id: number, patch: SubjectUpdateRequest, actorId: number | null): SubjectDto;
  /** Deletes a subject nothing refers to; otherwise 409 `has_history` (archive it instead). */
  remove(id: number, actorId: number | null): void;
}

const SORT_STEP = 10;

export function toSubjectDto(row: SubjectRow): SubjectDto {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    icon: row.icon,
    sort: row.sort,
    archived: row.archivedAt !== null,
  };
}

/** Maps unique-index failures to the user-facing 409s. */
function translateUnique(err: unknown): never {
  if (isUniqueViolation(err, 'subjects.key')) {
    throw conflict('subject_key_taken', 'Предмет с таким ключом уже есть');
  }
  if (isUniqueViolation(err, 'subjects.name_key')) {
    throw conflict('subject_name_taken', 'Предмет с таким названием уже есть');
  }
  throw err;
}

/** Key for a subject the admin created without one: `s-` + 8 random hex digits. */
const generatedKey = (): string => `s-${randomBytes(4).toString('hex')}`;

export function createSubjectsService(
  db: Db,
  deps: { audit: AuditService; clock?: () => number },
): SubjectsService {
  const { audit, clock = Date.now } = deps;
  const repo = createSubjectsRepo(db);

  const requireRow = (id: number): SubjectRow => {
    const row = repo.findById(id);
    if (!row) {
      throw notFound('Предмет не найден');
    }
    return row;
  };

  return {
    list: (options = {}) =>
      repo.list({ includeArchived: options.includeArchived ?? false }).map(toSubjectDto),
    get: (id) => toSubjectDto(requireRow(id)),
    findRow: (id) => repo.findById(id),
    findByKey: (key) => repo.findByKey(key),

    create(input, actorId) {
      const now = clock();
      return db.transaction(() => {
        let row: SubjectRow;
        try {
          row = repo.insert({
            key: input.key ?? generatedKey(),
            name: input.name,
            nameKey: subjectNameKey(input.name),
            icon: input.icon ?? null,
            sort: input.sort ?? repo.maxSort() + SORT_STEP,
            createdAt: now,
            updatedAt: now,
          });
        } catch (err) {
          translateUnique(err);
        }
        const payload = auditPayload(subjectCreated, { key: row.key, name: row.name });
        audit.record(actorId, subjectCreated, 'subject', row.id, payload);
        return toSubjectDto(row);
      });
    },

    update(id, patch, actorId) {
      const now = clock();
      return db.transaction(() => {
        const current = requireRow(id);
        const set: Partial<SubjectRow> = {};
        const changed: string[] = [];
        if (patch.name !== undefined && patch.name !== current.name) {
          set.name = patch.name;
          set.nameKey = subjectNameKey(patch.name);
          changed.push('name');
        }
        if (patch.icon !== undefined && patch.icon !== current.icon) {
          set.icon = patch.icon;
          changed.push('icon');
        }
        if (patch.sort !== undefined && patch.sort !== current.sort) {
          set.sort = patch.sort;
          changed.push('sort');
        }
        if (patch.archived !== undefined && patch.archived !== (current.archivedAt !== null)) {
          set.archivedAt = patch.archived ? now : null;
          changed.push('archived');
        }
        if (changed.length === 0) {
          return toSubjectDto(current);
        }
        let row: SubjectRow;
        try {
          row = repo.update(id, { ...set, updatedAt: now }) ?? current;
        } catch (err) {
          translateUnique(err);
        }
        const payload = auditPayload(subjectUpdated, {
          changed,
          ...(set.name !== undefined && { name: set.name }),
          ...(set.icon !== undefined && { icon: set.icon }),
          ...(set.sort !== undefined && { sort: set.sort }),
          ...(set.archivedAt !== undefined && { archived: set.archivedAt !== null }),
        });
        audit.record(actorId, subjectUpdated, 'subject', id, payload);
        return toSubjectDto(row);
      });
    },

    remove(id, actorId) {
      db.transaction(() => {
        const current = requireRow(id);
        try {
          repo.delete(id);
        } catch (err) {
          if (isForeignKeyViolation(err)) {
            throw conflict(
              'has_history',
              'По предмету есть задания или история. Его можно только архивировать.',
              { archive: true },
            );
          }
          throw err;
        }
        const payload = auditPayload(subjectDeleted, { key: current.key, name: current.name });
        audit.record(actorId, subjectDeleted, 'subject', id, payload);
      });
    },
  };
}
