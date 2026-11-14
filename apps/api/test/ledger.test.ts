import type { LedgerPageDto, WalletDto } from '@questclass/shared/economy/dto';
import { levelProgress } from '@questclass/shared/economy/level';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { HttpError } from '../src/http/errors';
import { idemKey, requestKey, type LedgerService } from '../src/modules/ledger/service';
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
let ledger: LedgerService;
let adminId: number;
let anya: number;
let borya: number;

beforeEach(async () => {
  runtime = await createTestRuntime();
  ledger = runtime.ctx.ledger;
  adminId = await quickAdmin(runtime.ctx);
  anya = await quickLearner(runtime.ctx, 'Аня', '1111');
  borya = await quickLearner(runtime.ctx, 'Боря', '2222');
});

afterEach(async () => {
  await runtime.close();
});

const award = (learnerId: number, requestId: string, coins: number, xp = 0) =>
  ledger.post({
    learnerId,
    xp,
    coins,
    sourceType: 'award',
    idemKey: requestKey('award', learnerId, requestId),
    createdBy: adminId,
  });

const rowCount = (): number =>
  (runtime.ctx.db.$client.prepare('SELECT count(*) AS n FROM ledger').get() as { n: number }).n;

/** Rejects with an HttpError of the given status and code. */
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

describe('post()', () => {
  it('is idempotent by key: a retry returns the first row and writes nothing', () => {
    const first = award(anya, 'req-00000001', 50, 10);
    const retry = award(anya, 'req-00000001', 999, 999);
    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(retry.entry).toEqual(first.entry);
    expect(rowCount()).toBe(1);
    expect(ledger.balance(anya)).toEqual({ xp: 10, coins: 50 });
  });

  it('builds keys on the server: the client requestId is only the last part', () => {
    expect(String(requestKey('award', anya, 'req-00000001'))).toBe(`award:${anya}:req-00000001`);
    // The same requestId from two learners or for two sources are different intents.
    award(anya, 'same-request-id', 10);
    award(borya, 'same-request-id', 20);
    ledger.post({
      learnerId: anya,
      coins: -5,
      sourceType: 'purchase',
      idemKey: requestKey('purchase', anya, 'same-request-id'),
    });
    expect(rowCount()).toBe(3);
    expect(ledger.balance(anya).coins).toBe(5);
    expect(ledger.balance(borya).coins).toBe(20);
  });

  it('refuses request ids that could forge another key', () => {
    ledger.post({
      learnerId: anya,
      xp: 100,
      coins: 350,
      sourceType: 'task',
      sourceId: 7,
      idemKey: idemKey('task', 7, 'learner', anya, 'pass'),
    });
    for (const forged of [`x:task:7:learner:${anya}:pass`, 'short', '../../etc', 'a b c d e f']) {
      expectHttpError(() => requestKey('award', anya, forged), 400, 'validation_failed');
    }
    expect(() => idemKey('task', 'a:b')).toThrow();
    expect(() => idemKey('task')).toThrow();
    expect(rowCount()).toBe(1);
  });

  it('rejects a key reused for another learner or source', () => {
    const key = idemKey('task', 7, 'learner', anya, 'pass');
    ledger.post({ learnerId: anya, xp: 10, sourceType: 'task', sourceId: 7, idemKey: key });
    expectHttpError(
      () =>
        ledger.post({ learnerId: borya, xp: 10, sourceType: 'task', sourceId: 7, idemKey: key }),
      409,
      'idempotency_conflict',
    );
    expectHttpError(
      () => ledger.post({ learnerId: anya, xp: 10, sourceType: 'task', sourceId: 8, idemKey: key }),
      409,
      'idempotency_conflict',
    );
    expect(rowCount()).toBe(1);
  });

  it('sums net amounts per source (reversals included) and reports history', () => {
    const key = idemKey('task', 7, 'learner', anya, 'pass');
    const paid = ledger.post({
      learnerId: anya,
      xp: 66,
      coins: 233,
      sourceType: 'task',
      sourceId: 7,
      idemKey: key,
    });
    ledger.post({
      learnerId: anya,
      xp: 34,
      coins: 117,
      sourceType: 'task',
      sourceId: 7,
      idemKey: idemKey('task', 7, 'learner', anya, 'topup', 1),
    });
    expect(ledger.sourceTotals(anya, 'task', 7)).toEqual({ xp: 100, coins: 350 });
    expect(ledger.sourceTotals(borya, 'task', 7)).toEqual({ xp: 0, coins: 0 });
    ledger.reverse(paid.entry.id, { createdBy: adminId });
    expect(ledger.sourceTotals(anya, 'task', 7)).toEqual({ xp: 34, coins: 117 });
    expect(ledger.hasSource('task', 7)).toBe(true);
    expect(ledger.hasSource('task', 8)).toBe(false);
  });
});

