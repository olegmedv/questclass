import type {
  ClosureRequest,
  LearnerProgressDto,
  ProgressState,
  RewardDto,
  TaskProgressDto,
} from '@questclass/shared/progress/dto';
import type { LedgerEntryDto } from '@questclass/shared/economy/dto';
import type { LearnerTaskDto } from '@questclass/shared/tasks/dto';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { taskAssignments } from '../../db/schema/assignments';
import { progressResets, type ProgressResetRow } from '../../db/schema/progressResets';
import { taskProgress, type TaskProgressRow } from '../../db/schema/progress';
import { conflict, notFound } from '../../http/errors';
import { auditPayload, defineAuditAction, type AuditService } from '../audit/service';
import { idemKey, requestKey, type LedgerService } from '../ledger/service';
import type { SettingsService } from '../settings/service';
import type { StreakService } from '../streak/service';
import type { SubjectsService } from '../subjects/service';
import type { TasksService } from '../tasks/service';
import type { UsersService } from '../users/service';
import { computeAvailability, type TaskFacts } from './availability';

export const progressClosed = defineAuditAction(
  'progress.closed',
  z.object({
    taskId: z.number(),
    withReward: z.boolean(),
    xp: z.number(),
    coins: z.number(),
    reason: z.string().optional(),
  }),
);
export const progressReopened = defineAuditAction(
  'progress.reopened',
  z.object({ taskId: z.number(), epoch: z.number() }),
);
export const progressReset = defineAuditAction(
  'progress.reset',
  z.object({ taskId: z.number().nullable(), requestId: z.string() }),
);
export const coinsReset = defineAuditAction(
  'ledger.coins_reset',
  z.object({ before: z.number(), requestId: z.string() }),
);

/** Where a task stands for a learner right now. */
export interface TaskStanding {
  readonly visible: boolean;
  readonly available: boolean;
  readonly epoch: number;
  readonly state: ProgressState;
  readonly completed: boolean;
}

export interface ResultInput {
  /** Correct answers. */
  readonly correct: number;
  /** Questions in the attempt. */
  readonly total: number;
  /** Decided by the task type (e.g. `quiz.minCorrect`). */
  readonly passed: boolean;
  /** Epoch ms (default: now). */
  readonly at?: number;
}

export interface ActionOutcome {
  readonly progress: TaskProgressDto;
  /** What was actually paid by this action (0/0 when nothing). */
  readonly reward: RewardDto;
}

export interface ProgressService {
  /** Current epoch of a task for a learner (0 until the first reset/reopening). */
  epochOf(learnerId: number, taskId: number): number;
  standing(learnerId: number, taskId: number): TaskStanding;
  /** Marks the task as started in the current epoch (no-op when already touched). */
  markStarted(learnerId: number, taskId: number, at?: number): void;
  /**
   * Marks the task as passed in the current epoch without paying anything: for task types that
   * pay their own reward (an approved one-time chore). No-op when already passed or closed.
   * Meant to run inside the caller's transaction.
   */
  markPassed(learnerId: number, taskId: number, at?: number): void;
  /**
   * Records a finished attempt in the current epoch and pays the reward of a pass. Meant to run
   * inside the caller's transaction (the attempt's `finish`).
   */
  recordResult(learnerId: number, taskId: number, result: ResultInput): ActionOutcome;
  /** Admin closes a task by hand, optionally with its full reward (paid once, ever). */
  close(
    learnerId: number,
    taskId: number,
    input: ClosureRequest,
    actorId: number | null,
  ): ActionOutcome;
  /** «Пройти с мамой»: a new epoch for one task; a better result is topped up. */
  reopen(learnerId: number, taskId: number, actorId: number | null): TaskProgressDto;
  /** Forgets results of one task or of all; coins, purchases and the hero stay. */
  reset(
    learnerId: number,
    input: { taskId?: number; requestId: string },
    actorId: number | null,
  ): { created: boolean };
  /** «Обнулить монеты»: one compensating ledger row that brings coins to 0. */
  coinsReset(
    learnerId: number,
    requestId: string,
    actorId: number | null,
  ): { entry: LedgerEntryDto; created: boolean };
  /** Every visible task with state, score, dates and availability. Read-only. */
  learnerProgress(learnerId: number): LearnerProgressDto;
  /** When the learner's progress was last reset as a whole (streaks start after it). */
  lastFullResetAt(learnerId: number): number | null;
}

