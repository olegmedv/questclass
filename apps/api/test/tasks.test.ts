import { defineTaskType } from '@questclass/shared/tasks/contract';
import type { LearnerTaskDto, SubjectDto, TaskDto } from '@questclass/shared/tasks/dto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { idemKey } from '../src/modules/ledger/service';
import {
  SEED_SUBJECTS,
  seedSubjects,
  seedSubjectsOnFirstStart,
} from '../src/modules/subjects/seed';
import { createTasksService } from '../src/modules/tasks/service';
import { createTaskTypeRegistry, type TaskTypePlugin } from '../src/task-types/registry';
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

const app = () => createApp(runtime.ctx).app;

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

async function learnerClient(userId: number, pin: string): Promise<TestClient> {
  const tablet = createClient(app());
  await loginAdmin(tablet);
  await trustDevice(tablet);
  const res = await tablet.post('/api/auth/learner-login', { userId, pin });
  expect(res.status).toBe(200);
  return tablet;
}

const subjectId = (key: string): number => {
  const row = runtime.ctx.subjects.findByKey(key);
  if (!row) {
    throw new Error(`No subject ${key}`);
  }
  return row.id;
};

async function createTask(body: Record<string, unknown> = {}): Promise<TaskDto> {
  const res = await admin.post('/api/admin/tasks', {
    type: NOTE_TYPE,
    title: 'Сложение',
    subjectId: subjectId('math'),
    config: READY_NOTE,
    ...body,
  });
  expect(res.status, await res.clone().text()).toBe(201);
  return (await res.json()) as TaskDto;
}

async function publishedTask(body: Record<string, unknown> = {}): Promise<TaskDto> {
  const task = await createTask(body);
  const res = await admin.patch(`/api/admin/tasks/${task.id}`, { status: 'published' });
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as TaskDto;
}

async function visibleIds(client: TestClient): Promise<number[]> {
  const res = await client.get('/api/tasks');
  expect(res.status).toBe(200);
  return ((await res.json()) as LearnerTaskDto[]).map((t) => t.id);
}

describe('subjects seed', () => {
  it('a new installation has the six starter subjects, in order', () => {
    const list = runtime.ctx.subjects.list();
    expect(list.map((s) => s.key)).toEqual(['russian', 'world', 'math', 'reading', 'art', 'craft']);
    expect(list.map((s) => s.name)).toEqual(SEED_SUBJECTS.map((s) => s.name));
    expect(list.every((s) => s.icon === `game/subjects-pixel/${s.key}`)).toBe(true);
  });

  it('is idempotent by key and keeps the admin’s edits', async () => {
    const math = subjectId('math');
    const res = await admin.patch(`/api/admin/subjects/${math}`, { name: 'Математика 2', sort: 1 });
    expect(res.status).toBe(200);
    expect(seedSubjects(runtime.ctx.db)).toBe(0);
    expect(seedSubjects(runtime.ctx.db)).toBe(0);
    expect(runtime.ctx.subjects.list()).toHaveLength(6);
    expect(runtime.ctx.subjects.get(math)).toMatchObject({ name: 'Математика 2', sort: 1 });
  });

  it('a deleted starter subject does not come back on restart', async () => {
    expect((await admin.delete(`/api/admin/subjects/${subjectId('craft')}`)).status).toBe(204);
    expect(seedSubjectsOnFirstStart(runtime.ctx.db)).toBe(0);
    expect(runtime.ctx.subjects.findByKey('craft')).toBeUndefined();
    // An explicit seed restores missing keys.
    expect(seedSubjects(runtime.ctx.db)).toBe(1);
  });
});

