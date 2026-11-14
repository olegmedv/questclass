import {
  CHORE_TYPE,
  type ChoreConfig,
  type ChoreRepeat,
} from '@questclass/shared/task-types/chore/contract';
import type {
  ChoreCompletionDto,
  ChoreCompletionStatus,
  ChoreRejectionRequest,
  ChoreStatusDto,
} from '@questclass/shared/task-types/chore/dto';
import { dayKey } from '@questclass/shared/time/dayKey';
import { weekKey } from '@questclass/shared/time/weekKey';
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { choreCompletions, type ChoreCompletionRow } from '../../db/schema/choreCompletions';
import { tasks as tasksTable } from '../../db/schema/tasks';
import { conflict, notFound } from '../../http/errors';
import { auditPayload, defineAuditAction, type AuditService } from '../../modules/audit/service';
import { idemKey, type LedgerService } from '../../modules/ledger/service';
import type { ProgressService } from '../../modules/progress/service';
import type { SettingsService } from '../../modules/settings/service';
import type { TasksService } from '../../modules/tasks/service';
import type { TaskRecord } from '../registry';

export const choreApproved = defineAuditAction(
  'chore.approved',
  z.object({ taskId: z.number(), periodKey: z.string(), xp: z.number(), coins: z.number() }),
);
export const choreRejected = defineAuditAction(
  'chore.rejected',
  z.object({ taskId: z.number(), periodKey: z.string(), comment: z.string().optional() }),
);

export interface CompletionOutcome {
  readonly completion: ChoreCompletionDto;
  /** False when the request repeated an earlier one and nothing changed. */
  readonly created: boolean;
}

export interface ReviewQuery {
  readonly status?: ChoreCompletionStatus;
  readonly learnerId?: number;
}

export interface ChoresService {
  /** The learner's chore: current period and its reports. 404 unless a visible chore. */
  status(learnerId: number, taskId: number): ChoreStatusDto;
  /**
   * «Я сделал»: a pending report for the current period. If the period already has a pending
   * or approved report, that one is returned (`created: false`).
   */
  report(learnerId: number, taskId: number): CompletionOutcome;
  /** Reports for the admin; pending ones oldest first, the others newest first. */
  reviews(query?: ReviewQuery): ChoreCompletionDto[];
  /** Pays the chore's reward once (`chore:<id>`); repeating it changes nothing. */
  approve(id: number, actorId: number | null): CompletionOutcome;
  /** «Не засчитано» with an optional comment; the learner may report again. */
  reject(id: number, input: ChoreRejectionRequest, actorId: number | null): CompletionOutcome;
}

export interface ChoresDeps {
  readonly audit: AuditService;
  readonly settings: SettingsService;
  readonly ledger: LedgerService;
  readonly tasks: TasksService;
  readonly progress: ProgressService;
  readonly clock?: () => number;
}

const LIVE: ChoreCompletionStatus[] = ['pending', 'approved'];
const HISTORY_LIMIT = 50;
const REVIEWS_LIMIT = 200;

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

/** Period a report made at `at` belongs to. */
export function periodKeyOf(repeat: ChoreRepeat, at: number, timeZone: string): string {
  switch (repeat) {
    case 'once':
      return 'once';
    case 'daily':
      return dayKey(at, timeZone);
    case 'weekly':
      return weekKey(at, timeZone);
  }
}

type Joined = { row: ChoreCompletionRow; taskTitle: string };

function toDto({ row, taskTitle }: Joined): ChoreCompletionDto {
  return {
    id: row.id,
    learnerId: row.learnerId,
    taskId: row.taskId,
    taskTitle,
    periodKey: row.periodKey,
    status: row.status,
    note: row.note,
    createdAt: new Date(row.createdAt).toISOString(),
    reviewedAt: iso(row.reviewedAt),
    reviewedBy: row.reviewedBy,
    reward:
      row.rewardXp === null || row.rewardCoins === null
        ? null
        : { xp: row.rewardXp, coins: row.rewardCoins },
  };
}

