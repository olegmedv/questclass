import type { LedgerEntryDto } from '@questclass/shared/economy/dto';
import type { LearnerProgressDto, TaskProgressDto } from '@questclass/shared/progress/dto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { requestKey } from '../src/modules/ledger/service';
import { computeAvailability } from '../src/modules/progress/availability';
import { NOTE_TYPE, READY_NOTE, noteTaskType } from './fixtures/noteTaskType';
import {
  createClient,
  createLearner,
  errorCode,
  loginAdmin,
  seedAdmin,
  trustDevice,
  type TestClient,
} from './helpers/client';
import { createTestRuntime, type TestRuntime } from './helpers/db';

let runtime: TestRuntime;
let admin: TestClient;
let adminId: number;
let anya: number;
let borya: number;
let requestSeq = 0;

const app = () => createApp(runtime.ctx).app;
const requestId = () => `req-${String(++requestSeq).padStart(8, '0')}`;

beforeEach(async () => {
  runtime = await createTestRuntime();
  runtime.ctx.taskTypes.register(noteTaskType);
  adminId = await seedAdmin(runtime.ctx);
  anya = await createLearner(runtime.ctx, 'Аня', '1111');
  borya = await createLearner(runtime.ctx, 'Боря', '2222');
  admin = createClient(app());
  await loginAdmin(admin);
});

afterEach(async () => {
  await runtime.close();
});

/** A published task of the subject `subjectKey` (100 XP / 350 coins by default). */
function task(subjectKey: string, title: string, extra: { xp?: number; coins?: number } = {}) {
  const subjectId = runtime.ctx.subjects.findByKey(subjectKey)?.id ?? null;
  const created = runtime.ctx.tasks.create(
    { type: NOTE_TYPE, title, subjectId, config: READY_NOTE, ...extra },
    adminId,
  );
  runtime.ctx.tasks.update(created.id, { status: 'published' }, adminId);
  return created.id;
}

const pass = (learnerId: number, taskId: number, correct = 3, total = 3) =>
  runtime.ctx.progress.recordResult(learnerId, taskId, { correct, total, passed: true });

const progress = (learnerId: number = anya): LearnerProgressDto =>
  runtime.ctx.progress.learnerProgress(learnerId);

function item(taskId: number, learnerId: number = anya): TaskProgressDto {
  const found = progress(learnerId).tasks.find((t) => t.taskId === taskId);
  if (!found) {
    throw new Error(`Task ${taskId} is not visible`);
  }
  return found;
}

const openIds = (learnerId: number = anya): number[] =>
  progress(learnerId)
    .tasks.filter((t) => t.available)
    .map((t) => t.taskId);

const wallet = (learnerId: number = anya) => runtime.ctx.ledger.balance(learnerId);
const ledgerRows = (): number =>
  (runtime.ctx.db.$client.prepare('SELECT count(*) AS n FROM ledger').get() as { n: number }).n;
const totalChanges = (): number =>
  (runtime.ctx.db.$client.prepare('SELECT total_changes() AS n').get() as { n: number }).n;

describe('availability (pure)', () => {
  const t = (id: number, subjectKey: string | null, assignmentPosition: number | null = null) => ({
    id,
    subjectKey,
    assignmentPosition,
  });
  const done = (completedAt: number) => ({ completed: true, started: true, completedAt });

  it('rotation: subjects take turns after a completion; others are sequential', () => {
    const tasks = [t(1, 'russian'), t(2, 'russian'), t(3, 'math'), t(4, 'art'), t(5, 'art')];
    const rotationSubjects = ['russian', 'math', 'world', 'reading'];
    const fresh = computeAvailability({
      mode: 'rotation',
      rotationSubjects,
      tasks,
      facts: new Map(),
    });
    expect(fresh.nextTaskId).toBe(1);
    const open = [...fresh.byTask].filter(([, a]) => a.available).map(([id]) => id);
    expect(open.sort()).toEqual([1, 4]);
    expect(fresh.byTask.get(3)).toEqual({ available: false, lockReason: 'rotation' });
    expect(fresh.byTask.get(5)).toEqual({ available: false, lockReason: 'previous' });

    const afterRussian = computeAvailability({
      mode: 'rotation',
      rotationSubjects,
      tasks,
      facts: new Map([[1, done(100)]]),
    });
    expect(afterRussian.nextTaskId).toBe(3);
    expect(afterRussian.byTask.get(2)?.available).toBe(false);

    const afterMath = computeAvailability({
      mode: 'rotation',
      rotationSubjects,
      tasks,
      facts: new Map([
        [1, done(100)],
        [3, done(200)],
      ]),
    });
    // world and reading have no tasks: the turn comes back to russian.
    expect(afterMath.nextTaskId).toBe(2);
  });

  it('assigned tasks are open and first; tasks without a subject are open', () => {
    const tasks = [t(1, 'russian'), t(2, 'russian', 2), t(3, 'math', 1), t(4, null)];
    const result = computeAvailability({
      mode: 'sequential',
      rotationSubjects: [],
      tasks,
      facts: new Map(),
    });
    expect(result.nextTaskId).toBe(3);
    expect([...result.byTask].every(([, a]) => a.available)).toBe(true);
  });
});

