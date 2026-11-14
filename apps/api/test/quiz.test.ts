import type {
  AdminAttemptDto,
  AttemptDto,
  AttemptSummaryDto,
  RetryRequestDto,
} from '@questclass/shared/attempts/dto';
import type { OptionId, QuestionContent } from '@questclass/shared/questions/schema';
import { defineTaskType } from '@questclass/shared/tasks/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createAttemptsService } from '../src/modules/attempts/service';
import type { StreakService } from '../src/modules/streak/service';
import { READY_NOTE, noteTaskType } from './fixtures/noteTaskType';
import {
  createClient,
  errorCode,
  loginAdmin,
  trustDevice,
  type TestClient,
} from './helpers/client';
import { createTestRuntime, type TestRuntime } from './helpers/db';
import { quickAdmin, quickLearner } from './helpers/fastUsers';

let runtime: TestRuntime;
let admin: TestClient;
let adminId: number;
let anya: number;
let borya: number;
let a: TestClient;

const app = () => createApp(runtime.ctx).app;

async function learnerClient(userId: number, pin: string): Promise<TestClient> {
  const tablet = createClient(app());
  await loginAdmin(tablet);
  await trustDevice(tablet);
  const res = await tablet.post('/api/auth/learner-login', { userId, pin });
  expect(res.status).toBe(200);
  return tablet;
}

beforeEach(async () => {
  runtime = await createTestRuntime();
  runtime.ctx.taskTypes.register(noteTaskType);
  adminId = await quickAdmin(runtime.ctx);
  anya = await quickLearner(runtime.ctx, 'Аня', '1111');
  borya = await quickLearner(runtime.ctx, 'Боря', '2222');
  admin = createClient(app());
  await loginAdmin(admin);
  a = await learnerClient(anya, '1111');
});

afterEach(async () => {
  await runtime.close();
});

const question = (n: number): QuestionContent => ({
  text: `Вопрос ${n}`,
  options: [
    { id: 'a', text: `${n}-А` },
    { id: 'b', text: `${n}-Б` },
    { id: 'c', text: `${n}-В` },
    { id: 'd', text: `${n}-Г` },
  ],
  correct: 'b',
  evidence: { start: n * 10, end: n * 10 + 5, quote: `цитата ${n}` },
});

/** A published quiz of `subjectKey` with a bank of `bank` questions (100 XP / 350 coins). */
function quiz(subjectKey = 'russian', bank = 5): number {
  const subjectId = runtime.ctx.subjects.findByKey(subjectKey)?.id ?? null;
  const taskId = runtime.ctx.tasks.create(
    { type: 'quiz', title: `Тест ${subjectKey}`, subjectId },
    adminId,
  ).id;
  for (let n = 1; n <= bank; n += 1) {
    runtime.ctx.questions.create(taskId, { key: `q${n}`, ...question(n) }, adminId);
  }
  runtime.ctx.tasks.update(taskId, { status: 'published' }, adminId);
  return taskId;
}

async function start(taskId: number, client = a): Promise<Response> {
  return client.post(`/api/tasks/${taskId}/attempts`);
}

async function started(taskId: number, client = a): Promise<AttemptDto> {
  const res = await start(taskId, client);
  expect(res.status, await res.clone().text()).toBe(201);
  return (await res.json()) as AttemptDto;
}

const correctOf = (attemptId: number): Map<number, OptionId> =>
  new Map(
    runtime.ctx.attempts.adminGet(attemptId).questions.map((q) => [q.id, q.correct as OptionId]),
  );

const wrong = (correct: OptionId): OptionId => (correct === 'a' ? 'b' : 'a');

/** Answers `right` questions correctly, the rest wrong, then finishes. */
async function play(attempt: AttemptDto, right: number, client = a): Promise<AttemptDto> {
  const correct = correctOf(attempt.id);
  for (const [index, q] of attempt.questions.entries()) {
    const answer = correct.get(q.id) ?? 'a';
    const res = await client.request('PUT', `/api/attempts/${attempt.id}/answers/${q.id}`, {
      json: { optionId: index < right ? answer : wrong(answer) },
    });
    expect(res.status).toBe(200);
  }
  const done = await client.post(`/api/attempts/${attempt.id}/completion`);
  expect(done.status, await done.clone().text()).toBe(200);
  return (await done.json()) as AttemptDto;
}