describe('reverse()', () => {
  it('appends a compensating row once; the second attempt is 409', () => {
    const original = award(anya, 'req-00000001', 50, 10).entry;
    const reversal = ledger.reverse(original.id, { createdBy: adminId, note: 'ошибка' }).entry;
    expect(reversal).toMatchObject({
      xp: -10,
      coins: -50,
      sourceType: 'award',
      reversesId: original.id,
      createdBy: adminId,
      note: 'ошибка',
    });
    expect(ledger.balance(anya)).toEqual({ xp: 0, coins: 0 });
    expectHttpError(
      () => ledger.reverse(original.id, { createdBy: adminId }),
      409,
      'already_reversed',
    );
    expectHttpError(
      () => ledger.reverse(reversal.id, { createdBy: adminId }),
      409,
      'cannot_reverse_reversal',
    );
    expect(rowCount()).toBe(2);

    const listed = ledger.list(anya).items;
    expect(listed.find((e) => e.id === original.id)?.reversedById).toBe(reversal.id);
  });

  it('may take the balance below zero', () => {
    const earned = award(anya, 'req-00000001', 100).entry;
    ledger.spend({
      learnerId: anya,
      price: 80,
      sourceType: 'purchase',
      idemKey: requestKey('purchase', anya, 'buy-00000001'),
    });
    ledger.reverse(earned.id, { createdBy: adminId });
    expect(ledger.balance(anya).coins).toBe(-80);
  });

  it('is 404 for an unknown row or a row of another learner', () => {
    const entry = award(anya, 'req-00000001', 10).entry;
    expectHttpError(() => ledger.reverse(entry.id + 100, { createdBy: adminId }), 404, 'not_found');
    expectHttpError(
      () => ledger.reverse(entry.id, { createdBy: adminId, learnerId: borya }),
      404,
      'not_found',
    );
    expect(rowCount()).toBe(1);
  });
});

describe('spend()', () => {
  const buy = (price: number, requestId: string) =>
    ledger.spend({
      learnerId: anya,
      price,
      sourceType: 'purchase',
      sourceId: 'item-1',
      idemKey: requestKey('purchase', anya, requestId),
    });

  it('refuses to spend more than the balance', () => {
    award(anya, 'req-00000001', 100);
    try {
      buy(120, 'buy-00000001');
      throw new Error('expected insufficient_coins');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).code).toBe('insufficient_coins');
      expect((err as HttpError).details).toEqual({ balance: 100, price: 120, missing: 20 });
    }
    expect(buy(100, 'buy-00000002').entry.coins).toBe(-100);
    expect(ledger.balance(anya).coins).toBe(0);
  });

  it('a negative balance blocks every purchase, even a free one', () => {
    const earned = award(anya, 'req-00000001', 50).entry;
    buy(40, 'buy-00000001');
    ledger.reverse(earned.id, { createdBy: adminId });
    expect(ledger.balance(anya).coins).toBe(-40);
    expectHttpError(() => buy(0, 'buy-00000002'), 409, 'insufficient_coins');
    expectHttpError(() => buy(10, 'buy-00000003'), 409, 'insufficient_coins');
  });

  it('a retried purchase returns the first row even when coins ran out since', () => {
    award(anya, 'req-00000001', 40);
    const first = buy(40, 'buy-00000001');
    const retry = buy(40, 'buy-00000001');
    expect(retry.created).toBe(false);
    expect(retry.entry.id).toBe(first.entry.id);
    expect(ledger.balance(anya).coins).toBe(0);
  });
});

describe('wallet and level', () => {
  it('derives level from XP with economy.xpPerLevel', () => {
    expect(levelProgress(0, 300)).toEqual({ level: 1, levelXp: 0, xpToNext: 300 });
    expect(levelProgress(299, 300)).toEqual({ level: 1, levelXp: 299, xpToNext: 1 });
    expect(levelProgress(300, 300)).toEqual({ level: 2, levelXp: 0, xpToNext: 300 });
    expect(levelProgress(-50, 300)).toEqual({ level: 1, levelXp: 0, xpToNext: 300 });

    award(anya, 'req-00000001', 350, 650);
    expect(ledger.wallet(anya)).toEqual({
      xp: 650,
      coins: 350,
      level: 3,
      levelXp: 50,
      xpToNext: 250,
    });
    runtime.ctx.settings.set('economy.xpPerLevel', 100, adminId);
    expect(ledger.wallet(anya)).toMatchObject({ level: 7, levelXp: 50, xpToNext: 50 });
  });

  it('exposes the economy defaults as settings', () => {
    expect(runtime.ctx.settings.get('economy.xpPerLevel')).toBe(300);
    expect(runtime.ctx.settings.get('economy.defaultTaskXp')).toBe(100);
    expect(runtime.ctx.settings.get('economy.defaultTaskCoins')).toBe(350);
  });
});

