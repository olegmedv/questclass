import type { StreakDto } from '@questclass/shared/progress/dto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createStreakService, type StreakService } from '../src/modules/streak/service';
import { NOTE_TYPE, READY_NOTE, noteTaskType } from './fixtures/noteTaskType';
import { createClient, loginAdmin, trustDevice, type TestClient } from './helpers/client';
import { quickAdmin, quickLearner } from './helpers/fastUsers';
import { createTestRuntime, type TestRuntime } from './helpers/db';

const DAY = 86_400_000;
/** Noon in Kaliningrad (UTC+2) on 10 Nov 2026. */
const START = Date.parse('2026-11-10T10:00:00Z');

let runtime: TestRuntime;
let adminId: number;
let anya: number;
let borya: number;
let now: number;
let streak: StreakService;

beforeEach(async () => {
  runtime = await createTestRuntime();
  runtime.ctx.taskTypes.register(noteTaskType);
  adminId = await quickAdmin(runtime.ctx);
  anya = await quickLearner(runtime.ctx, 'Аня', '1111');
  borya = await quickLearner(runtime.ctx, 'Боря', '2222');
  now = START;
  streak = createStreakService(runtime.ctx.db, {
    settings: runtime.ctx.settings,
    ledger: runtime.ctx.ledger,
    clock: () => now,
  });
});

afterEach(async () => {
  await runtime.close();
});

/** Studies on `count` consecutive days starting today; returns the rewards paid. */
function studyDays(count: number, learnerId = anya) {
  const rewards = [];
  for (let i = 0; i < count; i += 1) {
    rewards.push(streak.recordDay(learnerId).reward);
    now += DAY;
  }
  now -= DAY; // stay on the last studied day
  return rewards;
}

const streakRows = (): number =>
  (runtime.ctx.db.$client.prepare('SELECT count(*) AS n FROM streak_days').get() as { n: number })
    .n;

describe('recording days', () => {
  it('counts a day once; the database refuses a second row for the same day', () => {
    expect(streak.recordDay(anya)).toMatchObject({ dayKey: '2026-11-10', created: true });
    now += 3 * 60 * 60 * 1000;
    expect(streak.recordDay(anya)).toMatchObject({ dayKey: '2026-11-10', created: false });
    expect(streakRows()).toBe(1);
    expect(() =>
      runtime.ctx.db.$client
        .prepare("INSERT INTO streak_days (learner_id, day_key, at) VALUES (?, '2026-11-10', 0)")
        .run(anya),
    ).toThrow(/UNIQUE/);
    expect(streak.view(anya)).toMatchObject({ current: 1, todayDone: true, days: ['2026-11-10'] });
  });

  it('uses the installation time zone for the day', () => {
    now = Date.parse('2026-11-14T22:30:00Z'); // already 15 Nov in Kaliningrad
    expect(streak.recordDay(anya).dayKey).toBe('2026-11-15');
    runtime.ctx.settings.set('timezone', 'UTC', adminId);
    now += 60_000;
    expect(streak.recordDay(anya).dayKey).toBe('2026-11-14');
  });

  it('an admin closure counts as a study day', () => {
    const subjectId = runtime.ctx.subjects.findByKey('math')?.id ?? null;
    const taskId = runtime.ctx.tasks.create(
      { type: NOTE_TYPE, title: 'Урок', subjectId, config: READY_NOTE },
      adminId,
    ).id;
    runtime.ctx.tasks.update(taskId, { status: 'published' }, adminId);
    runtime.ctx.progress.close(anya, taskId, { withReward: false }, adminId);
    expect(runtime.ctx.streak.view(anya)).toMatchObject({ current: 1, todayDone: true });
  });
});

