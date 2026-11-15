import type { AwardDto, AwardPageDto, RewardReasonDto } from '@questclass/shared/rewards/dto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { requestKey } from '../src/modules/ledger/service';
import { SEED_REWARD_REASONS, seedRewardReasons } from '../src/modules/rewards/seed';
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

let runtime: TestRuntime;
let adminId: number;
let anya: number;
let borya: number;
let admin: TestClient;

beforeEach(async () => {
  runtime = await createTestRuntime();
  runtime.ctx.taskTypes.register(noteTaskType);
  adminId = await quickAdmin(runtime.ctx);
  anya = await quickLearner(runtime.ctx, 'Аня', '1111');
  borya = await quickLearner(runtime.ctx, 'Боря', '2222');
  admin = createClient(createApp(runtime.ctx).app);
  await loginAdmin(admin);
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

const reasons = async (): Promise<RewardReasonDto[]> =>
  (await (await admin.get('/api/admin/reward-reasons')).json()) as RewardReasonDto[];
const seeded = async (seedKey: string): Promise<RewardReasonDto> => {
  const found = (await reasons()).find((r) => r.seedKey === seedKey);
  if (!found) {
    throw new Error(`No seeded reason ${seedKey}`);
  }
  return found;
};

let requests = 0;
const nextRequestId = (): string => `award-req-${String((requests += 1)).padStart(6, '0')}`;

const awardBody = (overrides: Record<string, unknown> = {}) => ({
  reasonId: 'custom',
  title: 'Прописи',
  date: '2026-11-12',
  xp: 50,
  coins: 10,
  requestId: nextRequestId(),
  ...overrides,
});

const grant = (learnerId: number, body: unknown) =>
  admin.post(`/api/admin/learners/${learnerId}/awards`, body);
const cancel = (learnerId: number, awardId: number) =>
  admin.post(`/api/admin/learners/${learnerId}/awards/${awardId}/cancellation`);

const count = (table: string): number =>
  (runtime.ctx.db.$client.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('reward reasons', () => {
  it('seeds the two default reasons of the original by seed_key', async () => {
    const list = await reasons();
    expect(
      list.map(({ seedKey, name, xp, coins, archived }) => ({
        seedKey,
        name,
        xp,
        coins,
        archived,
      })),
    ).toEqual([
      { seedKey: 'attendance', name: 'Присутствие на уроке', xp: 50, coins: 10, archived: false },
      { seedKey: 'homework', name: 'Домашняя работа', xp: 50, coins: 10, archived: false },
    ]);
    expect(SEED_REWARD_REASONS).toHaveLength(2);
    // A restart seeds nothing new.
    expect(seedRewardReasons(runtime.ctx.db)).toBe(0);
    expect(count('reward_reasons')).toBe(2);
  });

  it('the seed never overwrites admin edits and never revives archived reasons', async () => {
    const homework = await seeded('homework');
    const attendance = await seeded('attendance');
    expect(
      (await admin.patch(`/api/admin/reward-reasons/${homework.id}`, { name: 'Домашка', xp: 70 }))
        .status,
    ).toBe(200);
    expect(
      (await admin.patch(`/api/admin/reward-reasons/${attendance.id}`, { archived: true })).status,
    ).toBe(200);

    expect(seedRewardReasons(runtime.ctx.db)).toBe(0);
    expect(await seeded('homework')).toMatchObject({ name: 'Домашка', xp: 70, coins: 10 });
    expect(await seeded('attendance')).toMatchObject({ archived: true });
    expect(runtime.ctx.rewards.listReasons().map((r) => r.seedKey)).toEqual(['homework']);
  });

  it('creates, renames and archives reasons; names are unique among active ones', async () => {
    const created = await admin.post('/api/admin/reward-reasons', {
      name: '  Помощь   по дому ',
      xp: 0,
      coins: 30,
    });
    expect(created.status).toBe(201);
    const reason = (await created.json()) as RewardReasonDto;
    expect(reason).toMatchObject({ name: 'Помощь по дому', xp: 0, coins: 30, seedKey: null });

    const twin = await admin.post('/api/admin/reward-reasons', {
      name: 'помощь ПО дому',
      xp: 1,
      coins: 1,
    });
    expect(twin.status).toBe(409);
    expect(await errorCode(twin)).toBe('reason_name_taken');

    const renamed = await admin.patch(`/api/admin/reward-reasons/${reason.id}`, {
      name: 'Помощь маме',
    });
    expect(await renamed.json()).toMatchObject({ name: 'Помощь маме' });

    // Archived names are free again; restoring the archived one would clash.
    await admin.patch(`/api/admin/reward-reasons/${reason.id}`, { archived: true });
    const again = await admin.post('/api/admin/reward-reasons', {
      name: 'Помощь маме',
      xp: 5,
      coins: 5,
    });
    expect(again.status).toBe(201);
    const restore = await admin.patch(`/api/admin/reward-reasons/${reason.id}`, {
      archived: false,
    });
    expect(restore.status).toBe(409);
    expect(await errorCode(restore)).toBe('reason_name_taken');

    const actions = runtime.ctx.audit
      .list({})
      .items.filter((r) => r.entity === 'reward_reason')
      .map((r) => r.action);
    expect(actions).toEqual(
      [
        'reward_reason.created',
        'reward_reason.updated',
        'reward_reason.updated',
        'reward_reason.created',
      ].reverse(),
    );
  });

  it('validates names and amounts', async () => {
    const bad = [
      { name: '', xp: 1, coins: 1 },
      { name: 'x'.repeat(61), xp: 1, coins: 1 },
      { name: 'Ничего', xp: 0, coins: 0 },
      { name: 'Много', xp: 1001, coins: 0 },
      { name: 'Минус', xp: -1, coins: 5 },
    ];
    for (const body of bad) {
      const res = await admin.post('/api/admin/reward-reasons', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const homework = await seeded('homework');
    const zero = await admin.patch(`/api/admin/reward-reasons/${homework.id}`, {
      xp: 0,
      coins: 0,
    });
    expect(zero.status).toBe(400);
    expect((await admin.patch('/api/admin/reward-reasons/9999', { xp: 3 })).status).toBe(404);
  });
});

describe('awards', () => {
  it('pays one ledger row keyed award:<learner>:<requestId>; a retry returns the first award', async () => {
    const homework = await seeded('homework');
    const body = awardBody({ reasonId: homework.id, subjectKey: 'math', note: 'Молодец' });
    const first = await grant(anya, body);
    expect(first.status).toBe(201);
    const award = (await first.json()) as AwardDto;
    expect(award).toMatchObject({
      learnerId: anya,
      reasonId: homework.id,
      reasonName: 'Домашняя работа',
      title: 'Прописи',
      date: '2026-11-12',
      subjectName: 'Математика',
      xp: 50,
      coins: 10,
      note: 'Молодец',
      cancelledAt: null,
      createdBy: adminId,
    });
    expect(runtime.ctx.ledger.balance(anya)).toEqual({ xp: 50, coins: 10 });
    const row = runtime.ctx.db.$client
      .prepare('SELECT idem_key, source_type, source_id FROM ledger WHERE id = ?')
      .get(award.ledgerId) as { idem_key: string; source_type: string; source_id: string };
    expect(row).toEqual({
      idem_key: requestKey('award', anya, body.requestId),
      source_type: 'award',
      source_id: String(award.id),
    });

    // Same request again (even with other fields): the first award, nothing new.
    const retry = await grant(anya, { ...body, coins: 999, title: 'Другое' });
    expect(retry.status).toBe(200);
    expect(((await retry.json()) as AwardDto).id).toBe(award.id);
    expect(count('ledger')).toBe(1);
    expect(count('awards')).toBe(1);
    // The same requestId for another learner is another intent.
    expect((await grant(borya, body)).status).toBe(201);
    expect(runtime.ctx.ledger.balance(anya)).toEqual({ xp: 50, coins: 10 });
  });

  it('keeps reason and subject names as snapshots', async () => {
    const homework = await seeded('homework');
    const award = (await (
      await grant(anya, awardBody({ reasonId: homework.id, subjectKey: 'math' }))
    ).json()) as AwardDto;
    await admin.patch(`/api/admin/reward-reasons/${homework.id}`, { name: 'Домашка' });
    const math = runtime.ctx.subjects.findByKey('math');
    runtime.ctx.subjects.update(math?.id ?? 0, { name: 'Математика 2' }, adminId);
    const page = runtime.ctx.rewards.list(anya);
    expect(page.items[0]).toMatchObject({
      id: award.id,
      reasonName: 'Домашняя работа',
      subjectName: 'Математика',
    });
  });

  it('a custom award and an award without a subject', async () => {
    const res = await grant(anya, awardBody({ title: 'Убрал комнату', xp: 0, coins: 25 }));
    expect(await res.json()).toMatchObject({
      reasonId: null,
      reasonName: 'Своя награда',
      subjectId: null,
      subjectName: 'Без предмета',
      taskId: null,
    });
  });

  it('may point at a lesson', async () => {
    const taskId = runtime.ctx.tasks.create(
      { type: NOTE_TYPE, title: 'Урок', config: READY_NOTE },
      adminId,
    ).id;
    const res = await grant(anya, awardBody({ taskId }));
    expect(await res.json()).toMatchObject({ taskId });
    // The award is history: the lesson cannot be deleted any more.
    expect((await admin.delete(`/api/admin/tasks/${taskId}`)).status).toBe(409);
  });

  it('refuses unknown or archived references and bad input', async () => {
    const attendance = await seeded('attendance');
    await admin.patch(`/api/admin/reward-reasons/${attendance.id}`, { archived: true });
    const cases: [Record<string, unknown>, number, string][] = [
      [{ reasonId: attendance.id }, 400, 'unknown_reason'],
      [{ reasonId: 9999 }, 400, 'unknown_reason'],
      [{ subjectKey: 'nope' }, 400, 'unknown_subject'],
      [{ taskId: 9999 }, 400, 'unknown_task'],
      [{ xp: 0, coins: 0 }, 400, 'validation_failed'],
      [{ date: '2026-02-30' }, 400, 'validation_failed'],
      [{ title: '   ' }, 400, 'validation_failed'],
      [{ title: 'x'.repeat(151) }, 400, 'validation_failed'],
      [{ coins: 1001 }, 400, 'validation_failed'],
      [{ requestId: 'bad:id!' }, 400, 'validation_failed'],
    ];
    for (const [overrides, status, code] of cases) {
      const res = await grant(anya, awardBody(overrides));
      expect(res.status, JSON.stringify(overrides)).toBe(status);
      expect(await errorCode(res)).toBe(code);
    }
    expect((await grant(adminId, awardBody())).status).toBe(404);
    expect((await grant(9999, awardBody())).status).toBe(404);
    expect(count('awards')).toBe(0);
    expect(count('ledger')).toBe(0);
  });

  it('warns about the same reason, date, subject and title with 409 unless forced', async () => {
    const homework = await seeded('homework');
    const base = { reasonId: homework.id, subjectKey: 'math', title: 'Прописи' };
    const first = (await (await grant(anya, awardBody(base))).json()) as AwardDto;

    const twin = await grant(anya, awardBody({ ...base, title: '  прописи ' }));
    expect(twin.status).toBe(409);
    const body = (await twin.json()) as { error: { code: string; details: unknown } };
    expect(body.error).toMatchObject({
      code: 'duplicate_award',
      details: { awardId: first.id, force: true },
    });

    // Another subject, date, reason or learner is not a duplicate.
    expect((await grant(anya, awardBody({ ...base, subjectKey: 'russian' }))).status).toBe(201);
    expect((await grant(anya, awardBody({ ...base, date: '2026-11-13' }))).status).toBe(201);
    expect((await grant(anya, awardBody({ ...base, reasonId: 'custom' }))).status).toBe(201);
    expect((await grant(borya, awardBody(base))).status).toBe(201);

    const forced = await grant(anya, awardBody({ ...base, force: true }));
    expect(forced.status).toBe(201);
    const audit = runtime.ctx.audit.list({ action: 'award.granted', learnerId: anya }).items;
    expect(audit[0]?.payload).toMatchObject({ forced: true, title: 'Прописи' });

    // A cancelled award no longer blocks the same award.
    const custom = { title: 'Чтение вслух', date: '2026-11-01' };
    const once = (await (await grant(anya, awardBody(custom))).json()) as AwardDto;
    expect((await grant(anya, awardBody(custom))).status).toBe(409);
    await cancel(anya, once.id);
    expect((await grant(anya, awardBody(custom))).status).toBe(201);
  });

  it('cancels with a compensating ledger row, once, with audit', async () => {
    const award = (await (await grant(anya, awardBody({ xp: 40, coins: 30 }))).json()) as AwardDto;
    runtime.ctx.ledger.spend({
      learnerId: anya,
      price: 25,
      sourceType: 'purchase',
      idemKey: requestKey('purchase', anya, 'spend-00000001'),
    });

    const res = await cancel(anya, award.id);
    expect(res.status).toBe(201);
    const cancelled = (await res.json()) as AwardDto;
    expect(cancelled.cancelledAt).not.toBeNull();
    // The award row stays; the balance may go below zero.
    expect(runtime.ctx.ledger.balance(anya)).toEqual({ xp: 0, coins: -25 });
    expect(count('awards')).toBe(1);
    const entries = runtime.ctx.ledger.list(anya, { type: 'award' }).items;
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ reversesId: award.ledgerId, xp: -40, coins: -30 });

    const again = await cancel(anya, award.id);
    expect(again.status).toBe(200);
    expect(((await again.json()) as AwardDto).cancelledAt).toBe(cancelled.cancelledAt);
    expect(runtime.ctx.ledger.list(anya, { type: 'award' }).items).toHaveLength(2);

    const audit = runtime.ctx.audit.list({ action: 'award.cancelled' }).items;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: adminId,
      learnerId: anya,
      entityId: String(award.id),
    });
  });

  it('another learner’s award is not found', async () => {
    const award = (await (await grant(anya, awardBody())).json()) as AwardDto;
    expect((await cancel(borya, award.id)).status).toBe(404);
    expect((await cancel(anya, 9999)).status).toBe(404);
    expect(runtime.ctx.ledger.balance(anya)).toEqual({ xp: 50, coins: 10 });
  });
});

describe('learner view («От родителя»)', () => {
  it('shows only the caller’s awards, newest first, with cancellations; reading writes nothing', async () => {
    const one = (await (await grant(anya, awardBody({ title: 'Один' }))).json()) as AwardDto;
    await grant(anya, awardBody({ title: 'Два' }));
    await grant(anya, awardBody({ title: 'Три' }));
    await grant(borya, awardBody({ title: 'Борин' }));
    await cancel(anya, one.id);

    const a = await learnerClient(anya, '1111');
    const b = await learnerClient(borya, '2222');
    const changes = () =>
      (runtime.ctx.db.$client.prepare('SELECT total_changes() AS n').get() as { n: number }).n;
    const before = changes();

    const pageA = (await (await a.get('/api/me/awards?limit=2')).json()) as AwardPageDto;
    expect(pageA.items.map((x) => x.title)).toEqual(['Три', 'Два']);
    expect(pageA.nextCursor).not.toBeNull();
    const rest = (await (
      await a.get(`/api/me/awards?limit=2&cursor=${pageA.nextCursor ?? ''}`)
    ).json()) as AwardPageDto;
    expect(rest.items.map((x) => [x.title, x.cancelledAt !== null])).toEqual([['Один', true]]);
    expect(rest.nextCursor).toBeNull();

    const pageB = (await (await b.get('/api/me/awards')).json()) as AwardPageDto;
    expect(pageB.items.map((x) => x.title)).toEqual(['Борин']);
    expect(changes()).toBe(before);

    const adminView = (await (
      await admin.get(`/api/admin/learners/${anya}/awards`)
    ).json()) as AwardPageDto;
    expect(adminView.items).toHaveLength(3);
  });
});