describe('HTTP', () => {
  let admin: TestClient;

  async function learnerClient(userId: number, pin: string): Promise<TestClient> {
    const tablet = createClient(createApp(runtime.ctx).app);
    await loginAdmin(tablet);
    await trustDevice(tablet);
    const res = await tablet.post('/api/auth/learner-login', { userId, pin });
    expect(res.status).toBe(200);
    return tablet;
  }

  beforeEach(async () => {
    admin = createClient(createApp(runtime.ctx).app);
    await loginAdmin(admin);
  });

  it('GET /api/me/wallet shows only the caller’s balance and writes nothing', async () => {
    award(anya, 'req-00000001', 350, 100);
    award(borya, 'req-00000002', 5, 1);
    const a = await learnerClient(anya, '1111');
    const b = await learnerClient(borya, '2222');

    const changes = () =>
      (runtime.ctx.db.$client.prepare('SELECT total_changes() AS n').get() as { n: number }).n;
    const before = changes();
    const walletA = (await (await a.get('/api/me/wallet')).json()) as WalletDto;
    const walletB = (await (await b.get('/api/me/wallet')).json()) as WalletDto;
    expect(changes()).toBe(before);

    expect(walletA).toEqual({ xp: 100, coins: 350, level: 1, levelXp: 100, xpToNext: 200 });
    expect(walletB).toMatchObject({ xp: 1, coins: 5 });
    expect((await admin.get('/api/me/wallet')).status).toBe(403);
  });

  it('GET /api/me/ledger pages newest first and never shows another learner’s rows', async () => {
    for (let i = 1; i <= 5; i += 1) {
      ledger.post({
        learnerId: anya,
        coins: i,
        sourceType: 'award',
        idemKey: requestKey('award', anya, `req-0000000${i}`),
        at: Date.UTC(2026, 10, i),
      });
    }
    award(borya, 'req-00000009', 77);
    const a = await learnerClient(anya, '1111');

    const first = (await (await a.get('/api/me/ledger?limit=2')).json()) as LedgerPageDto;
    expect(first.items.map((e) => e.coins)).toEqual([5, 4]);
    expect(first.nextCursor).not.toBeNull();
    const second = (await (
      await a.get(`/api/me/ledger?limit=2&cursor=${first.nextCursor}`)
    ).json()) as LedgerPageDto;
    expect(second.items.map((e) => e.coins)).toEqual([3, 2]);
    const third = (await (
      await a.get(`/api/me/ledger?limit=2&cursor=${second.nextCursor}`)
    ).json()) as LedgerPageDto;
    expect(third.items.map((e) => e.coins)).toEqual([1]);
    expect(third.nextCursor).toBeNull();

    const b = await learnerClient(borya, '2222');
    const bPage = (await (await b.get('/api/me/ledger')).json()) as LedgerPageDto;
    expect(bPage.items.map((e) => e.coins)).toEqual([77]);
  });

  it('GET /api/admin/learners/:id/ledger filters by type and period', async () => {
    award(anya, 'req-00000001', 100);
    ledger.post({
      learnerId: anya,
      xp: 200,
      coins: 200,
      sourceType: 'streak',
      idemKey: idemKey('streak', anya, '2026-11-10'),
      at: Date.parse('2026-11-10T10:00:00Z'),
    });
    ledger.spend({
      learnerId: anya,
      price: 40,
      sourceType: 'purchase',
      idemKey: requestKey('purchase', anya, 'buy-00000001'),
    });

    const all = (await (
      await admin.get(`/api/admin/learners/${anya}/ledger`)
    ).json()) as LedgerPageDto;
    expect(all.items).toHaveLength(3);

    const purchases = (await (
      await admin.get(`/api/admin/learners/${anya}/ledger?type=purchase`)
    ).json()) as LedgerPageDto;
    expect(purchases.items.map((e) => e.coins)).toEqual([-40]);

    const period = (await (
      await admin.get(
        `/api/admin/learners/${anya}/ledger?from=2026-11-10T00:00:00Z&to=2026-11-11T00:00:00Z`,
      )
    ).json()) as LedgerPageDto;
    expect(period.items.map((e) => e.sourceType)).toEqual(['streak']);

    expect((await admin.get(`/api/admin/learners/${anya}/ledger?type=bogus`)).status).toBe(400);
    const unknown = await admin.get(`/api/admin/learners/${anya + 100}/ledger`);
    expect(unknown.status).toBe(404);
    expect(await errorCode(unknown)).toBe('not_found');
    // An admin account is not a learner.
    expect((await admin.get(`/api/admin/learners/${adminId}/ledger`)).status).toBe(404);
  });
});