const count = (table: string): number =>
  (runtime.ctx.db.$client.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('starting an attempt', () => {
  it('snapshots N random questions with shuffled options; answers stay hidden', async () => {
    const taskId = quiz('russian', 5);
    const attempt = await started(taskId);
    expect(attempt).toMatchObject({ status: 'in_progress', epoch: 0, result: null, retry: null });
    expect(attempt.questions).toHaveLength(3);
    for (const q of attempt.questions) {
      expect(q.options.map((o) => o.id).sort()).toEqual(['a', 'b', 'c', 'd']);
      expect(q).not.toHaveProperty('correct');
      expect(q).not.toHaveProperty('evidence');
      expect(q.answer).toBeNull();
    }
    expect(JSON.stringify(attempt)).not.toContain('цитата');

    const rows = runtime.ctx.db.$client
      .prepare(
        'SELECT text, correct, evidence, options FROM attempt_questions WHERE attempt_id = ?',
      )
      .all(attempt.id) as { text: string; correct: string; evidence: string; options: string }[];
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.correct).toBe('b');
      expect((JSON.parse(row.evidence) as { quote: string }).quote).toMatch(/цитата/);
    }
    // Starting again resumes the open attempt.
    const again = await start(taskId);
    expect(again.status).toBe(200);
    expect(((await again.json()) as AttemptDto).id).toBe(attempt.id);
  });

  it('a later edit of the bank does not change the snapshot', async () => {
    const taskId = quiz('russian', 3);
    const attempt = await started(taskId);
    for (const key of ['q1', 'q2', 'q3']) {
      runtime.ctx.questions.update(taskId, key, { ...question(9), text: 'Новый текст' }, adminId);
    }
    const reread = (await (await a.get(`/api/attempts/${attempt.id}`)).json()) as AttemptDto;
    expect(reread.questions.map((q) => q.text).sort()).toEqual([
      'Вопрос 1',
      'Вопрос 2',
      'Вопрос 3',
    ]);
  });

  it('refuses closed, not yet open and unsuitable tasks', async () => {
    const russian = quiz('russian', 3);
    const math = quiz('math', 3);
    const locked = await start(math);
    expect(locked.status).toBe(409);
    expect(await errorCode(locked)).toBe('task_locked');

    const attempt = await started(russian);
    await play(attempt, 3);
    const done = await start(russian);
    expect(done.status).toBe(409);
    expect(await errorCode(done)).toBe('already_passed');

    // A type without grading (like a chore) has no attempts.
    runtime.ctx.taskTypes.register({
      contract: defineTaskType({ ...noteTaskType.contract, type: 'test_plain' }),
      canStart: () => ({ ok: true }),
    });
    const subjectId = runtime.ctx.subjects.findByKey('art')?.id ?? null;
    const note = runtime.ctx.tasks.create(
      { type: 'test_plain', title: 'Дело', subjectId, config: READY_NOTE },
      adminId,
    ).id;
    runtime.ctx.tasks.update(note, { status: 'published' }, adminId);
    const noQuestions = await start(note);
    expect(noQuestions.status).toBe(409);
    expect(await errorCode(noQuestions)).toBe('no_questions');

    const forBorya = quiz('art', 3);
    runtime.ctx.tasks.assign(forBorya, borya, adminId);
    expect((await start(forBorya)).status).toBe(404);
  });

  it('a bank smaller than N is refused, and such a quiz cannot be published', async () => {
    const taskId = quiz('russian', 3);
    runtime.ctx.questions.archive(taskId, 'q3', adminId);
    const res = await start(taskId);
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('questions_not_ready');

    const draft = runtime.ctx.tasks.create({ type: 'quiz', title: 'Мало вопросов' }, adminId).id;
    runtime.ctx.questions.create(draft, question(1), adminId);
    const publish = await admin.patch(`/api/admin/tasks/${draft}`, { status: 'published' });
    expect(publish.status).toBe(422);
    const body = (await publish.json()) as { error: { details: { errors: string[] } } };
    expect(body.error.details.errors).toEqual(['Нужно не меньше 3 вопросов в банке (сейчас 1)']);
  });
});