describe('subjects API', () => {
  it('keeps key and name unique (name ignores case and spaces)', async () => {
    const created = await admin.post('/api/admin/subjects', { key: 'music', name: 'Музыка' });
    expect(created.status).toBe(201);
    const dupKey = await admin.post('/api/admin/subjects', { key: 'music', name: 'Пение' });
    expect(dupKey.status).toBe(409);
    expect(await errorCode(dupKey)).toBe('subject_key_taken');
    const dupName = await admin.post('/api/admin/subjects', { name: '  математика  ' });
    expect(dupName.status).toBe(409);
    expect(await errorCode(dupName)).toBe('subject_name_taken');
    const rename = await admin.patch(`/api/admin/subjects/${subjectId('art')}`, { name: 'ТРУД' });
    expect(rename.status).toBe(409);
    expect(await errorCode(rename)).toBe('subject_name_taken');
  });

  it('generates a key when the admin gives none and puts the subject last', async () => {
    const res = await admin.post('/api/admin/subjects', { name: '  Английский   язык ' });
    const subject = (await res.json()) as SubjectDto;
    expect(subject.name).toBe('Английский язык');
    expect(subject.key).toMatch(/^s-[0-9a-f]{8}$/);
    expect(subject.sort).toBeGreaterThan(60);
  });

  it('deletes an unused subject, refuses one with tasks (409) and archives instead', async () => {
    const music = (await (
      await admin.post('/api/admin/subjects', { key: 'music', name: 'Музыка' })
    ).json()) as SubjectDto;
    expect((await admin.delete(`/api/admin/subjects/${music.id}`)).status).toBe(204);
    expect(runtime.ctx.subjects.findRow(music.id)).toBeUndefined();

    const math = subjectId('math');
    await createTask();
    const refused = await admin.delete(`/api/admin/subjects/${math}`);
    expect(refused.status).toBe(409);
    expect(await errorCode(refused)).toBe('has_history');
    // FK RESTRICT: even a direct delete is refused by the database.
    expect(() =>
      runtime.ctx.db.$client.prepare('DELETE FROM subjects WHERE id = ?').run(math),
    ).toThrow(/FOREIGN KEY/);

    const archived = await admin.patch(`/api/admin/subjects/${math}`, { archived: true });
    expect(((await archived.json()) as SubjectDto).archived).toBe(true);
    const a = await learnerClient(anya, '1111');
    const visible = (await (await a.get('/api/subjects')).json()) as SubjectDto[];
    expect(visible.map((s) => s.key)).not.toContain('math');
    const all = (await (await admin.get('/api/admin/subjects')).json()) as SubjectDto[];
    expect(all.find((s) => s.id === math)?.archived).toBe(true);
  });

  it('records changes in the audit log', async () => {
    await admin.post('/api/admin/subjects', { key: 'music', name: 'Музыка' });
    await admin.patch(`/api/admin/subjects/${subjectId('music')}`, { icon: null, sort: 99 });
    const actions = runtime.ctx.audit.list({}).items.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['subject.created', 'subject.updated']));
  });
});

describe('task type registry', () => {
  it('refuses a type registered twice and a contract with an invalid default', () => {
    expect(() => runtime.ctx.taskTypes.register(noteTaskType)).toThrow(/twice/);
    expect(() =>
      defineTaskType({
        ...noteTaskType.contract,
        type: 'broken',
        defaultConfig: () => ({ text: 1 }) as never,
      }),
    ).toThrow(/does not match/);
    expect(() => defineTaskType({ ...noteTaskType.contract, type: 'Bad Type' })).toThrow();
    // A registry of another runtime does not see types registered here.
    expect(createTaskTypeRegistry().get(NOTE_TYPE)).toBeUndefined();
  });
});

