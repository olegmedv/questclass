/**
 * The attempts engine, shared by every task type that grades answers to bank questions (quiz,
 * video lesson): a type takes part by implementing `grade()`. An attempt snapshots N random
 * questions, takes each answer once, and is finished in one transaction together with progress,
 * reward and streak. Retries: `quiz.autoRetries` free ones after a fail, then only with the
 * admin's permission (a retry grant, used by exactly one attempt).
 */
import type {
  AdminAttemptDto,
  AttemptDto,
  AttemptQuestionDto,
  AttemptSummaryDto,
  RetryGrantDto,
  RetryRequestDto,
  RetryRequestStatus,
  RetryStateDto,
} from '@questclass/shared/attempts/dto';
import type { OptionId, QuestionDto, QuestionOption } from '@questclass/shared/questions/schema';
import { and, asc, desc, eq, notExists, sql } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { attemptAnswers, type AttemptAnswerRow } from '../../db/schema/attemptAnswers';
import { attemptQuestions, type AttemptQuestionRow } from '../../db/schema/attemptQuestions';
import { attempts, type AttemptRow } from '../../db/schema/attempts';
import { retryGrants, type RetryGrantRow } from '../../db/schema/retryGrants';
import { retryRequests, type RetryRequestRow } from '../../db/schema/retryRequests';
import { tasks } from '../../db/schema/tasks';
import { HttpError, conflict, notFound } from '../../http/errors';
import type { TaskRecord, TaskTypePlugin, TaskTypeRegistry } from '../../task-types/registry';
import { auditPayload, defineAuditAction, type AuditService } from '../audit/service';
import type { ProgressService } from '../progress/service';
import type { QuestionsService } from '../questions/service';
import type { SettingsService } from '../settings/service';
import type { StreakService } from '../streak/service';
import type { TasksService } from '../tasks/service';
import type { UsersService } from '../users/service';

export const retryGranted = defineAuditAction(
  'attempt.retry_granted',
  z.object({ taskId: z.number(), epoch: z.number() }),
);

export interface AttemptsService {
  /** Resumes the open attempt or starts a new one (`created: true`). */
  start(learnerId: number, taskId: number): { attempt: AttemptDto; created: boolean };
  /** The learner's own attempt; answers are revealed only once it is finished. */
  get(learnerId: number, attemptId: number): AttemptDto;
  /** Stores an answer once: the same answer again is accepted, a different one is 409. */
  answer(
    learnerId: number,
    attemptId: number,
    questionId: number,
    submission: unknown,
  ): { questionId: number; optionId: OptionId };
  /** Grades and finishes the attempt (progress, reward, streak in the same transaction). */
  finish(learnerId: number, attemptId: number): AttemptDto;
  requestRetry(learnerId: number, taskId: number): { request: RetryRequestDto; created: boolean };
  adminGet(attemptId: number): AdminAttemptDto;
  listForLearner(learnerId: number, filter?: { taskId?: number }): AttemptSummaryDto[];
  retryRequests(status?: RetryRequestStatus): RetryRequestDto[];
  grantRetry(
    learnerId: number,
    taskId: number,
    actorId: number | null,
  ): { grant: RetryGrantDto; created: boolean };
}

export interface AttemptsDeps {
  readonly audit: AuditService;
  readonly settings: SettingsService;
  readonly users: UsersService;
  readonly tasks: TasksService;
  readonly questions: QuestionsService;
  readonly progress: ProgressService;
  readonly streak: StreakService;
  readonly taskTypes: TaskTypeRegistry;
  readonly clock?: () => number;
}

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

/** Fisher–Yates with a cryptographic source (spec/01 §2.13). */
function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

const sameOrder = (a: readonly QuestionOption[], b: readonly QuestionOption[]): boolean =>
  a.length === b.length && a.every((option, i) => option.id === b[i]?.id);

const notStartable = (code: string, message: string, details?: unknown) =>
  conflict(code, message, details);