describe('answers', () => {
  it('an answer is given once: the same again is 200, another is 409', async () => {
    const attempt = await started(quiz());
    const q = attempt.questions[0];
    if (!q) throw new Error('no question');
    const url = `/api/attempts/${attempt.id}/answers/${q.id}`;
    const first = await a.request('PUT', url, { json: { optionId: 'c' } });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ questionId: q.id, optionId: 'c' });
    expect((await a.request('PUT', url, { json: { optionId: 'c' } })).status).toBe(200);
    const changed = await a.request('PUT', url, { json: { optionId: 'd' } });
    expect(changed.status).toBe(409);
    expect(await errorCode(changed)).toBe('already_answered');
    expect((await a.request('PUT', url, { json: { optionId: 'e' } })).status).toBe(400);
    expect(
      (
        await a.request('PUT', `/api/attempts/${attempt.id}/answers/99999`, {
          json: { optionId: 'a' },
        })
      ).status,
    ).toBe(404);
    const reread = (await (await a.get(`/api/attempts/${attempt.id}`)).json()) as AttemptDto;
    expect(reread.questions[0]?.answer).toBe('c');
    expect(reread.questions[0]).not.toHaveProperty('isCorrect');

    const b = await learnerClient(borya, '2222');
    expect((await b.get(`/api/attempts/${attempt.id}`)).status).toBe(404);
    expect((await b.request('PUT', url, { json: { optionId: 'c' } })).status).toBe(404);
    expect((await b.post(`/api/attempts/${attempt.id}/completion`)).status).toBe(404);
  });
});

describe('finishing', () => {
  it('reveals answers and evidence, records progress, reward and the study day', async () => {
    const taskId = quiz();
    const unfinished = await started(taskId);
    const early = await a.post(`/api/attempts/${unfinished.id}/completion`);
    expect(early.status).toBe(409);
    expect(await errorCode(early)).toBe('unanswered');

    const result = await play(unfinished, 3);
    expect(result.result).toEqual({
      correct: 3,
      total: 3,
      passed: true,
      reward: { xp: 100, coins: 350 },
      streakReward: { xp: 0, coins: 0 },
    });
    expect(result.retry).toEqual({ canRetry: false, canRequest: false, requestOpen: false });
    for (const q of result.questions) {
      expect(q).toMatchObject({ isCorrect: true, correct: q.answer });
      expect(q.evidence?.quote).toMatch(/цитата/);
    }
    expect(runtime.ctx.ledger.balance(anya)).toEqual({ xp: 100, coins: 350 });
    expect(runtime.ctx.progress.standing(anya, taskId)).toMatchObject({ state: 'passed' });
    expect(runtime.ctx.streak.view(anya)).toMatchObject({ current: 1, todayDone: true });

    // Finishing again just returns the result.
    const repeat = await a.post(`/api/attempts/${unfinished.id}/completion`);
    expect(repeat.status).toBe(200);
    expect(count('ledger')).toBe(1);
  });

  it('a pass needs quiz.minCorrect; the reward is proportional and rounded down', async () => {
    const twoOfThree = await play(await started(quiz('russian')), 2);
    expect(twoOfThree.result).toMatchObject({ passed: true, reward: { xp: 66, coins: 233 } });

    runtime.ctx.settings.set('progress.unlockMode', 'all', adminId);
    runtime.ctx.settings.set('quiz.minCorrect', 3, adminId);
    const strict = await play(await started(quiz('math')), 2);
    expect(strict.result).toMatchObject({ passed: false, reward: { xp: 0, coins: 0 } });

    // A threshold above N means every question must be right.
    runtime.ctx.settings.set('quiz.minCorrect', 10, adminId);
    const all = await play(await started(quiz('world')), 3);
    expect(all.result?.passed).toBe(true);
  });

  it('a failed attempt still counts as a study day (errors do not break the streak)', async () => {
    const failed = await play(await started(quiz()), 0);
    expect(failed.result).toMatchObject({ passed: false, correct: 0 });
    expect(runtime.ctx.streak.view(anya).current).toBe(1);
    expect(count('ledger')).toBe(0);
  });

  it('runs in one transaction: a failure on the way rolls everything back', async () => {
    const taskId = quiz();
    const attempt = await started(taskId);
    const correct = correctOf(attempt.id);
    for (const q of attempt.questions) {
      runtime.ctx.attempts.answer(anya, attempt.id, q.id, { optionId: correct.get(q.id) });
    }
    const brokenStreak: StreakService = {
      recordDay: () => {
        throw new Error('disk full');
      },
      view: (learnerId) => runtime.ctx.streak.view(learnerId),
    };
    const engine = createAttemptsService(runtime.ctx.db, { ...runtime.ctx, streak: brokenStreak });
    expect(() => engine.finish(anya, attempt.id)).toThrow(/disk full/);

    expect(runtime.ctx.attempts.get(anya, attempt.id).status).toBe('in_progress');
    expect(count('ledger')).toBe(0);
    expect(count('streak_days')).toBe(0);
    expect(runtime.ctx.progress.standing(anya, taskId).state).toBe('started');
  });
});