describe('admin tasks API', () => {
  it('creates drafts with the economy defaults and validates type, config and subject', async () => {
    const task = await createTask();
    expect(task).toMatchObject({
      type: NOTE_TYPE,
      status: 'draft',
      xp: 100,
      coins: 350,
      config: READY_NOTE,
      assignees: [],
      publishedAt: null,
    });
    const second = await createTask({ title: 'Вычитание' });
    expect(second.sort).toBeGreaterThan(task.sort);

    const unknownType = await admin.post('/api/admin/tasks', { type: 'nope', title: 'X' });
    expect(unknownType.status).toBe(400);
    expect(await errorCode(unknownType)).toBe('unknown_task_type');
    const badConfig = await admin.post('/api/admin/tasks', {
      type: NOTE_TYPE,
      title: 'X',
      config: { text: 5 },
    });
    expect(badConfig.status).toBe(400);
    expect(await errorCode(badConfig)).toBe('invalid_config');
    const badSubject = await admin.post('/api/admin/tasks', {
      type: NOTE_TYPE,
      title: 'X',
      subjectId: 9999,
    });
    expect(badSubject.status).toBe(400);
    expect(await errorCode(badSubject)).toBe('unknown_subject');
  });

  it('publishing runs canPublish and answers 422 with the list of problems', async () => {
    const draft = await createTask({ config: { text: '', answer: '' }, subjectId: null });
    const refused = await admin.patch(`/api/admin/tasks/${draft.id}`, { status: 'published' });
    expect(refused.status).toBe(422);
    const body = (await refused.json()) as {
      error: { code: string; details: { errors: string[] } };
    };
    expect(body.error.code).toBe('cannot_publish');
    expect(body.error.details.errors).toEqual(['Нужен текст задания', 'Выберите предмет']);
    expect(runtime.ctx.tasks.get(draft.id).status).toBe('draft');

    const ok = await admin.patch(`/api/admin/tasks/${draft.id}`, {
      status: 'published',
      config: READY_NOTE,
      subjectId: subjectId('math'),
    });
    expect(ok.status).toBe(200);
    const published = (await ok.json()) as TaskDto;
    expect(published.status).toBe('published');
    expect(published.publishedAt).not.toBeNull();

    // A published task cannot be edited into an unpublishable state.
    const broken = await admin.patch(`/api/admin/tasks/${draft.id}`, {
      config: { text: '', answer: '' },
    });
    expect(broken.status).toBe(422);
    expect(runtime.ctx.tasks.get(draft.id).config).toEqual(READY_NOTE);
  });

  it('includes the server-side publish checks of the type', async () => {
    const strict: TaskTypePlugin = {
      ...noteTaskType,
      contract: defineTaskType({ ...noteTaskType.contract, type: 'test_strict' }),
      publishChecks: () => ['Видео ещё не готово'],
    };
    runtime.ctx.taskTypes.register(strict);
    const task = await createTask({ type: 'test_strict' });
    const res = await admin.patch(`/api/admin/tasks/${task.id}`, { status: 'published' });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { details: { errors: string[] } } };
    expect(body.error.details.errors).toEqual(['Видео ещё не готово']);
  });

  it('lists with filters and audits every change', async () => {
    const draft = await createTask();
    const published = await publishedTask({ title: 'Опубликованное' });
    const filtered = (await (
      await admin.get('/api/admin/tasks?status=published')
    ).json()) as TaskDto[];
    expect(filtered.map((t) => t.id)).toEqual([published.id]);
    const all = (await (await admin.get('/api/admin/tasks')).json()) as TaskDto[];
    expect(all.map((t) => t.id).sort()).toEqual([draft.id, published.id].sort());

    const unchanged = await admin.patch(`/api/admin/tasks/${draft.id}`, { title: 'Сложение' });
    expect(unchanged.status).toBe(200);
    const updates = runtime.ctx.audit.list({ action: 'task.updated' }).items;
    expect(updates).toHaveLength(1); // only the publication, the no-op patch is not audited
    expect(updates[0]?.payload).toMatchObject({ changed: ['status'], status: 'published' });
    expect(runtime.ctx.audit.list({ action: 'task.created' }).items).toHaveLength(2);
  });

  it('deletes a task without history; with history it is 409 and can be archived', async () => {
    const plain = await createTask();
    await admin.post(`/api/admin/tasks/${plain.id}/assignments`, { learnerId: anya });
    expect((await admin.delete(`/api/admin/tasks/${plain.id}`)).status).toBe(204);
    expect((await admin.get(`/api/admin/tasks/${plain.id}`)).status).toBe(404);

    const rewarded = await publishedTask();
    runtime.ctx.ledger.post({
      learnerId: anya,
      xp: 100,
      coins: 350,
      sourceType: 'task',
      sourceId: rewarded.id,
      idemKey: idemKey('task', rewarded.id, 'learner', anya, 'pass'),
    });
    const refused = await admin.delete(`/api/admin/tasks/${rewarded.id}`);
    expect(refused.status).toBe(409);
    expect(await errorCode(refused)).toBe('has_history');
    expect(runtime.ctx.tasks.get(rewarded.id).status).toBe('published');

    const a = await learnerClient(anya, '1111');
    expect(await visibleIds(a)).toContain(rewarded.id);
    await admin.patch(`/api/admin/tasks/${rewarded.id}`, { status: 'archived' });
    expect(await visibleIds(a)).not.toContain(rewarded.id);
    // History stays: the reward is still in the ledger.
    expect(runtime.ctx.ledger.balance(anya)).toEqual({ xp: 100, coins: 350 });
  });

  it('task references are RESTRICT in the database', async () => {
    const task = await createTask();
    await admin.post(`/api/admin/tasks/${task.id}/assignments`, { learnerId: anya });
    expect(() =>
      runtime.ctx.db.$client.prepare('DELETE FROM tasks WHERE id = ?').run(task.id),
    ).toThrow(/FOREIGN KEY/);
  });
});

