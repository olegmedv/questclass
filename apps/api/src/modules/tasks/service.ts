import type {
  LearnerTaskDto,
  TaskCreateRequest,
  TaskDto,
  TaskUpdateRequest,
} from '@questclass/shared/tasks/dto';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { isForeignKeyViolation } from '../../db/constraints';
import type { TaskRow } from '../../db/schema/tasks';
import { HttpError, badRequest, conflict, notFound, zodDetails } from '../../http/errors';
import type { TaskRecord, TaskTypePlugin, TaskTypeRegistry } from '../../task-types/registry';
import { auditPayload, defineAuditAction, type AuditService } from '../audit/service';
import type { LedgerService } from '../ledger/service';
import type { SettingsService } from '../settings/service';
import type { SubjectsService } from '../subjects/service';
import type { UsersService } from '../users/service';
import { createTasksRepo, type TaskFilter } from './repo';

export const taskCreated = defineAuditAction(
  'task.created',
  z.object({ type: z.string(), title: z.string(), subjectId: z.number().nullable() }),
);
export const taskUpdated = defineAuditAction(
  'task.updated',
  z.object({
    changed: z.array(z.string()),
    title: z.string(),
    status: z.string().optional(),
  }),
);
export const taskDeleted = defineAuditAction(
  'task.deleted',
  z.object({ type: z.string(), title: z.string() }),
);
export const taskAssigned = defineAuditAction(
  'task.assigned',
  z.object({ taskId: z.number(), title: z.string() }),
);
export const taskUnassigned = defineAuditAction(
  'task.unassigned',
  z.object({ taskId: z.number(), title: z.string() }),
);

export interface AssignResult {
  readonly task: TaskDto;
  /** False when the learner already had the task assigned. */
  readonly created: boolean;
}

export interface TasksService {
  list(filter?: TaskFilter): TaskDto[];
  get(id: number): TaskDto;
  /** The task with its config parsed by its type; undefined if missing or of an unknown type. */
  record(id: number): TaskRecord | undefined;
  create(input: TaskCreateRequest, actorId: number | null): TaskDto;
  /** Applies a patch; a task that ends up `published` must pass its type's publish checks. */
  update(id: number, patch: TaskUpdateRequest, actorId: number | null): TaskDto;
  /** Deletes a task without history; otherwise 409 `has_history` (archive it instead). */
  remove(id: number, actorId: number | null): void;
  assign(taskId: number, learnerId: number, actorId: number | null): AssignResult;
  unassign(taskId: number, learnerId: number, actorId: number | null): void;
  /** Learners the task is for: its assignees, or every active learner if it has none. */
  audience(taskId: number): number[];
  /** Tasks the learner can see now (published, released, for them), public config only. */
  visibleTo(learnerId: number): LearnerTaskDto[];
  /** One visible task; 404 when the learner may not see it. */
  visibleTask(learnerId: number, taskId: number): LearnerTaskDto;
}

export interface TasksDeps {
  readonly audit: AuditService;
  readonly settings: SettingsService;
  readonly ledger: LedgerService;
  readonly users: UsersService;
  readonly subjects: SubjectsService;
  readonly taskTypes: TaskTypeRegistry;
  readonly clock?: () => number;
}

const SORT_STEP = 10;
const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

const cannotPublish = (errors: string[]) =>
  new HttpError(422, 'cannot_publish', 'Задание пока нельзя опубликовать', { errors });