describe('availability through the service', () => {
  it('defaults to rotation russian → math → world → reading, advancing on a pass', () => {
    const r1 = task('russian', 'Р1');
    const r2 = task('russian', 'Р2');
    const m1 = task('math', 'М1');
    const w1 = task('world', 'О1');
    const rd1 = task('reading', 'Ч1');
    const a1 = task('art', 'И1');
    const a2 = task('art', 'И2');

    expect(progress().mode).toBe('rotation');
    expect(progress().nextTaskId).toBe(r1);
    expect(openIds().sort()).toEqual([r1, a1].sort());
    expect(item(a2).lockReason).toBe('previous');
    expect(item(m1).lockReason).toBe('rotation');

    pass(anya, r1);
    expect(progress().nextTaskId).toBe(m1);
    expect(item(r2).available).toBe(false);
    pass(anya, m1);
    expect(progress().nextTaskId).toBe(w1);
    pass(anya, w1);
    expect(progress().nextTaskId).toBe(rd1);
    pass(anya, rd1);
    expect(progress().nextTaskId).toBe(r2);
    // A failed attempt does not move the circle, but the started task stays open.
    runtime.ctx.progress.recordResult(anya, r2, { correct: 0, total: 3, passed: false });
    expect(progress().nextTaskId).toBe(r2);
    expect(item(r2)).toMatchObject({ state: 'started', score: 0, total: 3, available: true });

    // Borya's circle is his own.
    expect(progress(borya).nextTaskId).toBe(r1);
  });

  it('assigned tasks go first in "next" and bypass the order', async () => {
    task('russian', 'Р1');
    const m2 = task('math', 'М1');
    const m3 = task('math', 'М2');
    await admin.post(`/api/admin/tasks/${m3}/assignments`, { learnerId: anya });
    await admin.post(`/api/admin/tasks/${m2}/assignments`, { learnerId: anya });
    const view = progress();
    expect(view.nextTaskId).toBe(m3);
    expect(item(m3).available).toBe(true);
    expect(view).toMatchObject({ assignedTotal: 2, assignedDone: 0 });
    pass(anya, m3);
    expect(progress()).toMatchObject({ nextTaskId: m2, assignedDone: 1 });
  });

  it('sequential and all modes', () => {
    const r1 = task('russian', 'Р1');
    const r2 = task('russian', 'Р2');
    const m1 = task('math', 'М1');
    runtime.ctx.settings.set('progress.unlockMode', 'sequential', adminId);
    expect(openIds().sort()).toEqual([r1, m1].sort());
    expect(item(r2).lockReason).toBe('previous');
    pass(anya, r1);
    expect(openIds().sort()).toEqual([r1, r2, m1].sort());

    runtime.ctx.settings.set('progress.unlockMode', 'all', adminId);
    expect(openIds(borya).sort()).toEqual([r1, r2, m1].sort());
  });

  it('a custom rotation circle from settings', () => {
    const r1 = task('russian', 'Р1');
    const a1 = task('art', 'И1');
    runtime.ctx.settings.set('progress.rotationSubjects', ['art', 'russian'], adminId);
    expect(progress().nextTaskId).toBe(a1);
    pass(anya, a1);
    expect(progress().nextTaskId).toBe(r1);
  });

  it('is computed on read and writes nothing', async () => {
    const r1 = task('russian', 'Р1');
    pass(anya, r1);
    const tablet = createClient(app());
    await loginAdmin(tablet);
    await trustDevice(tablet);
    expect(
      (await tablet.post('/api/auth/learner-login', { userId: anya, pin: '1111' })).status,
    ).toBe(200);
    const before = totalChanges();
    const mine = (await (await tablet.get('/api/me/progress')).json()) as LearnerProgressDto;
    const theirs = (await (
      await admin.get(`/api/admin/learners/${anya}/progress`)
    ).json()) as LearnerProgressDto;
    expect(totalChanges()).toBe(before);
    expect(mine).toEqual(theirs);
    expect(mine.tasks[0]).toMatchObject({
      taskId: r1,
      state: 'passed',
      completed: true,
      score: 3,
      total: 3,
      epoch: 0,
    });
    expect(mine.tasks[0]?.completedAt).not.toBeNull();
  });
});