export interface ProgressDeps {
  readonly audit: AuditService;
  readonly settings: SettingsService;
  readonly ledger: LedgerService;
  readonly users: UsersService;
  readonly tasks: TasksService;
  readonly subjects: SubjectsService;
  /** An admin closure counts as a study day. */
  readonly streak: StreakService;
  readonly clock?: () => number;
}

/** Reward for `correct` of `total`: proportional, rounded down. */
export function proportionalReward(
  task: { readonly xp: number; readonly coins: number },
  correct: number,
  total: number,
): RewardDto {
  if (total <= 0) {
    return { xp: 0, coins: 0 };
  }
  const share = Math.max(0, Math.min(correct, total));
  return {
    xp: Math.floor((task.xp * share) / total),
    coins: Math.floor((task.coins * share) / total),
  };
}

interface EpochInfo {
  /** Epoch results are written to now. */
  readonly current: number;
  /** First epoch after the last reset: completions from here on still count. */
  readonly base: number;
  /** What opened the current epoch. */
  readonly openedBy: 'start' | 'reset' | 'reopen';
}

function epochInfo(resets: readonly ProgressResetRow[], taskId: number): EpochInfo {
  const affecting = resets.filter((r) => r.taskId === null || r.taskId === taskId);
  const lastReset = affecting.findLastIndex((r) => r.kind === 'reset');
  return {
    current: affecting.length,
    base: lastReset + 1,
    openedBy: affecting.at(-1)?.kind ?? 'start',
  };
}

function factsFor(rows: readonly TaskProgressRow[], info: EpochInfo): TaskFacts {
  const counted = rows.filter((r) => r.epoch >= info.base && r.epoch <= info.current);
  const completions = counted.filter((r) => r.state !== 'started');
  const completedAt = completions.reduce<number | null>(
    (latest, r) =>
      r.completedAt !== null && (latest === null || r.completedAt > latest)
        ? r.completedAt
        : latest,
    null,
  );
  return { completed: completions.length > 0, started: counted.length > 0, completedAt };
}

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());
const ZERO: RewardDto = { xp: 0, coins: 0 };