export function createAttemptsService(db: Db, deps: AttemptsDeps): AttemptsService {
  const { audit, settings, users, tasks: tasksService, questions, progress, streak, clock } = deps;
  const now = clock ?? Date.now;

  // ---- reads -------------------------------------------------------------------------------

  const attemptRow = (attemptId: number): AttemptRow | undefined =>
    db.select().from(attempts).where(eq(attempts.id, attemptId)).get();

  const ownAttempt = (learnerId: number, attemptId: number): AttemptRow => {
    const row = attemptRow(attemptId);
    if (!row || row.learnerId !== learnerId) {
      throw notFound('Попытка не найдена');
    }
    return row;
  };

  const questionsOf = (attemptId: number): AttemptQuestionRow[] =>
    db
      .select()
      .from(attemptQuestions)
      .where(eq(attemptQuestions.attemptId, attemptId))
      .orderBy(asc(attemptQuestions.position))
      .all();

  const answersOf = (attemptId: number): Map<number, AttemptAnswerRow> =>
    new Map(
      db
        .select()
        .from(attemptAnswers)
        .where(eq(attemptAnswers.attemptId, attemptId))
        .all()
        .map((row) => [row.attemptQuestionId, row] as const),
    );

  const attemptsInEpoch = (learnerId: number, taskId: number, epoch: number): AttemptRow[] =>
    db
      .select()
      .from(attempts)
      .where(
        and(
          eq(attempts.learnerId, learnerId),
          eq(attempts.taskId, taskId),
          eq(attempts.epoch, epoch),
        ),
      )
      .orderBy(asc(attempts.id))
      .all();

  const openAttempt = (learnerId: number, taskId: number): AttemptRow | undefined =>
    db
      .select()
      .from(attempts)
      .where(
        and(
          eq(attempts.learnerId, learnerId),
          eq(attempts.taskId, taskId),
          eq(attempts.status, 'in_progress'),
        ),
      )
      .get();

  /** A permission of the current epoch that no attempt has used yet. */
  const unusedGrant = (learnerId: number, taskId: number, epoch: number) =>
    db
      .select()
      .from(retryGrants)
      .where(
        and(
          eq(retryGrants.learnerId, learnerId),
          eq(retryGrants.taskId, taskId),
          eq(retryGrants.epoch, epoch),
          notExists(
            db
              .select({ one: sql`1` })
              .from(attempts)
              .where(eq(attempts.retryGrantId, retryGrants.id)),
          ),
        ),
      )
      .orderBy(asc(retryGrants.id))
      .get();

  const openRequest = (learnerId: number, taskId: number): RetryRequestRow | undefined =>
    db
      .select()
      .from(retryRequests)
      .where(
        and(
          eq(retryRequests.learnerId, learnerId),
          eq(retryRequests.taskId, taskId),
          eq(retryRequests.status, 'open'),
        ),
      )
      .get();

  /** Free attempts per epoch: the first one plus `quiz.autoRetries`. */
  const freeAttempts = (): number => 1 + settings.get('quiz.autoRetries');

  const retryState = (learnerId: number, taskId: number, epoch: number): RetryStateDto => {
    const inEpoch = attemptsInEpoch(learnerId, taskId, epoch);
    const passed = inEpoch.some((a) => a.passed === true);
    if (passed) {
      return { canRetry: false, canRequest: false, requestOpen: false };
    }
    const usedFree = inEpoch.filter((a) => a.retryGrantId === null).length;
    const canRetry =
      usedFree < freeAttempts() || unusedGrant(learnerId, taskId, epoch) !== undefined;
    const request = openRequest(learnerId, taskId);
    const requestOpen = request !== undefined && request.epoch === epoch;
    return { canRetry, canRequest: !canRetry && !requestOpen, requestOpen };
  };

  // ---- DTOs --------------------------------------------------------------------------------

  const questionDto = (
    row: AttemptQuestionRow,
    answer: AttemptAnswerRow | undefined,
    reveal: boolean,
  ): AttemptQuestionDto => ({
    id: row.id,
    position: row.position,
    text: row.text,
    image: row.imageRef,
    options: row.options.map((o) => ({ id: o.id, text: o.text, image: o.image ?? null })),
    answer: answer?.optionId ?? null,
    ...(reveal && {
      correct: row.correct,
      isCorrect: answer?.optionId === row.correct,
      evidence: row.evidence ?? null,
    }),
  });

  const attemptDto = (row: AttemptRow, revealAlways = false): AttemptDto => {
    const finished = row.status === 'finished';
    const answers = answersOf(row.id);
    return {
      id: row.id,
      taskId: row.taskId,
      epoch: row.epoch,
      status: row.status,
      startedAt: new Date(row.startedAt).toISOString(),
      finishedAt: iso(row.finishedAt),
      questions: questionsOf(row.id).map((q) =>
        questionDto(q, answers.get(q.id), finished || revealAlways),
      ),
      result: finished
        ? {
            correct: row.correct ?? 0,
            total: row.total,
            passed: row.passed ?? false,
            reward: { xp: row.rewardXp, coins: row.rewardCoins },
            streakReward: { xp: row.streakXp, coins: row.streakCoins },
          }
        : null,
      retry: finished ? retryState(row.learnerId, row.taskId, row.epoch) : null,
    };
  };

  const requestDto = (row: RetryRequestRow, title: string): RetryRequestDto => ({
    id: row.id,
    learnerId: row.learnerId,
    taskId: row.taskId,
    taskTitle: title,
    attemptId: row.attemptId,
    status: row.status,
    createdAt: new Date(row.createdAt).toISOString(),
    resolvedAt: iso(row.resolvedAt),
  });

  const grantDto = (row: RetryGrantRow): RetryGrantDto => {
    const usedBy = db
      .select({ id: attempts.id })
      .from(attempts)
      .where(eq(attempts.retryGrantId, row.id))
      .get();
    return {
      id: row.id,
      learnerId: row.learnerId,
      taskId: row.taskId,
      epoch: row.epoch,
      grantedAt: new Date(row.grantedAt).toISOString(),
      usedByAttemptId: usedBy?.id ?? null,
    };
  };

  // ---- helpers for writes -------------------------------------------------------------------

  const gradedType = (task: TaskRecord): TaskTypePlugin => {
    const plugin = deps.taskTypes.get(task.type);
    if (!plugin?.grade) {
      throw notStartable('no_questions', 'У этого задания нет вопросов');
    }
    return plugin;
  };

  const requireTask = (taskId: number): TaskRecord => {
    const task = tasksService.record(taskId);
    if (!task) {
      throw notFound('Задание не найдено');
    }
    return task;
  };

  /** Options in a new random order, never the same order as in this learner's last attempt. */
  const shuffledOptions = (learnerId: number, question: QuestionDto): QuestionOption[] => {
    const order = shuffle(question.options);
    const previous = db
      .select({ options: attemptQuestions.options })
      .from(attemptQuestions)
      .innerJoin(attempts, eq(attempts.id, attemptQuestions.attemptId))
      .where(
        and(
          eq(attempts.learnerId, learnerId),
          eq(attempts.taskId, question.taskId),
          eq(attemptQuestions.questionKey, question.key),
        ),
      )
      .orderBy(desc(attemptQuestions.id))
      .get();
    if (previous && sameOrder(order, previous.options)) {
      order.push(order.shift() as QuestionOption);
    }
    return order;
  };

  return {
    start(learnerId, taskId) {
      return db.transaction(() => {
        const task = requireTask(taskId);
        const standing = progress.standing(learnerId, taskId);
        if (!standing.visible) {
          throw notFound('Задание не найдено');
        }
        const plugin = gradedType(task);
        const open = openAttempt(learnerId, taskId);
        if (open && open.epoch === standing.epoch) {
          return { attempt: attemptDto(open), created: false };
        }
        if (open) {
          // Left behind by a reset: it belongs to an epoch that no longer counts.
          db.update(attempts)
            .set({ status: 'abandoned', finishedAt: now() })
            .where(eq(attempts.id, open.id))
            .run();
        }
        if (standing.state === 'passed' || standing.state === 'closed') {
          throw notStartable('already_passed', 'Это задание уже пройдено. Награда получена.');
        }
        if (!standing.available) {
          throw notStartable('task_locked', 'Это задание ещё не открыто');
        }
        const startable = plugin.canStart({
          task,
          learnerId,
          now: now(),
          deps: { db, settings },
        });
        if (!startable.ok) {
          throw notStartable(startable.code, startable.message);
        }

        const inEpoch = attemptsInEpoch(learnerId, taskId, standing.epoch);
        let grantId: number | null = null;
        if (inEpoch.filter((a) => a.retryGrantId === null).length >= freeAttempts()) {
          const grant = unusedGrant(learnerId, taskId, standing.epoch);
          if (!grant) {
            throw notStartable('retry_needed', 'Новую попытку откроет родитель', {
              requestOpen: openRequest(learnerId, taskId) !== undefined,
            });
          }
          grantId = grant.id;
        }

        const perAttempt = settings.get('quiz.questionsPerAttempt');
        const bank = questions.activeBank(taskId);
        if (bank.length < perAttempt) {
          throw notStartable('questions_not_ready', 'Вопросы ещё готовятся');
        }
        const picked = shuffle(bank).slice(0, perAttempt);
        const at = now();
        const row = db
          .insert(attempts)
          .values({
            learnerId,
            taskId,
            epoch: standing.epoch,
            total: picked.length,
            retryGrantId: grantId,
            startedAt: at,
          })
          .returning()
          .get();
        picked.forEach((question, index) => {
          db.insert(attemptQuestions)
            .values({
              attemptId: row.id,
              position: index + 1,
              questionId: question.id,
              questionKey: question.key,
              questionVersion: question.version,
              text: question.text,
              options: shuffledOptions(learnerId, question),
              correct: question.correct,
              imageRef: question.image,
              evidence: question.evidence,
            })
            .run();
        });
        progress.markStarted(learnerId, taskId, at);
        return { attempt: attemptDto(row), created: true };
      });
    },

    get: (learnerId, attemptId) => attemptDto(ownAttempt(learnerId, attemptId)),

    answer(learnerId, attemptId, questionId, submission) {
      return db.transaction(() => {
        const attempt = ownAttempt(learnerId, attemptId);
        const question = db
          .select()
          .from(attemptQuestions)
          .where(
            and(eq(attemptQuestions.id, questionId), eq(attemptQuestions.attemptId, attemptId)),
          )
          .get();
        if (!question) {
          throw notFound('Вопрос не найден');
        }
        const task = requireTask(attempt.taskId);
        const plugin = gradedType(task);
        const parsed = plugin.contract.submissionSchema.safeParse(submission);
        if (!parsed.success) {
          throw new HttpError(400, 'validation_failed', 'Некорректный ответ');
        }
        const optionId = (parsed.data as { optionId: OptionId }).optionId;
        const given = answersOf(attemptId).get(questionId);
        if (given) {
          if (given.optionId === optionId) {
            return { questionId, optionId };
          }
          throw conflict('already_answered', 'Этот ответ уже сохранён и не меняется.');
        }
        if (attempt.status !== 'in_progress') {
          throw conflict('attempt_finished', 'Попытка уже завершена');
        }
        if (!question.options.some((o) => o.id === optionId)) {
          throw new HttpError(400, 'unknown_option', 'В вопросе нет такого варианта');
        }
        const graded = plugin.grade?.({
          config: task.config,
          submission: parsed.data,
          expected: question.correct,
        });
        db.insert(attemptAnswers)
          .values({
            attemptId,
            attemptQuestionId: questionId,
            optionId,
            correct: graded?.correct ?? false,
            answeredAt: now(),
          })
          .run();
        return { questionId, optionId };
      });
    },

    finish(learnerId, attemptId) {
      return db.transaction(() => {
        const attempt = ownAttempt(learnerId, attemptId);
        if (attempt.status === 'finished') {
          return attemptDto(attempt);
        }
        if (attempt.status === 'abandoned') {
          throw conflict('attempt_abandoned', 'Эта попытка закрыта после сброса прогресса');
        }
        const answers = [...answersOf(attemptId).values()];
        if (answers.length < attempt.total) {
          throw conflict('unanswered', 'Сначала ответь на все вопросы', {
            answered: answers.length,
            total: attempt.total,
          });
        }
        const correct = answers.filter((a) => a.correct).length;
        const passed = correct >= Math.min(settings.get('quiz.minCorrect'), attempt.total);
        const at = now();

        // The result counts for the task only in the current epoch and while it is not done
        // (the admin may have closed it meanwhile); the study day counts in any case.
        const standing = progress.standing(learnerId, attempt.taskId);
        const counts =
          standing.epoch === attempt.epoch &&
          standing.state !== 'passed' &&
          standing.state !== 'closed';
        const reward = counts
          ? progress.recordResult(learnerId, attempt.taskId, {
              correct,
              total: attempt.total,
              passed,
              at,
            }).reward
          : { xp: 0, coins: 0 };
        const day = streak.recordDay(learnerId);

        const row = db
          .update(attempts)
          .set({
            status: 'finished',
            correct,
            passed,
            rewardXp: reward.xp,
            rewardCoins: reward.coins,
            streakXp: day.reward.xp,
            streakCoins: day.reward.coins,
            finishedAt: at,
          })
          .where(eq(attempts.id, attemptId))
          .returning()
          .get();
        return attemptDto(row ?? attempt);
      });
    },

    requestRetry(learnerId, taskId) {
      return db.transaction(() => {
        const task = requireTask(taskId);
        const standing = progress.standing(learnerId, taskId);
        if (!standing.visible) {
          throw notFound('Задание не найдено');
        }
        const inEpoch = attemptsInEpoch(learnerId, taskId, standing.epoch);
        const last = inEpoch.at(-1);
        if (standing.state === 'passed' || standing.state === 'closed') {
          throw conflict('already_passed', 'Это задание уже пройдено');
        }
        if (!last || last.status !== 'finished' || last.passed !== false) {
          throw conflict('nothing_to_retry', 'Сначала заверши попытку');
        }
        const existing = openRequest(learnerId, taskId);
        if (existing && existing.epoch === standing.epoch) {
          return { request: requestDto(existing, task.title), created: false };
        }
        if (retryState(learnerId, taskId, standing.epoch).canRetry) {
          throw conflict('retry_available', 'Можно пройти тест ещё раз без разрешения');
        }
        if (existing) {
          // A request from before a reset: superseded by this one.
          db.update(retryRequests)
            .set({ status: 'granted', resolvedAt: now() })
            .where(eq(retryRequests.id, existing.id))
            .run();
        }
        const row = db
          .insert(retryRequests)
          .values({
            learnerId,
            taskId,
            epoch: standing.epoch,
            attemptId: last.id,
            createdAt: now(),
          })
          .returning()
          .get();
        return { request: requestDto(row, task.title), created: true };
      });
    },

    adminGet(attemptId) {
      const row = attemptRow(attemptId);
      if (!row) {
        throw notFound('Попытка не найдена');
      }
      return { ...attemptDto(row, true), learnerId: row.learnerId, retryGrantId: row.retryGrantId };
    },

    listForLearner(learnerId, filter = {}) {
      if (users.findRow(learnerId)?.role !== 'learner') {
        throw notFound('Ученик не найден');
      }
      return db
        .select()
        .from(attempts)
        .where(
          and(
            eq(attempts.learnerId, learnerId),
            filter.taskId === undefined ? undefined : eq(attempts.taskId, filter.taskId),
          ),
        )
        .orderBy(desc(attempts.startedAt), desc(attempts.id))
        .all()
        .map((row) => ({
          id: row.id,
          taskId: row.taskId,
          epoch: row.epoch,
          status: row.status,
          startedAt: new Date(row.startedAt).toISOString(),
          finishedAt: iso(row.finishedAt),
          correct: row.correct,
          total: row.total,
          passed: row.passed,
        }));
    },

    retryRequests(status) {
      const rows = db
        .select({ request: retryRequests, title: tasks.title })
        .from(retryRequests)
        .innerJoin(tasks, eq(tasks.id, retryRequests.taskId))
        .where(status === undefined ? undefined : eq(retryRequests.status, status))
        .orderBy(asc(retryRequests.createdAt), asc(retryRequests.id))
        .all();
      return (
        rows
          // An open request from before a reset no longer matters (the new epoch has free tries).
          .filter(
            ({ request }) =>
              request.status !== 'open' ||
              progress.epochOf(request.learnerId, request.taskId) === request.epoch,
          )
          .map(({ request, title }) => requestDto(request, title))
      );
    },

    grantRetry(learnerId, taskId, actorId) {
      return db.transaction(() => {
        if (users.findRow(learnerId)?.role !== 'learner') {
          throw notFound('Ученик не найден');
        }
        requireTask(taskId);
        const epoch = progress.epochOf(learnerId, taskId);
        const existing = unusedGrant(learnerId, taskId, epoch);
        const grant =
          existing ??
          db
            .insert(retryGrants)
            .values({ learnerId, taskId, epoch, grantedBy: actorId, grantedAt: now() })
            .returning()
            .get();
        db.update(retryRequests)
          .set({ status: 'granted', resolvedAt: now(), resolvedBy: actorId })
          .where(
            and(
              eq(retryRequests.learnerId, learnerId),
              eq(retryRequests.taskId, taskId),
              eq(retryRequests.status, 'open'),
            ),
          )
          .run();
        if (!existing) {
          const payload = auditPayload(retryGranted, { taskId, epoch });
          audit.record(actorId, retryGranted, 'task', taskId, payload, { learnerId });
        }
        return { grant: grantDto(grant), created: existing === undefined };
      });
    },
  };
}