describe('rewards of a pass', () => {
  it('pay proportionally once; a reset does not pay again', () => {
    const r1 = task('russian', 'Р1');
    expect(pass(anya, r1, 2, 3).reward).toEqual({ xp: 66, coins: 233 });
    expect(wallet()).toEqual({ xp: 66, coins: 233 });

    const reset = runtime.ctx.progress.reset(anya, { taskId: r1, requestId: requestId() }, adminId);
    expect(reset.created).toBe(true);
    expect(item(r1)).toMatchObject({ epoch: 1, state: 'none', completed: false });
    expect(wallet()).toEqual({ xp: 66, coins: 233 }); // ledger untouched by the reset
    expect(pass(anya, r1, 3, 3).reward).toEqual({ xp: 0, coins: 0 });
    expect(wallet()).toEqual({ xp: 66, coins: 233 });
  });

  it('reopen tops up a better result to the best reward, never twice', () => {
    const r1 = task('russian', 'Р1');
    pass(anya, r1, 2, 3);
    const reopened = runtime.ctx.progress.reopen(anya, r1, adminId);
    expect(reopened).toMatchObject({ epoch: 1, state: 'none', completed: true, available: true });

    expect(pass(anya, r1, 3, 3).reward).toEqual({ xp: 34, coins: 117 });
    expect(wallet()).toEqual({ xp: 100, coins: 350 });
    // The same epoch cannot be passed (and topped up) again.
    expect(() => pass(anya, r1, 3, 3)).toThrow(/уже выполнено/);

    runtime.ctx.progress.reopen(anya, r1, adminId);
    expect(pass(anya, r1, 3, 3).reward).toEqual({ xp: 0, coins: 0 });
    runtime.ctx.progress.reopen(anya, r1, adminId);
    expect(pass(anya, r1, 2, 3).reward).toEqual({ xp: 0, coins: 0 });
    expect(wallet()).toEqual({ xp: 100, coins: 350 });
  });

  it('reopen needs a result to start from', () => {
    const r1 = task('russian', 'Р1');
    expect(() => runtime.ctx.progress.reopen(anya, r1, adminId)).toThrow(/ещё нет результата/);
  });
});