export function createTasksService(db: Db, deps: TasksDeps): TasksService {
  const { audit, settings, ledger, users, subjects, taskTypes, clock = Date.now } = deps;
  const repo = createTasksRepo(db);

  const requireRow = (id: number): TaskRow => {
    const row = repo.findById(id);
    if (!row) {
      throw notFound('Задание не найдено');
    }
    return row;
  };

  const pluginOf = (type: string): TaskTypePlugin => {
    const plugin = taskTypes.get(type);
    if (!plugin) {
      throw badRequest('unknown_task_type', `Нет такого типа задания: ${type}`);
    }
    return plugin;
  };

  const parseConfig = (plugin: TaskTypePlugin, config: unknown): unknown => {
    const parsed = plugin.contract.configSchema.safeParse(config);
    if (!parsed.success) {
      throw badRequest(
        'invalid_config',
        'Некорректные настройки задания',
        zodDetails(parsed.error),
      );
    }
    return parsed.data;
  };

  const requireSubject = (subjectId: number | null): number | null => {
    if (subjectId === null) {
      return null;
    }
    const subject = subjects.findRow(subjectId);
    if (!subject || subject.archivedAt !== null) {
      throw badRequest('unknown_subject', 'Нет такого активного предмета');
    }
    return subject.id;
  };

  const toRecord = (row: TaskRow, config: unknown): TaskRecord => ({
    id: row.id,
    type: row.type,
    subjectId: row.subjectId,
    title: row.title,
    description: row.description,
    config,
    xp: row.xp,
    coins: row.coins,
    status: row.status,
    releaseAt: row.releaseAt,
    lessonDate: row.lessonDate,
    sort: row.sort,
  });

  /** Stored config parsed by its type, or undefined (unknown type, outdated config). */
  const recordOf = (row: TaskRow): TaskRecord | undefined => {
    const plugin = taskTypes.get(row.type);
    const parsed = plugin?.contract.configSchema.safeParse(row.config);
    if (!parsed?.success) {
      console.warn(`Task ${row.id}: type ${row.type} is unknown or its config is invalid`);
      return undefined;
    }
    return toRecord(row, parsed.data);
  };

  const toDto = (row: TaskRow, assignees: number[]): TaskDto => ({
    id: row.id,
    type: row.type,
    subjectId: row.subjectId,
    title: row.title,
    description: row.description,
    config: row.config,
    xp: row.xp,
    coins: row.coins,
    status: row.status,
    releaseAt: iso(row.releaseAt),
    lessonDate: row.lessonDate,
    sort: row.sort,
    externalId: row.externalId,
    assignees,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    publishedAt: iso(row.publishedAt),
  });

  const dtoOf = (row: TaskRow): TaskDto => toDto(row, repo.assignees([row.id]).get(row.id) ?? []);

  const publishErrors = (plugin: TaskTypePlugin, record: TaskRecord): string[] => [
    ...plugin.contract.canPublish(record),
    ...(plugin.publishChecks?.(record, { db, settings }) ?? []),
  ];

  const learnerDto = (row: TaskRow, position: number | null): LearnerTaskDto | undefined => {
    const record = recordOf(row);
    const plugin = taskTypes.get(row.type);
    if (!record || !plugin) {
      return undefined;
    }
    return {
      id: row.id,
      type: row.type,
      subjectId: row.subjectId,
      title: row.title,
      description: row.description,
      config: plugin.contract.publicConfig(record.config),
      xp: row.xp,
      coins: row.coins,
      releaseAt: iso(row.releaseAt),
      lessonDate: row.lessonDate,
      sort: row.sort,
      assigned: position !== null,
    };
  };

  const requireActiveLearner = (learnerId: number): void => {
    const user = users.findRow(learnerId);
    if (user?.role !== 'learner' || !user.active) {
      throw notFound('Ученик не найден');
    }
  };

  return {
    list(filter = {}) {
      const rows = repo.list(filter);
      const assignees = repo.assignees(rows.map((row) => row.id));
      return rows.map((row) => toDto(row, assignees.get(row.id) ?? []));
    },

    get: (id) => dtoOf(requireRow(id)),

    record(id) {
      const row = repo.findById(id);
      return row && recordOf(row);
    },

    create(input, actorId) {
      const plugin = pluginOf(input.type);
      const config = parseConfig(plugin, input.config ?? plugin.contract.defaultConfig());
      const now = clock();
      return db.transaction(() => {
        const subjectId = requireSubject(input.subjectId ?? null);
        const row = repo.insert({
          type: input.type,
          subjectId,
          title: input.title,
          description: input.description ?? '',
          config,
          xp: input.xp ?? settings.get('economy.defaultTaskXp'),
          coins: input.coins ?? settings.get('economy.defaultTaskCoins'),
          status: 'draft',
          releaseAt: input.releaseAt ? Date.parse(input.releaseAt) : null,
          lessonDate: input.lessonDate ?? null,
          sort: input.sort ?? repo.maxSort(subjectId) + SORT_STEP,
          createdBy: actorId,
          createdAt: now,
          updatedAt: now,
        });
        const payload = auditPayload(taskCreated, {
          type: row.type,
          title: row.title,
          subjectId: row.subjectId,
        });
        audit.record(actorId, taskCreated, 'task', row.id, payload);
        return dtoOf(row);
      });
    },

    update(id, patch, actorId) {
      const now = clock();
      return db.transaction(() => {
        const current = requireRow(id);
        const plugin = pluginOf(current.type);
        const proposed: Partial<TaskRow> = {
          ...(patch.subjectId !== undefined && { subjectId: requireSubject(patch.subjectId) }),
          ...(patch.title !== undefined && { title: patch.title }),
          ...(patch.description !== undefined && { description: patch.description }),
          ...(patch.config !== undefined && { config: parseConfig(plugin, patch.config) }),
          ...(patch.xp !== undefined && { xp: patch.xp }),
          ...(patch.coins !== undefined && { coins: patch.coins }),
          ...(patch.releaseAt !== undefined && {
            releaseAt: patch.releaseAt === null ? null : Date.parse(patch.releaseAt),
          }),
          ...(patch.lessonDate !== undefined && { lessonDate: patch.lessonDate }),
          ...(patch.sort !== undefined && { sort: patch.sort }),
          ...(patch.status !== undefined && { status: patch.status }),
        };
        // Only real changes are written and audited.
        const set: Partial<TaskRow> = {};
        const changed: string[] = [];
        for (const [key, value] of Object.entries(proposed) as [keyof TaskRow, unknown][]) {
          if (JSON.stringify(value) !== JSON.stringify(current[key])) {
            Object.assign(set, { [key]: value });
            changed.push(key);
          }
        }
        if (changed.length === 0) {
          return dtoOf(current);
        }

        const next: TaskRow = { ...current, ...set };
        if (next.status === 'published') {
          const errors = publishErrors(plugin, toRecord(next, parseConfig(plugin, next.config)));
          if (errors.length > 0) {
            throw cannotPublish(errors);
          }
          if (current.status !== 'published') {
            set.publishedAt = now;
          }
        }
        const row = repo.update(id, { ...set, updatedAt: now }) ?? current;
        const payload = auditPayload(taskUpdated, {
          changed,
          title: row.title,
          ...(set.status !== undefined && { status: set.status }),
        });
        audit.record(actorId, taskUpdated, 'task', id, payload);
        return dtoOf(row);
      });
    },

    remove(id, actorId) {
      db.transaction(() => {
        const current = requireRow(id);
        const history = () =>
          conflict('has_history', 'У задания есть история. Его можно только архивировать.', {
            archive: true,
          });
        if (ledger.hasSource('task', id)) {
          throw history();
        }
        try {
          repo.deleteAssignmentsOf(id);
          repo.delete(id);
        } catch (err) {
          if (isForeignKeyViolation(err)) {
            throw history();
          }
          throw err;
        }
        const payload = auditPayload(taskDeleted, { type: current.type, title: current.title });
        audit.record(actorId, taskDeleted, 'task', id, payload);
      });
    },

    assign(taskId, learnerId, actorId) {
      return db.transaction(() => {
        const task = requireRow(taskId);
        requireActiveLearner(learnerId);
        if (repo.findAssignment(taskId, learnerId)) {
          return { task: dtoOf(task), created: false };
        }
        repo.insertAssignment({
          taskId,
          learnerId,
          position: repo.nextPosition(learnerId),
          createdBy: actorId,
          createdAt: clock(),
        });
        const payload = auditPayload(taskAssigned, { taskId, title: task.title });
        audit.record(actorId, taskAssigned, 'task', taskId, payload, { learnerId });
        return { task: dtoOf(task), created: true };
      });
    },

    unassign(taskId, learnerId, actorId) {
      db.transaction(() => {
        const task = requireRow(taskId);
        if (!repo.deleteAssignment(taskId, learnerId)) {
          throw notFound('Это задание не назначено ученику');
        }
        const payload = auditPayload(taskUnassigned, { taskId, title: task.title });
        audit.record(actorId, taskUnassigned, 'task', taskId, payload, { learnerId });
      });
    },

    audience(taskId) {
      requireRow(taskId);
      const assigned = repo.assignees([taskId]).get(taskId);
      return assigned && assigned.length > 0
        ? assigned
        : users.activeLearners().map((learner) => learner.id);
    },

    visibleTo(learnerId) {
      return repo
        .visibleFor(learnerId, clock())
        .map(({ task, position }) => learnerDto(task, position))
        .filter((dto): dto is LearnerTaskDto => dto !== undefined);
    },

    visibleTask(learnerId, taskId) {
      const [visible] = repo.visibleFor(learnerId, clock(), taskId);
      const dto = visible && learnerDto(visible.task, visible.position);
      if (!dto) {
        throw notFound('Задание не найдено');
      }
      return dto;
    },
  };
}