describe('retries', () => {
  it('one free retry after a fail, then only with the admin’s permission', async () => {
    const taskId = quiz();
    const first = await play(await started(taskId), 0);
    expect(first.retry).toEqual({ canRetry: true, canRequest: false, requestOpen: false });
    const early = await a.post(`/api/tasks/${taskId}/retry-requests`);
    expect(early.status).toBe(409);
    expect(await errorCode(early)).toBe('retry_available');

    const second = await play(await started(taskId), 1);
    expect(second.retry).toEqual({ canRetry: false, canRequest: true, requestOpen: false });
    const blocked = await start(taskId);
    expect(blocked.status).toBe(409);
    expect(await errorCode(blocked)).toBe('retry_needed');

    const asked = await a.post(`/api/tasks/${taskId}/retry-requests`);
    expect(asked.status).toBe(201);
    const request = (await asked.json()) as RetryRequestDto;
    expect(request).toMatchObject({
      taskId,
      learnerId: anya,
      status: 'open',
      attemptId: second.id,
    });
    expect((await a.post(`/api/tasks/${taskId}/retry-requests`)).status).toBe(200);

    const open = (await (
      await admin.get('/api/admin/retry-requests?status=open')
    ).json()) as RetryRequestDto[];
    expect(open.map((r) => r.id)).toEqual([request.id]);
    expect(open[0]?.taskTitle).toBe('Тест russian');

    const granted = await admin.post('/api/admin/retry-grants', { learnerId: anya, taskId });
    expect(granted.status).toBe(201);
    expect((await admin.post('/api/admin/retry-grants', { learnerId: anya, taskId })).status).toBe(
      200,
    );
    expect(
      (await (await admin.get('/api/admin/retry-requests?status=open')).json()) as unknown[],
    ).toEqual([]);

    const third = await started(taskId);
    expect(runtime.ctx.attempts.adminGet(third.id).retryGrantId).not.toBeNull();
    const failedAgain = await play(third, 0);
    expect(failedAgain.retry?.canRetry).toBe(false);
    expect(await errorCode(await start(taskId))).toBe('retry_needed');
    expect(runtime.ctx.audit.list({ action: 'attempt.retry_granted' }).items).toHaveLength(1);
  });

  it('a reset gives free attempts again and abandons the unfinished one', async () => {
    const taskId = quiz();
    await play(await started(taskId), 0);
    await play(await started(taskId), 0);
    expect(await errorCode(await start(taskId))).toBe('retry_needed');

    runtime.ctx.progress.reset(anya, { requestId: 'reset-00000001' }, adminId);
    const fresh = await started(taskId);
    expect(fresh.epoch).toBe(1);

    // An attempt left open across a reset is abandoned when a new one starts.
    runtime.ctx.progress.reset(anya, { requestId: 'reset-00000002' }, adminId);
    const next = await started(taskId);
    expect(next.epoch).toBe(2);
    expect(runtime.ctx.attempts.get(anya, fresh.id).status).toBe('abandoned');
    const late = await a.post(`/api/attempts/${fresh.id}/completion`);
    expect(late.status).toBe(409);
    expect(await errorCode(late)).toBe('attempt_abandoned');
  });

  it('«Пройти с мамой»: after a reopening a better result is topped up', async () => {
    const taskId = quiz();
    await play(await started(taskId), 2);
    runtime.ctx.progress.reopen(anya, taskId, adminId);
    const better = await play(await started(taskId), 3);
    expect(better.result?.reward).toEqual({ xp: 34, coins: 117 });
    expect(runtime.ctx.ledger.balance(anya)).toEqual({ xp: 100, coins: 350 });
  });
});

describe('admin views', () => {
  it('shows the snapshot with answers and the correct options, and lists attempts', async () => {
    const taskId = quiz();
    const attempt = await started(taskId);
    const q = attempt.questions[0];
    if (!q) throw new Error('no question');
    await a.request('PUT', `/api/attempts/${attempt.id}/answers/${q.id}`, {
      json: { optionId: 'a' },
    });
    const view = (await (
      await admin.get(`/api/admin/attempts/${attempt.id}`)
    ).json()) as AdminAttemptDto;
    expect(view).toMatchObject({ learnerId: anya, status: 'in_progress', retryGrantId: null });
    expect(view.questions[0]).toMatchObject({ answer: 'a', correct: 'b', isCorrect: false });
    expect(view.questions.every((x) => x.evidence?.quote !== undefined)).toBe(true);

    const list = (await (
      await admin.get(`/api/admin/learners/${anya}/attempts?taskId=${taskId}`)
    ).json()) as AttemptSummaryDto[];
    expect(list.map((x) => x.id)).toEqual([attempt.id]);
    expect((await admin.get(`/api/admin/attempts/99999`)).status).toBe(404);
  });
});