export function createChoresService(db: Db, deps: ChoresDeps): ChoresService {
  const { audit, settings, ledger, tasks, progress, clock = Date.now } = deps;

  const select = (where: SQL | undefined) =>
    db
      .select({ row: choreCompletions, taskTitle: tasksTable.title })
      .from(choreCompletions)
      .innerJoin(tasksTable, eq(tasksTable.id, choreCompletions.taskId))
      .where(where);

  const joined = (id: number): Joined | undefined => select(eq(choreCompletions.id, id)).get();

  const requireJoined = (id: number): Joined => {
    const found = joined(id);
    if (!found) {
      throw notFound('Отчёт о деле не найден');
    }
    return found;
  };

  /** A chore the learner can see now, with its standing; 404 otherwise. */
  const visibleChore = (learnerId: number, taskId: number) => {
    const task = tasks.record(taskId);
    const standing = progress.standing(learnerId, taskId);
    if (!task || task.type !== CHORE_TYPE || !standing.visible) {
      throw notFound('Дело не найдено');
    }
    return { task: task as TaskRecord<ChoreConfig>, standing };
  };

  /** The task's config was parsed by the chore type in `tasks.record()`. */
  const currentPeriod = (config: ChoreConfig, at: number): string =>
    periodKeyOf(config.repeat, at, settings.get('timezone'));

  const history = (learnerId: number, taskId: number): Joined[] =>
    select(and(eq(choreCompletions.learnerId, learnerId), eq(choreCompletions.taskId, taskId)))
      .orderBy(desc(choreCompletions.id))
      .limit(HISTORY_LIMIT)
      .all();

  return {
    status(learnerId, taskId) {
      const { task } = visibleChore(learnerId, taskId);
      const periodKey = currentPeriod(task.config, clock());
      const items = history(learnerId, taskId);
      const current = items.find((item) => item.row.periodKey === periodKey);
      return {
        taskId,
        repeat: task.config.repeat,
        periodKey,
        current: current ? toDto(current) : null,
        items: items.map(toDto),
      };
    },

    report(learnerId, taskId) {
      const now = clock();
      return db.transaction(() => {
        const { task, standing } = visibleChore(learnerId, taskId);
        if (!standing.available) {
          throw conflict('task_locked', 'Это дело ещё не открыто');
        }
        const periodKey = currentPeriod(task.config, now);
        const live = select(
          and(
            eq(choreCompletions.learnerId, learnerId),
            eq(choreCompletions.taskId, taskId),
            eq(choreCompletions.periodKey, periodKey),
            inArray(choreCompletions.status, LIVE),
          ),
        ).get();
        if (live) {
          return { completion: toDto(live), created: false };
        }
        const row = db
          .insert(choreCompletions)
          .values({ learnerId, taskId, periodKey, status: 'pending', createdAt: now })
          .returning()
          .get();
        progress.markStarted(learnerId, taskId, now);
        return { completion: toDto({ row, taskTitle: task.title }), created: true };
      });
    },

    reviews(query = {}) {
      const status = query.status ?? 'pending';
      return select(
        and(
          eq(choreCompletions.status, status),
          query.learnerId === undefined
            ? undefined
            : eq(choreCompletions.learnerId, query.learnerId),
        ),
      )
        .orderBy(
          status === 'pending'
            ? asc(choreCompletions.createdAt)
            : desc(choreCompletions.reviewedAt),
          asc(choreCompletions.id),
        )
        .limit(REVIEWS_LIMIT)
        .all()
        .map(toDto);
    },

    approve(id, actorId) {
      const now = clock();
      return db.transaction(() => {
        const current = requireJoined(id);
        if (current.row.status === 'approved') {
          return { completion: toDto(current), created: false };
        }
        if (current.row.status === 'rejected') {
          throw conflict('already_reviewed', 'Этот отчёт уже отклонён');
        }
        const task = tasks.record(current.row.taskId);
        const xp = task?.xp ?? 0;
        const coins = task?.coins ?? 0;
        ledger.post({
          learnerId: current.row.learnerId,
          xp,
          coins,
          sourceType: 'chore',
          sourceId: id,
          idemKey: idemKey('chore', id),
          note: current.taskTitle,
          createdBy: actorId,
          at: now,
        });
        const row = db
          .update(choreCompletions)
          .set({
            status: 'approved',
            rewardXp: xp,
            rewardCoins: coins,
            reviewedBy: actorId,
            reviewedAt: now,
          })
          .where(eq(choreCompletions.id, id))
          .returning()
          .get();
        const payload = auditPayload(choreApproved, {
          taskId: row.taskId,
          periodKey: row.periodKey,
          xp,
          coins,
        });
        audit.record(actorId, choreApproved, 'chore_completion', id, payload, {
          learnerId: row.learnerId,
        });
        return { completion: toDto({ row, taskTitle: current.taskTitle }), created: true };
      });
    },

    reject(id, input, actorId) {
      const now = clock();
      return db.transaction(() => {
        const current = requireJoined(id);
        if (current.row.status === 'rejected') {
          return { completion: toDto(current), created: false };
        }
        if (current.row.status === 'approved') {
          throw conflict('already_reviewed', 'Этот отчёт уже засчитан');
        }
        const comment = input.comment || null;
        const row = db
          .update(choreCompletions)
          .set({ status: 'rejected', note: comment, reviewedBy: actorId, reviewedAt: now })
          .where(eq(choreCompletions.id, id))
          .returning()
          .get();
        const payload = auditPayload(choreRejected, {
          taskId: row.taskId,
          periodKey: row.periodKey,
          ...(comment !== null && { comment }),
        });
        audit.record(actorId, choreRejected, 'chore_completion', id, payload, {
          learnerId: row.learnerId,
        });
        return { completion: toDto({ row, taskTitle: current.taskTitle }), created: true };
      });
    },
  };
}