describe('admin actions over HTTP', () => {
  const closure = (learnerId: number, taskId: number, body: unknown) =>
    admin.post(`/api/admin/learners/${learnerId}/progress/${taskId}/closure`, body);

  it('close with reward pays the full reward once', async () => {
    const r1 = task('russian', 'Р1', { xp: 90, coins: 300 });
    const res = await closure(anya, r1, { withReward: true, reason: 'Сделали вместе' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { progress: TaskProgressDto; reward: unknown };
    expect(body.reward).toEqual({ xp: 90, coins: 300 });
    expect(body.progress).toMatchObject({
      state: 'closed',
      completed: true,
      closedBy: adminId,
      closedReason: 'Сделали вместе',
    });
    const again = await closure(anya, r1, { withReward: true });
    expect(again.status).toBe(409);
    expect(await errorCode(again)).toBe('already_completed');

    runtime.ctx.progress.reset(anya, { taskId: r1, requestId: requestId() }, adminId);
    const afterReset = await closure(anya, r1, { withReward: true });
    expect(((await afterReset.json()) as { reward: unknown }).reward).toEqual({ xp: 0, coins: 0 });
    expect(wallet()).toEqual({ xp: 90, coins: 300 });

    const audited = runtime.ctx.audit.list({ learnerId: anya, action: 'progress.closed' }).items;
    expect(audited).toHaveLength(2);
    expect(audited.at(-1)?.payload).toMatchObject({ withReward: true, xp: 90, coins: 300 });
  });

  it('close without reward writes no ledger row; drafts cannot be closed', async () => {
    const r1 = task('russian', 'Р1');
    expect((await closure(anya, r1, { withReward: false })).status).toBe(201);
    expect(ledgerRows()).toBe(0);
    expect(progress().nextTaskId).not.toBe(r1);

    const draft = runtime.ctx.tasks.create({ type: NOTE_TYPE, title: 'Черновик' }, adminId).id;
    const refused = await closure(anya, draft, { withReward: true });
    expect(refused.status).toBe(409);
    expect(await errorCode(refused)).toBe('task_not_published');
    expect((await closure(9999, r1, { withReward: true })).status).toBe(404);
  });

  it('reopening over HTTP starts a new epoch and is audited', async () => {
    const r1 = task('russian', 'Р1');
    pass(anya, r1);
    const res = await admin.post(`/api/admin/learners/${anya}/progress/${r1}/reopening`);
    expect(res.status).toBe(201);
    expect(((await res.json()) as TaskProgressDto).epoch).toBe(1);
    expect(runtime.ctx.audit.list({ action: 'progress.reopened' }).items).toHaveLength(1);
  });

  it('reset by task or for everything; a repeated request is a no-op', async () => {
    const r1 = task('russian', 'Р1');
    const m1 = task('math', 'М1');
    pass(anya, r1);
    pass(anya, m1);
    const id = requestId();
    const first = await admin.post(`/api/admin/learners/${anya}/progress-resets`, {
      requestId: id,
    });
    expect(first.status).toBe(201);
    expect(progress().tasks.map((t) => [t.epoch, t.completed])).toEqual([
      [1, false],
      [1, false],
    ]);
    expect(runtime.ctx.progress.lastFullResetAt(anya)).not.toBeNull();
    // Rotation starts over from the first subject.
    expect(progress().nextTaskId).toBe(r1);

    pass(anya, r1);
    const repeat = await admin.post(`/api/admin/learners/${anya}/progress-resets`, {
      requestId: id,
    });
    expect(repeat.status).toBe(200);
    expect(item(r1)).toMatchObject({ epoch: 1, completed: true });

    const byTask = await admin.post(`/api/admin/learners/${anya}/progress-resets`, {
      taskId: r1,
      requestId: requestId(),
    });
    expect(byTask.status).toBe(201);
    expect(item(r1).epoch).toBe(2);
    expect(item(m1).epoch).toBe(1);
    // Coins, XP and Borya's progress are untouched.
    expect(wallet()).toEqual({ xp: 200, coins: 700 });
    expect(runtime.ctx.audit.list({ action: 'progress.reset' }).items).toHaveLength(2);
    expect(item(r1, borya).epoch).toBe(0);
  });

  it('coins-reset brings coins to zero with one compensating row, idempotently', async () => {
    const r1 = task('russian', 'Р1');
    pass(anya, r1);
    const id = requestId();
    const res = await admin.post(`/api/admin/learners/${anya}/coins-resets`, { requestId: id });
    expect(res.status).toBe(201);
    expect(((await res.json()) as LedgerEntryDto).coins).toBe(-350);
    expect(wallet()).toEqual({ xp: 100, coins: 0 });

    const rows = ledgerRows();
    const repeat = await admin.post(`/api/admin/learners/${anya}/coins-resets`, { requestId: id });
    expect(repeat.status).toBe(200);
    expect(ledgerRows()).toBe(rows);

    // A negative balance is brought up to zero as well.
    runtime.ctx.ledger.post({
      learnerId: borya,
      coins: -40,
      sourceType: 'award',
      idemKey: requestKey('award', borya, 'fine-0000001'),
    });
    await admin.post(`/api/admin/learners/${borya}/coins-resets`, { requestId: requestId() });
    expect(wallet(borya).coins).toBe(0);
    expect(runtime.ctx.audit.list({ action: 'ledger.coins_reset' }).items).toHaveLength(2);

    const bad = await admin.post(`/api/admin/learners/${anya}/coins-resets`, { requestId: 'x' });
    expect(bad.status).toBe(400);
  });

  it('GET progress of an unknown learner is 404', async () => {
    expect((await admin.get(`/api/admin/learners/9999/progress`)).status).toBe(404);
    expect((await admin.get(`/api/admin/learners/${adminId}/progress`)).status).toBe(404);
  });
});
