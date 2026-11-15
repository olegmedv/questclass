import type { LearnerProgressDto } from '@questclass/shared/progress/dto';
import type { ChoreCompletionDto, ChoreStatusDto } from '@questclass/shared/task-types/chore/dto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { HttpError } from '../src/http/errors';
import { createChoresService, type ChoresService } from '../src/task-types/chore/service';
import { NOTE_TYPE, READY_NOTE, noteTaskType } from './fixtures/noteTaskType';
import {
  createClient,
  errorCode,
  loginAdmin,
  trustDevice,
  type TestClient,
} from './helpers/client';
import { quickAdmin, quickLearner } from './helpers/fastUsers';
import { createTestRuntime, type TestRuntime } from './helpers/db';

const DAY = 86_400_000;
/** Wednesday, noon in Kaliningrad. */
const START = Date.parse('2026-11-11T10:00:00Z');

let runtime: TestRuntime;
let adminId: number;
let anya: number;
let borya: number;
let admin: TestClient;
let anyaClient: TestClient;
let now: number;
let chores: ChoresService;

beforeEach(async () => {
  runtime = await createTestRuntime();
  runtime.ctx.taskTypes.register(noteTaskType);
  adminId = await quickAdmin(runtime.ctx);
  anya = await quickLearner(runtime.ctx, 'Аня', '1111');
  borya = await quickLearner(runtime.ctx, 'Боря', '2222');
  admin = createClient(createApp(runtime.ctx).app);
  await loginAdmin(admin);
  anyaClient = await learnerClient(anya, '1111');
  now = START;
  chores = createChoresService(runtime.ctx.db, { ...runtime.ctx, clock: () => now });
});

afterEach(async () => {
  await runtime.close();
});

async function learnerClient(userId: number, pin: string): Promise<TestClient> {
  const tablet = createClient(createApp(runtime.ctx).app);
  await loginAdmin(tablet);
  await trustDevice(tablet);
  const res = await tablet.post('/api/auth/learner-login', { userId, pin });
  expect(res.status).toBe(200);
  return tablet;
}

/** A published chore (assigned to `learner` when given). */
function chore(repeat: 'once' | 'daily' | 'weekly', learner?: number, title = 'Убрать игрушки') {
  const { ctx } = runtime;
  const id = ctx.tasks.create(
    { type: 'chore', title, config: { repeat }, xp: 20, coins: 30 },
    adminId,
  ).id;
  ctx.tasks.update(id, { status: 'published' }, adminId);
  if (learner !== undefined) {
    ctx.tasks.assign(id, learner, adminId);
  }
  return id;
}

const report = (taskId: number, client = anyaClient) =>
  client.post(`/api/tasks/${taskId}/chore-completions`);
const approve = (id: number) => admin.post(`/api/admin/chores/reviews/${id}/approval`);
const reject = (id: number, comment?: string) =>
  admin.post(`/api/admin/chores/reviews/${id}/rejection`, comment === undefined ? {} : { comment });