export function createProgressService(db: Db, deps: ProgressDeps): ProgressService {
  const { audit, settings, ledger, users, tasks, subjects, streak, clock = Date.now } = deps;

  const requireLearner = (learnerId: number): void => {
    if (users.findRow(learnerId)?.role !== 'learner') {
      throw notFound('Ученик не найден');
    }
  };

  const requireTask = (taskId: number) => {
    const task = tasks.record(taskId);
    if (!task) {
      throw notFound('Задание не найдено');
    }
    return task;
  };

  const resetsOf = (learnerId: number): ProgressResetRow[] =>
    db
      .select()
      .from(progressResets)
      .where(eq(progressResets.learnerId, learnerId))
      .orderBy(asc(progressResets.id))
      .all();

  const rowsOf = (learnerId: number, taskId?: number): TaskProgressRow[] =>
    db
      .select()
      .from(taskProgress)
      .where(
        and(
          eq(taskProgress.learnerId, learnerId),
          taskId === undefined ? undefined : eq(taskProgress.taskId, taskId),
        ),
      )
      .all();

  const infoOf = (learnerId: number, taskId: number): EpochInfo =>
    epochInfo(resetsOf(learnerId), taskId);

  const currentRow = (learnerId: number, taskId: number, epoch: number) =>
    rowsOf(learnerId, taskId).find((row) => row.epoch === epoch);

  /** Builds the full picture; the single source for both learner and admin views. */
  const picture = (learnerId: number): LearnerProgressDto => {
    const visible: LearnerTaskDto[] = tasks.visibleTo(learnerId);
    const subjectKeys = new Map(
      subjects.list({ includeArchived: true }).map((s) => [s.id, s.key] as const),
    );
    const positions = new Map(
      db
        .select({ taskId: taskAssignments.taskId, position: taskAssignments.position })
        .from(taskAssignments)
        .where(eq(taskAssignments.learnerId, learnerId))
        .all()
        .map((row) => [row.taskId, row.position] as const),
    );
    const resets = resetsOf(learnerId);
    const rows = rowsOf(learnerId);
    const infos = new Map(visible.map((t) => [t.id, epochInfo(resets, t.id)] as const));
    const facts = new Map(
      visible.map((t) => {
        const info = infos.get(t.id) ?? epochInfo(resets, t.id);
        return [
          t.id,
          factsFor(
            rows.filter((r) => r.taskId === t.id),
            info,
          ),
        ] as const;
      }),
    );
    const mode = settings.get('progress.unlockMode');
    const availability = computeAvailability({
      mode,
      rotationSubjects: settings.get('progress.rotationSubjects'),
      tasks: visible.map((t) => ({
        id: t.id,
        subjectKey: t.subjectId === null ? null : (subjectKeys.get(t.subjectId) ?? null),
        assignmentPosition: positions.get(t.id) ?? null,
      })),
      facts,
    });

    const items = visible.map((t): TaskProgressDto => {
      const info = infos.get(t.id) ?? epochInfo(resets, t.id);
      const row = rows.find((r) => r.taskId === t.id && r.epoch === info.current);
      const fact = facts.get(t.id);
      const open = availability.byTask.get(t.id);
      return {
        taskId: t.id,
        title: t.title,
        type: t.type,
        subjectId: t.subjectId,
        assigned: t.assigned,
        epoch: info.current,
        state: row?.state ?? 'none',
        completed: fact?.completed ?? false,
        score: row?.score ?? null,
        total: row?.total ?? null,
        startedAt: iso(row?.startedAt ?? null),
        completedAt: iso(fact?.completedAt ?? null),
        closedBy: row?.closedBy ?? null,
        closedReason: row?.closedReason ?? null,
        available: open?.available ?? false,
        lockReason: open?.lockReason ?? null,
      };
    });
    const assigned = items.filter((item) => item.assigned);
    return {
      mode,
      nextTaskId: availability.nextTaskId,
      assignedTotal: assigned.length,
      assignedDone: assigned.filter((item) => item.completed).length,
      tasks: items,
    };
  };

  const progressDto = (learnerId: number, taskId: number): TaskProgressDto => {
    const found = picture(learnerId).tasks.find((t) => t.taskId === taskId);
    if (found) {
      return found;
    }
    // Not visible to the learner any more (archived, unassigned): report the bare facts.
    const task = requireTask(taskId);
    const info = infoOf(learnerId, taskId);
    const rows = rowsOf(learnerId, taskId);
    const row = rows.find((r) => r.epoch === info.current);
    const fact = factsFor(rows, info);
    return {
      taskId,
      title: task.title,
      type: task.type,
      subjectId: task.subjectId,
      assigned: false,
      epoch: info.current,
      state: row?.state ?? 'none',
      completed: fact.completed,
      score: row?.score ?? null,
      total: row?.total ?? null,
      startedAt: iso(row?.startedAt ?? null),
      completedAt: iso(fact.completedAt),
      closedBy: row?.closedBy ?? null,
      closedReason: row?.closedReason ?? null,
      available: false,
      lockReason: null,
    };
  };

  /** Writes the current-epoch row (insert or update). */
  const writeRow = (
    learnerId: number,
    taskId: number,
    epoch: number,
    values: Partial<Omit<TaskProgressRow, 'id' | 'learnerId' | 'taskId' | 'epoch'>>,
  ): void => {
    const now = clock();
    const existing = currentRow(learnerId, taskId, epoch);
    if (existing) {
      db.update(taskProgress)
        .set({ ...values, updatedAt: now })
        .where(eq(taskProgress.id, existing.id))
        .run();
      return;
    }
    db.insert(taskProgress)
      .values({
        learnerId,
        taskId,
        epoch,
        state: 'started',
        startedAt: now,
        ...values,
        updatedAt: now,
      })
      .run();
  };

  /** Pays a pass: once per task ever, plus a top-up of a better result in a reopened epoch. */
  const payPass = (
    learnerId: number,
    taskId: number,
    target: RewardDto,
    info: EpochInfo,
  ): RewardDto => {
    const first = ledger.post({
      learnerId,
      xp: target.xp,
      coins: target.coins,
      sourceType: 'task',
      sourceId: taskId,
      idemKey: idemKey('task', taskId, 'learner', learnerId, 'pass'),
      note: 'Награда за задание',
    });
    if (first.created) {
      return target;
    }
    if (info.openedBy !== 'reopen') {
      return ZERO; // after a reset the reward is not paid again
    }
    const paid = ledger.sourceTotals(learnerId, 'task', taskId);
    const topUp = {
      xp: Math.max(0, target.xp - paid.xp),
      coins: Math.max(0, target.coins - paid.coins),
    };
    if (topUp.xp === 0 && topUp.coins === 0) {
      return ZERO;
    }
    const extra = ledger.post({
      learnerId,
      ...topUp,
      sourceType: 'task',
      sourceId: taskId,
      idemKey: idemKey('task', taskId, 'learner', learnerId, 'topup', info.current),
      note: 'Доплата за лучший результат',
    });
    return extra.created ? topUp : ZERO;
  };

  return {
    epochOf: (learnerId, taskId) => infoOf(learnerId, taskId).current,

    standing(learnerId, taskId) {
      const info = infoOf(learnerId, taskId);
      const item = picture(learnerId).tasks.find((t) => t.taskId === taskId);
      return {
        visible: item !== undefined,
        available: item?.available ?? false,
        epoch: info.current,
        state: item?.state ?? currentRow(learnerId, taskId, info.current)?.state ?? 'none',
        completed: item?.completed ?? false,
      };
    },

    markStarted(learnerId, taskId, at) {
      const epoch = infoOf(learnerId, taskId).current;
      const now = at ?? clock();
      db.insert(taskProgress)
        .values({ learnerId, taskId, epoch, state: 'started', startedAt: now, updatedAt: now })
        .onConflictDoNothing()
        .run();
    },

    markPassed(learnerId, taskId, at) {
      const epoch = infoOf(learnerId, taskId).current;
      const row = currentRow(learnerId, taskId, epoch);
      if (row && row.state !== 'started') {
        return;
      }
      writeRow(learnerId, taskId, epoch, { state: 'passed', completedAt: at ?? clock() });
    },

    recordResult(learnerId, taskId, result) {
      return db.transaction(() => {
        const task = requireTask(taskId);
        const info = infoOf(learnerId, taskId);
        const row = currentRow(learnerId, taskId, info.current);
        if (row && row.state !== 'started') {
          throw conflict('already_completed', 'Задание уже выполнено');
        }
        const at = result.at ?? clock();
        let reward = ZERO;
        if (result.passed) {
          writeRow(learnerId, taskId, info.current, {
            state: 'passed',
            score: result.correct,
            total: result.total,
            completedAt: at,
          });
          reward = payPass(
            learnerId,
            taskId,
            proportionalReward(task, result.correct, result.total),
            info,
          );
        } else {
          writeRow(learnerId, taskId, info.current, { score: result.correct, total: result.total });
        }
        return { progress: progressDto(learnerId, taskId), reward };
      });
    },

    close(learnerId, taskId, input, actorId) {
      return db.transaction(() => {
        requireLearner(learnerId);
        const task = requireTask(taskId);
        if (task.status !== 'published') {
          throw conflict('task_not_published', 'Задание не опубликовано');
        }
        const info = infoOf(learnerId, taskId);
        const row = currentRow(learnerId, taskId, info.current);
        if (row && row.state !== 'started') {
          throw conflict('already_completed', 'Задание уже выполнено');
        }
        writeRow(learnerId, taskId, info.current, {
          state: 'closed',
          completedAt: clock(),
          closedBy: actorId,
          closedReason: input.reason ?? null,
        });
        streak.recordDay(learnerId);
        let reward = ZERO;
        if (input.withReward) {
          const paid = ledger.post({
            learnerId,
            xp: task.xp,
            coins: task.coins,
            sourceType: 'task',
            sourceId: taskId,
            idemKey: idemKey('task', taskId, 'learner', learnerId, 'pass'),
            note: 'Задание закрыто админом',
            createdBy: actorId,
          });
          reward = paid.created ? { xp: task.xp, coins: task.coins } : ZERO;
        }
        const payload = auditPayload(progressClosed, {
          taskId,
          withReward: input.withReward,
          ...reward,
          ...(input.reason !== undefined && { reason: input.reason }),
        });
        audit.record(actorId, progressClosed, 'task', taskId, payload, { learnerId });
        return { progress: progressDto(learnerId, taskId), reward };
      });
    },

    reopen(learnerId, taskId, actorId) {
      return db.transaction(() => {
        requireLearner(learnerId);
        requireTask(taskId);
        const info = infoOf(learnerId, taskId);
        if (!currentRow(learnerId, taskId, info.current)) {
          throw conflict('nothing_to_reopen', 'По этому заданию ещё нет результата');
        }
        db.insert(progressResets)
          .values({ learnerId, taskId, kind: 'reopen', at: clock(), by: actorId })
          .run();
        const payload = auditPayload(progressReopened, { taskId, epoch: info.current + 1 });
        audit.record(actorId, progressReopened, 'task', taskId, payload, { learnerId });
        return progressDto(learnerId, taskId);
      });
    },

    reset(learnerId, input, actorId) {
      return db.transaction(() => {
        requireLearner(learnerId);
        if (input.taskId !== undefined) {
          requireTask(input.taskId);
        }
        const repeated = db
          .select({ id: progressResets.id })
          .from(progressResets)
          .where(
            and(
              eq(progressResets.learnerId, learnerId),
              eq(progressResets.requestId, input.requestId),
            ),
          )
          .get();
        if (repeated) {
          return { created: false };
        }
        const taskId = input.taskId ?? null;
        db.insert(progressResets)
          .values({
            learnerId,
            taskId,
            kind: 'reset',
            requestId: input.requestId,
            at: clock(),
            by: actorId,
          })
          .run();
        const payload = auditPayload(progressReset, { taskId, requestId: input.requestId });
        audit.record(
          actorId,
          progressReset,
          taskId === null ? 'learner' : 'task',
          taskId ?? learnerId,
          payload,
          {
            learnerId,
          },
        );
        return { created: true };
      });
    },

    coinsReset(learnerId, requestId, actorId) {
      return db.transaction(() => {
        requireLearner(learnerId);
        const before = ledger.balance(learnerId).coins;
        // A zero row is still written: it marks the request as done, so a retry cannot reset
        // coins earned in between.
        const result = ledger.post({
          learnerId,
          coins: -before,
          sourceType: 'coins_reset',
          idemKey: requestKey('coins-reset', learnerId, requestId),
          note: 'Монеты обнулены',
          createdBy: actorId,
        });
        if (result.created) {
          const payload = auditPayload(coinsReset, { before, requestId });
          audit.record(actorId, coinsReset, 'learner', learnerId, payload, { learnerId });
        }
        return result;
      });
    },

    learnerProgress(learnerId) {
      requireLearner(learnerId);
      return picture(learnerId);
    },

    lastFullResetAt(learnerId) {
      const full = resetsOf(learnerId).filter((r) => r.taskId === null && r.kind === 'reset');
      return full.at(-1)?.at ?? null;
    },
  };
}
