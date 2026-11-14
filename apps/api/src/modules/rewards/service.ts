import {
  CUSTOM_REASON,
  CUSTOM_REASON_NAME,
  NO_SUBJECT_NAME,
  rewardTextKey,
  type AwardCreateRequest,
  type AwardDto,
  type AwardPageDto,
  type RewardReasonCreateRequest,
  type RewardReasonDto,
  type RewardReasonUpdateRequest,
} from '@questclass/shared/rewards/dto';
import { and, asc, desc, eq, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { isUniqueViolation } from '../../db/constraints';
import { ledger } from '../../db/schema/ledger';
import {
  awards,
  rewardReasons,
  type AwardRow,
  type RewardReasonRow,
} from '../../db/schema/rewardReasons';
import { badRequest, conflict, notFound } from '../../http/errors';
import { auditPayload, defineAuditAction, type AuditService } from '../audit/service';
import { requestKey, type LedgerService } from '../ledger/service';
import type { SubjectsService } from '../subjects/service';
import type { TasksService } from '../tasks/service';
import type { UsersService } from '../users/service';

export const rewardReasonCreated = defineAuditAction(
  'reward_reason.created',
  z.object({ name: z.string(), xp: z.number(), coins: z.number() }),
);
export const rewardReasonUpdated = defineAuditAction(
  'reward_reason.updated',
  z.object({
    changed: z.array(z.string()),
    name: z.string(),
    xp: z.number().optional(),
    coins: z.number().optional(),
    archived: z.boolean().optional(),
  }),
);
export const awardGranted = defineAuditAction(
  'award.granted',
  z.object({
    reasonName: z.string(),
    title: z.string(),
    date: z.string(),
    xp: z.number(),
    coins: z.number(),
    forced: z.boolean(),
  }),
);
export const awardCancelled = defineAuditAction(
  'award.cancelled',
  z.object({ title: z.string(), xp: z.number(), coins: z.number() }),
);

export interface AwardOutcome {
  readonly award: AwardDto;
  /** False when the request was a repeat and nothing changed. */
  readonly created: boolean;
}

export interface AwardQuery {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface RewardsService {
  /** Active reasons by default; the admin list includes archived ones. */
  listReasons(options?: { includeArchived?: boolean }): RewardReasonDto[];
  createReason(input: RewardReasonCreateRequest, actorId: number | null): RewardReasonDto;
  /** Rename, change amounts, archive or restore (reasons are never deleted). */
  updateReason(
    id: number,
    patch: RewardReasonUpdateRequest,
    actorId: number | null,
  ): RewardReasonDto;
  /**
   * Pays a manual award (one ledger row, key `award:<learner>:<requestId>`). A repeated
   * `requestId` returns the first award. The same reason, date, subject and title as an
   * uncancelled award → 409 `duplicate_award` unless `force`.
   */
  grant(learnerId: number, input: AwardCreateRequest, actorId: number | null): AwardOutcome;
  /** Compensating ledger row; repeating it changes nothing (`created: false`). */
  cancel(learnerId: number, awardId: number, actorId: number | null): AwardOutcome;
  /** Newest first. Read-only. */
  list(learnerId: number, query?: AwardQuery): AwardPageDto;
}

export interface RewardsDeps {
  readonly audit: AuditService;
  readonly ledger: LedgerService;
  readonly users: UsersService;
  readonly subjects: SubjectsService;
  readonly tasks: TasksService;
  readonly clock?: () => number;
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
export const CURSOR_PATTERN = /^\d+$/;

const paid = alias(ledger, 'paid');
const reversal = alias(ledger, 'reversal');

interface AwardView {
  readonly row: AwardRow;
  readonly ledgerId: number;
  readonly cancelledAt: number | null;
}

const iso = (ms: number): string => new Date(ms).toISOString();

function toReasonDto(row: RewardReasonRow): RewardReasonDto {
  return {
    id: row.id,
    seedKey: row.seedKey,
    name: row.name,
    xp: row.xp,
    coins: row.coins,
    archived: row.archivedAt !== null,
  };
}

function toAwardDto({ row, ledgerId, cancelledAt }: AwardView): AwardDto {
  return {
    id: row.id,
    learnerId: row.learnerId,
    reasonId: row.reasonId,
    reasonName: row.reasonName,
    title: row.title,
    date: row.date,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    taskId: row.taskId,
    xp: row.xp,
    coins: row.coins,
    note: row.note,
    ledgerId,
    at: iso(row.createdAt),
    cancelledAt: cancelledAt === null ? null : iso(cancelledAt),
    createdBy: row.createdBy,
  };
}

function translateUnique(err: unknown): never {
  if (isUniqueViolation(err, 'reward_reasons.name_key')) {
    throw conflict('reason_name_taken', 'Такая причина уже есть');
  }
  throw err;
}

/** Queries of the module; an award's payment and cancellation are read from the ledger. */
function createRewardsRepo(db: Db) {
  /** Awards with the ledger row that paid them and its reversal, if any. */
  const viewQuery = (where: SQL | undefined) =>
    db
      .select({ row: awards, ledgerId: paid.id, cancelledAt: reversal.at })
      .from(awards)
      .innerJoin(
        paid,
        and(
          eq(paid.sourceType, 'award'),
          eq(paid.sourceId, sql`CAST(${awards.id} AS TEXT)`),
          isNull(paid.reversesId),
        ),
      )
      .leftJoin(reversal, eq(reversal.reversesId, paid.id))
      .where(where);

  return {
    reasons(includeArchived: boolean): RewardReasonRow[] {
      return db
        .select()
        .from(rewardReasons)
        .where(includeArchived ? undefined : isNull(rewardReasons.archivedAt))
        .orderBy(asc(rewardReasons.id))
        .all();
    },
    reason: (id: number): RewardReasonRow | undefined =>
      db.select().from(rewardReasons).where(eq(rewardReasons.id, id)).get(),
    insertReason: (values: typeof rewardReasons.$inferInsert): RewardReasonRow =>
      db.insert(rewardReasons).values(values).returning().get(),
    updateReason: (id: number, set: Partial<RewardReasonRow>): RewardReasonRow | undefined =>
      db.update(rewardReasons).set(set).where(eq(rewardReasons.id, id)).returning().get(),

    insertAward: (values: typeof awards.$inferInsert): AwardRow =>
      db.insert(awards).values(values).returning().get(),
    byRequest: (learnerId: number, requestId: string): AwardRow | undefined =>
      db
        .select()
        .from(awards)
        .where(and(eq(awards.learnerId, learnerId), eq(awards.requestId, requestId)))
        .get(),
    view: (id: number): AwardView | undefined => viewQuery(eq(awards.id, id)).get(),
    /** An uncancelled award of the learner with the same reason, date, subject and title. */
    duplicate(row: {
      learnerId: number;
      reasonId: number | null;
      date: string;
      subjectId: number | null;
      titleKey: string;
    }): AwardView | undefined {
      return viewQuery(
        and(
          eq(awards.learnerId, row.learnerId),
          row.reasonId === null ? isNull(awards.reasonId) : eq(awards.reasonId, row.reasonId),
          eq(awards.date, row.date),
          row.subjectId === null ? isNull(awards.subjectId) : eq(awards.subjectId, row.subjectId),
          eq(awards.titleKey, row.titleKey),
          isNull(reversal.id),
        ),
      )
        .limit(1)
        .get();
    },
    /** Newest first; up to `limit + 1` rows so the caller can tell if more exist. */
    page(learnerId: number, limit: number, before?: number): AwardView[] {
      return viewQuery(
        and(
          eq(awards.learnerId, learnerId),
          before === undefined ? undefined : lt(awards.id, before),
        ),
      )
        .orderBy(desc(awards.id))
        .limit(limit + 1)
        .all();
    },
  };
}

export function createRewardsService(db: Db, deps: RewardsDeps): RewardsService {
  const { audit, ledger: journal, users, subjects, tasks, clock = Date.now } = deps;
  const repo = createRewardsRepo(db);

  const requireLearner = (learnerId: number): void => {
    if (users.findRow(learnerId)?.role !== 'learner') {
      throw notFound('Ученик не найден');
    }
  };

  const requireReason = (id: number): RewardReasonRow => {
    const row = repo.reason(id);
    if (!row) {
      throw notFound('Причина не найдена');
    }
    return row;
  };

  const requireView = (id: number): AwardView => {
    const view = repo.view(id);
    if (!view) {
      throw new Error(`Award ${id} has no ledger row`);
    }
    return view;
  };

  /** Reason of a new award: an active reason, or «Своя награда». */
  const reasonOf = (reasonId: AwardCreateRequest['reasonId']) => {
    if (reasonId === CUSTOM_REASON) {
      return { id: null, name: CUSTOM_REASON_NAME };
    }
    const row = repo.reason(reasonId);
    if (!row || row.archivedAt !== null) {
      throw badRequest('unknown_reason', 'Выберите существующую причину начисления');
    }
    return { id: row.id, name: row.name };
  };

  const subjectOf = (key: string | null | undefined) => {
    if (key === null || key === undefined) {
      return { id: null, name: NO_SUBJECT_NAME };
    }
    const row = subjects.findByKey(key);
    if (!row || row.archivedAt !== null) {
      throw badRequest('unknown_subject', 'Нет такого активного предмета');
    }
    return { id: row.id, name: row.name };
  };

  const taskOf = (taskId: number | null | undefined): number | null => {
    if (taskId === null || taskId === undefined) {
      return null;
    }
    if (!tasks.record(taskId)) {
      throw badRequest('unknown_task', 'Нет такого задания');
    }
    return taskId;
  };

  return {
    listReasons: (options = {}) => repo.reasons(options.includeArchived ?? false).map(toReasonDto),

    createReason(input, actorId) {
      const now = clock();
      return db.transaction(() => {
        let row: RewardReasonRow;
        try {
          row = repo.insertReason({
            name: input.name,
            nameKey: rewardTextKey(input.name),
            xp: input.xp,
            coins: input.coins,
            createdAt: now,
            updatedAt: now,
          });
        } catch (err) {
          translateUnique(err);
        }
        const payload = auditPayload(rewardReasonCreated, {
          name: row.name,
          xp: row.xp,
          coins: row.coins,
        });
        audit.record(actorId, rewardReasonCreated, 'reward_reason', row.id, payload);
        return toReasonDto(row);
      });
    },

    updateReason(id, patch, actorId) {
      const now = clock();
      return db.transaction(() => {
        const current = requireReason(id);
        const next = {
          name: patch.name ?? current.name,
          xp: patch.xp ?? current.xp,
          coins: patch.coins ?? current.coins,
        };
        if (next.xp === 0 && next.coins === 0) {
          throw badRequest('validation_failed', 'Укажите XP или монеты');
        }
        const set: Partial<RewardReasonRow> = {};
        const changed: string[] = [];
        if (next.name !== current.name) {
          set.name = next.name;
          set.nameKey = rewardTextKey(next.name);
          changed.push('name');
        }
        if (next.xp !== current.xp) {
          set.xp = next.xp;
          changed.push('xp');
        }
        if (next.coins !== current.coins) {
          set.coins = next.coins;
          changed.push('coins');
        }
        if (patch.archived !== undefined && patch.archived !== (current.archivedAt !== null)) {
          set.archivedAt = patch.archived ? now : null;
          changed.push('archived');
        }
        if (changed.length === 0) {
          return toReasonDto(current);
        }
        let row: RewardReasonRow;
        try {
          row = repo.updateReason(id, { ...set, updatedAt: now }) ?? current;
        } catch (err) {
          translateUnique(err);
        }
        const payload = auditPayload(rewardReasonUpdated, {
          changed,
          name: row.name,
          ...(set.xp !== undefined && { xp: set.xp }),
          ...(set.coins !== undefined && { coins: set.coins }),
          ...(set.archivedAt !== undefined && { archived: set.archivedAt !== null }),
        });
        audit.record(actorId, rewardReasonUpdated, 'reward_reason', id, payload);
        return toReasonDto(row);
      });
    },

    grant(learnerId, input, actorId) {
      requireLearner(learnerId);
      const key = requestKey('award', learnerId, input.requestId);
      const now = clock();
      return db.transaction(() => {
        const earlier = repo.byRequest(learnerId, input.requestId);
        if (earlier) {
          return { award: toAwardDto(requireView(earlier.id)), created: false };
        }
        const reason = reasonOf(input.reasonId);
        const subject = subjectOf(input.subjectKey);
        const taskId = taskOf(input.taskId);
        const titleKey = rewardTextKey(input.title);
        if (!input.force) {
          const twin = repo.duplicate({
            learnerId,
            reasonId: reason.id,
            date: input.date,
            subjectId: subject.id,
            titleKey,
          });
          if (twin) {
            throw conflict(
              'duplicate_award',
              'За это занятие или задание награда уже выдана. Для другого задания укажите другое название.',
              { awardId: twin.row.id, force: true },
            );
          }
        }
        const row = repo.insertAward({
          learnerId,
          requestId: input.requestId,
          reasonId: reason.id,
          reasonName: reason.name,
          title: input.title,
          titleKey,
          date: input.date,
          subjectId: subject.id,
          subjectName: subject.name,
          taskId,
          xp: input.xp,
          coins: input.coins,
          note: input.note || null,
          createdBy: actorId,
          createdAt: now,
        });
        journal.post({
          learnerId,
          xp: input.xp,
          coins: input.coins,
          sourceType: 'award',
          sourceId: row.id,
          idemKey: key,
          note: input.title,
          createdBy: actorId,
          at: now,
        });
        const payload = auditPayload(awardGranted, {
          reasonName: reason.name,
          title: row.title,
          date: row.date,
          xp: row.xp,
          coins: row.coins,
          forced: input.force === true,
        });
        audit.record(actorId, awardGranted, 'award', row.id, payload, { learnerId });
        return { award: toAwardDto(requireView(row.id)), created: true };
      });
    },

    cancel(learnerId, awardId, actorId) {
      requireLearner(learnerId);
      return db.transaction(() => {
        const view = repo.view(awardId);
        if (view?.row.learnerId !== learnerId) {
          throw notFound('Начисление не найдено');
        }
        if (view.cancelledAt !== null) {
          return { award: toAwardDto(view), created: false };
        }
        journal.reverse(view.ledgerId, {
          createdBy: actorId,
          learnerId,
          note: `Отмена: ${view.row.title}`,
        });
        const payload = auditPayload(awardCancelled, {
          title: view.row.title,
          xp: view.row.xp,
          coins: view.row.coins,
        });
        audit.record(actorId, awardCancelled, 'award', awardId, payload, { learnerId });
        return { award: toAwardDto(requireView(awardId)), created: true };
      });
    },

    list(learnerId, query = {}) {
      requireLearner(learnerId);
      const limit = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
      const before = query.cursor === undefined ? undefined : Number(query.cursor);
      const rows = repo.page(learnerId, limit, before);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(toAwardDto),
        nextCursor: rows.length > limit && last ? String(last.row.id) : null,
      };
    },
  };
}