const rows = (table: string): number =>
  (runtime.ctx.db.$client.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

function expectHttpError(run: () => unknown, status: number, code: string): void {
  try {
    run();
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(status);
    expect((err as HttpError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${status} ${code}, nothing was thrown`);
}

describe('the chore type', () => {
  it('is a built-in type with a repeat rule; there are no attempts for it', async () => {
    const created = await admin.post('/api/admin/tasks', { type: 'chore', title: 'Полить цветы' });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ type: 'chore', config: { repeat: 'once' } });
    const bad = await admin.post('/api/admin/tasks', {
      type: 'chore',
      title: 'Полить цветы',
      config: { repeat: 'hourly' },
    });
    expect(bad.status).toBe(400);
    expect(await errorCode(bad)).toBe('invalid_config');

    const taskId = chore('once', anya);
    const attempt = await anyaClient.post(`/api/tasks/${taskId}/attempts`);
    expect(attempt.status).toBe(409);
    expect(await errorCode(attempt)).toBe('no_questions');
    const task = (await (await anyaClient.get(`/api/tasks/${taskId}`)).json()) as {
      config: unknown;
    };
    expect(task.config).toEqual({ repeat: 'once' });
  });
});

describe('reports and reviews', () => {
  it('«Я сделал» → pending; approval pays chore:<id> once', async () => {
    const taskId = chore('once', anya);
    const first = await report(taskId);
    expect(first.status).toBe(201);
    const completion = (await first.json()) as ChoreCompletionDto;
    expect(completion).toMatchObject({ status: 'pending', periodKey: 'once', reward: null });
    // A double tap returns the same report.
    const again = await report(taskId);
    expect(again.status).toBe(200);
    expect(((await again.json()) as ChoreCompletionDto).id).toBe(completion.id);

    const status = (await (
      await anyaClient.get(`/api/tasks/${taskId}/chore-completions`)
    ).json()) as ChoreStatusDto;
    expect(status).toMatchObject({ repeat: 'once', periodKey: 'once' });
    expect(status.current?.id).toBe(completion.id);

    const approved = await approve(completion.id);
    expect(approved.status).toBe(201);
    expect(await approved.json()).toMatchObject({
      status: 'approved',
      reviewedBy: adminId,
      reward: { xp: 20, coins: 30 },
    });
    expect(runtime.ctx.ledger.balance(anya)).toEqual({ xp: 20, coins: 30 });
    const key = runtime.ctx.db.$client
      .prepare("SELECT idem_key, source_id FROM ledger WHERE source_type = 'chore'")
      .all();
    expect(key).toEqual([{ idem_key: `chore:${completion.id}`, source_id: String(completion.id) }]);

    // Approving again pays nothing; reporting again returns the approved report.
    expect((await approve(completion.id)).status).toBe(200);
    expect(runtime.ctx.ledger.balance(anya)).toEqual({ xp: 20, coins: 30 });
    const after = await report(taskId);
    expect(after.status).toBe(200);
    expect(await after.json()).toMatchObject({ id: completion.id, status: 'approved' });
    expect(rows('chore_completions')).toBe(1);

    const audit = runtime.ctx.audit.list({ action: 'chore.approved' }).items;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: adminId, learnerId: anya });
  });

  it('an approved one-time chore counts as done; a repeating one stays open', async () => {
    const once = chore('once', anya, 'Собрать портфель');
    const daily = chore('daily', anya, 'Полить цветы');
    const progressOf = async () =>
      (await (await anyaClient.get('/api/me/progress')).json()) as LearnerProgressDto;
    const stateOf = (p: LearnerProgressDto, taskId: number) =>
      p.tasks.find((t) => t.taskId === taskId)?.state;

    const onceReport = (await (await report(once)).json()) as ChoreCompletionDto;
    const dailyReport = (await (await report(daily)).json()) as ChoreCompletionDto;
    let p = await progressOf();
    expect([stateOf(p, once), stateOf(p, daily), p.assignedDone]).toEqual([
      'started',
      'started',
      0,
    ]);

    // A rejection leaves the chore started.
    await reject(onceReport.id, 'Не всё убрано');
    expect(stateOf(await progressOf(), once)).toBe('started');

    const retry = (await (await report(once)).json()) as ChoreCompletionDto;
    expect((await approve(retry.id)).status).toBe(201);
    expect((await approve(dailyReport.id)).status).toBe(201);
    p = await progressOf();
    expect(stateOf(p, once)).toBe('passed');
    expect(stateOf(p, daily)).toBe('started');
    expect(p.assignedTotal).toBe(2);
    expect(p.assignedDone).toBe(1);

    // Progress pays nothing on top: only the two chore:<id> rows exist, no task pass row.
    expect(runtime.ctx.ledger.balance(anya)).toEqual({ xp: 40, coins: 60 });
    expect(rows('ledger')).toBe(2);
  });

  it('the database keeps one live report per learner, chore and period', () => {
    const taskId = chore('once', anya);
    chores.report(anya, taskId);
    expect(() =>
      runtime.ctx.db.$client
        .prepare(
          "INSERT INTO chore_completions (learner_id, task_id, period_key, status, created_at) VALUES (?, ?, 'once', 'approved', 0)",
        )
        .run(anya, taskId),
    ).toThrow(/UNIQUE/);
  });

  it('a rejection carries a comment; the learner may report again, even a once-chore', async () => {
    const taskId = chore('once', anya);
    const first = (await (await report(taskId)).json()) as ChoreCompletionDto;
    const rejected = await reject(first.id, '  Игрушки ещё на полу ');
    expect(rejected.status).toBe(201);
    expect(await rejected.json()).toMatchObject({
      status: 'rejected',
      note: 'Игрушки ещё на полу',
    });
    expect((await reject(first.id, 'ещё раз')).status).toBe(200);
    expect(runtime.ctx.ledger.balance(anya)).toEqual({ xp: 0, coins: 0 });

    const second = await report(taskId);
    expect(second.status).toBe(201);
    const next = (await second.json()) as ChoreCompletionDto;
    expect(next.id).not.toBe(first.id);
    const status = (await (
      await anyaClient.get(`/api/tasks/${taskId}/chore-completions`)
    ).json()) as ChoreStatusDto;
    expect(status.current?.id).toBe(next.id);
    expect(status.items.map((i) => [i.status, i.note])).toEqual([
      ['pending', null],
      ['rejected', 'Игрушки ещё на полу'],
    ]);

    // A reviewed report cannot change its outcome.
    const approveRejected = await approve(first.id);
    expect(approveRejected.status).toBe(409);
    expect(await errorCode(approveRejected)).toBe('already_reviewed');
    await approve(next.id);
    const rejectApproved = await reject(next.id);
    expect(rejectApproved.status).toBe(409);
    expect(await errorCode(rejectApproved)).toBe('already_reviewed');
    expect(runtime.ctx.audit.list({ action: 'chore.rejected' }).items[0]?.payload).toMatchObject({
      comment: 'Игрушки ещё на полу',
    });
  });

  it('a daily chore can be done once a day, a weekly one once a week', () => {
    const daily = chore('daily', anya, 'Заправить кровать');
    const weekly = chore('weekly', anya, 'Помыть посуду');
    const d1 = chores.report(anya, daily);
    expect(d1.completion.periodKey).toBe('2026-11-11');
    chores.approve(d1.completion.id, adminId);
    expect(chores.report(anya, daily)).toMatchObject({ created: false });
    const w1 = chores.report(anya, weekly);
    expect(w1.completion.periodKey).toBe('2026-W46');

    now += DAY; // Thursday
    const d2 = chores.report(anya, daily);
    expect(d2).toMatchObject({ created: true, completion: { periodKey: '2026-11-12' } });
    expect(chores.report(anya, weekly)).toMatchObject({ created: false });
    expect(chores.status(anya, daily)).toMatchObject({
      periodKey: '2026-11-12',
      current: { id: d2.completion.id, status: 'pending' },
    });

    now += 4 * DAY; // next Monday
    expect(chores.report(anya, weekly)).toMatchObject({
      created: true,
      completion: { periodKey: '2026-W47' },
    });
    // Days follow the installation time zone: 23:30 UTC is already the next day in Kaliningrad.
    now = Date.parse('2026-11-20T22:30:00Z');
    expect(chores.report(anya, daily).completion.periodKey).toBe('2026-11-21');
  });

  it('only a visible chore can be reported; others are not found', async () => {
    const forAnya = chore('once', anya);
    const boryaClient = await learnerClient(borya, '2222');
    expect((await report(forAnya, boryaClient)).status).toBe(404);
    expect((await boryaClient.get(`/api/tasks/${forAnya}/chore-completions`)).status).toBe(404);

    const draft = runtime.ctx.tasks.create({ type: 'chore', title: 'Черновик' }, adminId).id;
    expect((await report(draft)).status).toBe(404);
    const note = runtime.ctx.tasks.create(
      {
        type: NOTE_TYPE,
        title: 'Не дело',
        config: READY_NOTE,
        subjectId: runtime.ctx.subjects.findByKey('math')?.id ?? null,
      },
      adminId,
    ).id;
    runtime.ctx.tasks.update(note, { status: 'published' }, adminId);
    expect((await report(note)).status).toBe(404);
    expect((await report(9999)).status).toBe(404);
    expect((await approve(9999)).status).toBe(404);
    expect(rows('chore_completions')).toBe(0);
  });

  it('a chore locked by the unlock rules cannot be reported', () => {
    const { ctx } = runtime;
    ctx.settings.set('progress.unlockMode', 'sequential', adminId);
    const subjectId = ctx.subjects.findByKey('craft')?.id ?? null;
    const make = (title: string, sort: number) => {
      const id = ctx.tasks.create({ type: 'chore', title, subjectId, sort }, adminId).id;
      ctx.tasks.update(id, { status: 'published' }, adminId);
      return id;
    };
    make('Первое', 10);
    const second = make('Второе', 20);
    expectHttpError(() => chores.report(anya, second), 409, 'task_locked');
  });

  it('lists reports for review: pending oldest first, filters by status and learner', async () => {
    const forAll = chore('daily');
    const a = chores.report(anya, forAll).completion;
    now += 60_000;
    const b = chores.report(borya, forAll).completion;
    const pending = (await (
      await admin.get('/api/admin/chores/reviews')
    ).json()) as ChoreCompletionDto[];
    expect(pending.map((c) => [c.id, c.taskTitle])).toEqual([
      [a.id, 'Убрать игрушки'],
      [b.id, 'Убрать игрушки'],
    ]);
    await approve(a.id);
    const onlyBorya = (await (
      await admin.get(`/api/admin/chores/reviews?status=pending&learnerId=${borya}`)
    ).json()) as ChoreCompletionDto[];
    expect(onlyBorya.map((c) => c.id)).toEqual([b.id]);
    const approved = (await (
      await admin.get('/api/admin/chores/reviews?status=approved')
    ).json()) as ChoreCompletionDto[];
    expect(approved.map((c) => c.id)).toEqual([a.id]);
    expect((await admin.get('/api/admin/chores/reviews?status=lost')).status).toBe(400);
  });

  it('a chore with reports is history: it can be archived, not deleted', async () => {
    const taskId = chore('once', anya);
    chores.report(anya, taskId);
    const res = await admin.delete(`/api/admin/tasks/${taskId}`);
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('has_history');
  });
});