describe('streak and bonus', () => {
  it('pays the bonus on every full cycle, keyed by its first day', () => {
    const rewards = studyDays(10);
    const paid = rewards.filter((r) => r.xp > 0 || r.coins > 0);
    expect(paid).toEqual([
      { xp: 200, coins: 200 },
      { xp: 200, coins: 200 },
    ]);
    expect(rewards[4]).toEqual({ xp: 200, coins: 200 });
    expect(rewards[9]).toEqual({ xp: 200, coins: 200 });
    expect(runtime.ctx.ledger.balance(anya)).toEqual({ xp: 400, coins: 400 });
    const entries = runtime.ctx.ledger.list(anya, { type: 'streak' }).items;
    expect(entries.map((e) => e.sourceId).sort()).toEqual(['2026-11-10', '2026-11-15']);

    // Recording the 10th day again pays nothing more.
    expect(streak.recordDay(anya).reward).toEqual({ xp: 0, coins: 0 });
    expect(streak.view(anya)).toMatchObject({
      current: 10,
      best: 10,
      cycleProgress: 5,
      nextRewardAt: 15,
    });
  });

  it('a missed day breaks the run; yesterday still counts until today ends', () => {
    studyDays(2); // 10, 11
    now += 2 * DAY; // 13: the 12th was missed
    streak.recordDay(anya);
    expect(streak.view(anya)).toMatchObject({ current: 1, best: 2, days: ['2026-11-13'] });
    now += DAY; // 14, not studied yet
    expect(streak.view(anya)).toMatchObject({ current: 1, todayDone: false, nextRewardAt: 5 });
    now += DAY; // 15
    expect(streak.view(anya)).toMatchObject({ current: 0, cycleProgress: 0, days: [] });
    expect(runtime.ctx.ledger.balance(anya).coins).toBe(0);
  });

  it('follows the cycle length and bonus from settings', () => {
    runtime.ctx.settings.set('streak.days', 3, adminId);
    runtime.ctx.settings.set('streak.rewardCoins', 50, adminId);
    const rewards = studyDays(3);
    expect(rewards[2]).toEqual({ xp: 200, coins: 50 });
  });

  it('a full reset starts the streak over without deleting the days', () => {
    // Days in the past (the real clock is "today" for the reset below).
    now = Date.now() - 3 * DAY;
    studyDays(3);
    now += DAY;
    expect(streak.view(anya).current).toBe(3);

    runtime.ctx.progress.reset(anya, { requestId: 'reset-0000001' }, adminId);
    expect(streak.view(anya)).toMatchObject({ current: 0, best: 0 });
    expect(streakRows()).toBe(3);
    streak.recordDay(anya);
    expect(streak.view(anya).current).toBe(1);

    // A reset of a single task does not touch the streak.
    const subjectId = runtime.ctx.subjects.findByKey('math')?.id ?? null;
    const taskId = runtime.ctx.tasks.create(
      { type: NOTE_TYPE, title: 'Урок', subjectId, config: READY_NOTE },
      adminId,
    ).id;
    runtime.ctx.progress.reset(anya, { taskId, requestId: 'reset-0000002' }, adminId);
    expect(streak.view(anya).current).toBe(1);
  });
});

describe('GET /api/me/streak', () => {
  async function learnerClient(userId: number, pin: string): Promise<TestClient> {
    const tablet = createClient(createApp(runtime.ctx).app);
    await loginAdmin(tablet);
    await trustDevice(tablet);
    const res = await tablet.post('/api/auth/learner-login', { userId, pin });
    expect(res.status).toBe(200);
    return tablet;
  }

  it('shows the caller’s own streak and writes nothing', async () => {
    runtime.ctx.streak.recordDay(anya);
    const a = await learnerClient(anya, '1111');
    const b = await learnerClient(borya, '2222');
    const changes = () =>
      (runtime.ctx.db.$client.prepare('SELECT total_changes() AS n').get() as { n: number }).n;
    const before = changes();
    const mine = (await (await a.get('/api/me/streak')).json()) as StreakDto;
    const theirs = (await (await b.get('/api/me/streak')).json()) as StreakDto;
    expect(changes()).toBe(before);
    expect(mine).toMatchObject({
      current: 1,
      todayDone: true,
      cycleDays: 5,
      cycleProgress: 1,
      nextRewardAt: 5,
      reward: { xp: 200, coins: 200 },
    });
    expect(theirs).toMatchObject({ current: 0, best: 0, days: [] });

    const admin = createClient(createApp(runtime.ctx).app);
    await loginAdmin(admin);
    const viaAdmin = (await (
      await admin.get(`/api/admin/learners/${anya}/streak`)
    ).json()) as StreakDto;
    expect(viaAdmin).toEqual(mine);
    expect((await admin.get(`/api/admin/learners/${adminId}/streak`)).status).toBe(404);
  });
});