describe('assignments', () => {
  it('adds and removes a learner; repeats are harmless; unknown learners are 404', async () => {
    const task = await createTask();
    const first = await admin.post(`/api/admin/tasks/${task.id}/assignments`, { learnerId: anya });
    expect(first.status).toBe(201);
    expect(((await first.json()) as TaskDto).assignees).toEqual([anya]);
    const again = await admin.post(`/api/admin/tasks/${task.id}/assignments`, { learnerId: anya });
    expect(again.status).toBe(200);

    for (const learnerId of [adminId, 9999]) {
      const res = await admin.post(`/api/admin/tasks/${task.id}/assignments`, { learnerId });
      expect(res.status).toBe(404);
    }
    expect((await admin.delete(`/api/admin/tasks/${task.id}/assignments/${anya}`)).status).toBe(
      204,
    );
    expect((await admin.delete(`/api/admin/tasks/${task.id}/assignments/${anya}`)).status).toBe(
      404,
    );
    const audited = runtime.ctx.audit.list({ learnerId: anya }).items.map((r) => r.action);
    expect(audited).toEqual(expect.arrayContaining(['task.assigned', 'task.unassigned']));
  });

  it('audience: the assignees, or every active learner when there are none', async () => {
    const task = await createTask();
    expect(runtime.ctx.tasks.audience(task.id).sort()).toEqual([anya, borya].sort());
    await admin.patch(`/api/admin/users/${borya}`, { active: false });
    expect(runtime.ctx.tasks.audience(task.id)).toEqual([anya]);
    await admin.post(`/api/admin/tasks/${task.id}/assignments`, { learnerId: anya });
    expect(runtime.ctx.tasks.audience(task.id)).toEqual([anya]);
  });
});

describe('GET /api/tasks (learner)', () => {
  it('shows published, released tasks meant for the learner, with public config only', async () => {
    const forAll = await publishedTask({ title: 'Для всех' });
    const forAnya = await publishedTask({ title: 'Для Ани' });
    await admin.post(`/api/admin/tasks/${forAnya.id}/assignments`, { learnerId: anya });
    const draft = await createTask({ title: 'Черновик' });
    const future = await publishedTask({
      title: 'Будущее',
      releaseAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const past = await publishedTask({
      title: 'Уже открыто',
      releaseAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const a = await learnerClient(anya, '1111');
    const b = await learnerClient(borya, '2222');
    const changes = () =>
      (runtime.ctx.db.$client.prepare('SELECT total_changes() AS n').get() as { n: number }).n;
    const before = changes();
    const listA = (await (await a.get('/api/tasks')).json()) as LearnerTaskDto[];
    expect(changes()).toBe(before);

    expect(listA.map((t) => t.id).sort()).toEqual([forAll.id, forAnya.id, past.id].sort());
    expect(listA.find((t) => t.id === forAnya.id)?.assigned).toBe(true);
    expect(listA.find((t) => t.id === forAll.id)?.assigned).toBe(false);
    for (const task of listA) {
      expect(task.config).toEqual({ text: READY_NOTE.text });
      expect(JSON.stringify(task)).not.toContain(`"answer"`);
    }
    expect((await visibleIds(b)).sort()).toEqual([forAll.id, past.id].sort());
    expect([draft.id, future.id].some((id) => listA.some((t) => t.id === id))).toBe(false);

    expect((await a.get(`/api/tasks/${forAnya.id}`)).status).toBe(200);
    expect((await b.get(`/api/tasks/${forAnya.id}`)).status).toBe(404);
    expect((await a.get(`/api/tasks/${draft.id}`)).status).toBe(404);
    expect((await a.get(`/api/tasks/${future.id}`)).status).toBe(404);
    expect((await admin.get('/api/tasks')).status).toBe(403);
  });

  it('"no assignments" means every learner active at the time of the request', async () => {
    const task = await publishedTask();
    const vera = await createLearner(runtime.ctx, 'Вера', '3333');
    expect(await visibleIds(await learnerClient(vera, '3333'))).toEqual([task.id]);
  });

  it('hides tasks of archived subjects and of unknown types', async () => {
    const task = await publishedTask();
    const a = await learnerClient(anya, '1111');
    expect(await visibleIds(a)).toEqual([task.id]);
    await admin.patch(`/api/admin/subjects/${subjectId('math')}`, { archived: true });
    expect(await visibleIds(a)).toEqual([]);
    await admin.patch(`/api/admin/subjects/${subjectId('math')}`, { archived: false });

    // A runtime without the test type (e.g. after the type was removed) hides the task.
    const tasksWithoutType = createTasksService(runtime.ctx.db, {
      ...runtime.ctx,
      taskTypes: createTaskTypeRegistry(),
    });
    expect(tasksWithoutType.visibleTo(anya)).toEqual([]);
  });
});
