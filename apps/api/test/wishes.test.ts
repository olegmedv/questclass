import type { CatalogItemDto } from '@questclass/shared/catalog/dto';
import type {
  LearnerWishesDto,
  ReceiptDto,
  WishGroupDto,
  WishesDto,
} from '@questclass/shared/wishes/dto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { requestKey } from '../src/modules/ledger/service';
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
let anyaClient: TestClient;

async function learnerClient(userId: number, pin: string): Promise<TestClient> {
  const tablet = createClient(createApp(runtime.ctx).app);
  await loginAdmin(tablet);
  await trustDevice(tablet);
  expect((await tablet.post('/api/auth/learner-login', { userId, pin })).status).toBe(200);
  return tablet;
}

beforeEach(async () => {
  runtime = await createTestRuntime();
  adminId = await quickAdmin(runtime.ctx);
  anya = await quickLearner(runtime.ctx, 'Аня', '1111');
  borya = await quickLearner(runtime.ctx, 'Боря', '2222');
  admin = createClient(createApp(runtime.ctx).app);
  await loginAdmin(admin);
  anyaClient = await learnerClient(anya, '1111');
  runtime.ctx.ledger.post({
    learnerId: anya,
    coins: 100_000,
    sourceType: 'award',
    idemKey: requestKey('award', anya, 'wishes-gift-01'),
  });
});

afterEach(async () => {
  await runtime.close();
});

const item = (seedKey: string): CatalogItemDto => {
  const found = runtime.ctx.catalog.items().find((i) => i.seedKey === seedKey);
  if (!found) throw new Error(`No item ${seedKey}`);
  return found;
};
let counter = 0;
const nextId = (prefix: string) => `${prefix}-${String((counter += 1)).padStart(8, '0')}`;
function buy(target: CatalogItemDto, learnerId = anya) {
  const current = runtime.ctx.catalog.item(target.id);
  return runtime.ctx.shop.purchase(learnerId, {
    itemId: current.id,
    version: current.version,
    requestId: nextId('buy'),
  }).outcome.purchase;
}
const wishes = async (client = anyaClient): Promise<WishesDto> =>
  (await (await client.get('/api/me/wishes')).json()) as WishesDto;
const group = (view: WishesDto, key: string): WishGroupDto | undefined =>
  view.groups.find((g) => g.groupKey === key);
const fulfill = (body: Record<string, unknown>, learnerId = anya) =>
  admin.post(`/api/admin/learners/${learnerId}/fulfillments`, {
    requestId: nextId('give'),
    ...body,
  });
const purchaseRows = () =>
  JSON.stringify(runtime.ctx.db.$client.prepare('SELECT * FROM purchases ORDER BY id').all());

function enable(seedKey: string): CatalogItemDto {
  return runtime.ctx.catalog.update(item(seedKey).id, { active: true }, adminId);
}

describe('groups', () => {
  it('sums all Robux into one group and groups wishes by item, title and description', async () => {
    const robux500 = runtime.ctx.catalog.create(
      {
        kind: 'ticket',
        title: '500 Robux',
        price: 500,
        imageKey: 'game/report-robux.svg',
        rewardType: 'robux',
        rewardAmount: 500,
      },
      adminId,
    );
    buy(item('tokens'));
    buy(item('tokens'));
    buy(robux500);
    const cinema = enable('cinema');
    buy(cinema);
    buy(cinema);
    const gift = enable('gift');
    buy(gift);

    const view = await wishes();
    expect(group(view, 'robux')).toMatchObject({
      rewardType: 'robux',
      title: 'Robux',
      remaining: 1100,
      status: 'ready',
    });
    const wishGroups = view.groups.filter((g) => g.rewardType === 'wish');
    expect(wishGroups.map((g) => [g.title, g.remaining])).toEqual([
      ['Семейный киновечер', 2],
      ['Сюрприз', 1],
    ]);
    expect(wishGroups[0]?.ticket).toMatchObject({ image: '/assets/game/wishes.webp' });

    // A renamed item starts a new group for new purchases.
    runtime.ctx.catalog.update(cinema.id, { title: 'Кино с попкорном' }, adminId);
    buy(cinema);
    const after = (await wishes()).groups.filter((g) => g.rewardType === 'wish');
    expect(after.map((g) => [g.title, g.remaining])).toEqual([
      ['Семейный киновечер', 2],
      ['Сюрприз', 1],
      ['Кино с попкорном', 1],
    ]);
    expect((await wishes(await learnerClient(borya, '2222'))).groups).toEqual([]);
  });
});

describe('requests', () => {
  it('«Хочу использовать» is one insert; a repeat while requested changes nothing', async () => {
    buy(item('tokens'));
    const first = await anyaClient.post('/api/me/wish-requests', { groupKey: 'robux' });
    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({ status: 'requested', remaining: 300 });
    const again = await anyaClient.post('/api/me/wish-requests', { groupKey: 'robux' });
    expect(again.status).toBe(200);
    const count = runtime.ctx.db.$client.prepare('SELECT count(*) AS n FROM wish_requests').get();
    expect(count).toEqual({ n: 1 });

    // Groups the learner does not have are not found; neither are malformed keys.
    const boryaClient = await learnerClient(borya, '2222');
    expect((await boryaClient.post('/api/me/wish-requests', { groupKey: 'robux' })).status).toBe(
      404,
    );
    expect(
      (await anyaClient.post('/api/me/wish-requests', { groupKey: 'wish:1:000000000000' })).status,
    ).toBe(404);
    expect((await anyaClient.post('/api/me/wish-requests', { groupKey: 'all' })).status).toBe(400);

    const open = (await (
      await admin.get('/api/admin/wishes?status=open')
    ).json()) as LearnerWishesDto[];
    expect(open).toEqual([
      {
        learnerId: anya,
        learnerName: 'Аня',
        groups: [expect.objectContaining({ groupKey: 'robux', status: 'requested' })],
      },
    ]);
  });
});

describe('handing out', () => {
  it('takes from the oldest purchases first, partly if needed; purchases never change', async () => {
    const p1 = buy(item('tokens'));
    const p2 = buy(item('tokens'));
    await anyaClient.post('/api/me/wish-requests', { groupKey: 'robux' });
    const before = purchaseRows();
    const coins = runtime.ctx.ledger.balance(anya).coins;

    const res = await fulfill({ groupKey: 'robux', amount: 400, expectedRemaining: 600 });
    expect(res.status).toBe(201);
    const receipt = (await res.json()) as ReceiptDto;
    expect(receipt).toMatchObject({ rewardType: 'robux', title: 'Robux', amount: 400 });
    expect(receipt.allocations).toEqual([
      { purchaseId: p1.id, amount: 300 },
      { purchaseId: p2.id, amount: 100 },
    ]);
    expect(purchaseRows()).toBe(before);
    // Coins are not given back.
    expect(runtime.ctx.ledger.balance(anya).coins).toBe(coins);
    // The request was answered; the rest waits for a new one.
    const view = await wishes();
    expect(group(view, 'robux')).toMatchObject({ remaining: 200, status: 'ready' });
    expect(view.history.items.map((r) => r.amount)).toEqual([400]);
    expect(runtime.ctx.audit.list({ action: 'wish.fulfilled' }).items[0]).toMatchObject({
      actorId: adminId,
      learnerId: anya,
    });

    const rest = await fulfill({ groupKey: 'robux', amount: 200, expectedRemaining: 200 });
    expect(((await rest.json()) as ReceiptDto).allocations).toEqual([
      { purchaseId: p2.id, amount: 200 },
    ]);
    expect(group(await wishes(), 'robux')).toBeUndefined();
  });

  it('is idempotent by requestId and checks the remaining amount the admin saw', async () => {
    buy(item('tokens'));
    const gift = enable('gift');
    buy(gift);
    const giftKey = (await wishes()).groups.find((g) => g.rewardType === 'wish')?.groupKey ?? '';

    const requestId = nextId('give');
    const first = await fulfill({
      groupKey: 'robux',
      amount: 100,
      expectedRemaining: 300,
      requestId,
    });
    expect(first.status).toBe(201);
    const repeat = await fulfill({
      groupKey: 'robux',
      amount: 100,
      expectedRemaining: 300,
      requestId,
    });
    expect(repeat.status).toBe(200);
    expect(((await repeat.json()) as ReceiptDto).id).toBe(((await first.json()) as ReceiptDto).id);
    const other = await fulfill({ groupKey: giftKey, amount: 1, expectedRemaining: 1, requestId });
    expect(other.status).toBe(409);
    expect(await errorCode(other)).toBe('request_conflict');

    const stale = await fulfill({ groupKey: 'robux', amount: 50, expectedRemaining: 300 });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      error: { code: 'remaining_changed', details: { remaining: 200 } },
    });
    const tooMuch = await fulfill({ groupKey: 'robux', amount: 201, expectedRemaining: 200 });
    expect(tooMuch.status).toBe(409);
    expect(await errorCode(tooMuch)).toBe('amount_exceeds_remaining');
    expect((await fulfill({ groupKey: giftKey, amount: 1, expectedRemaining: 1 })).status).toBe(
      201,
    );
    expect((await fulfill({ groupKey: giftKey, amount: 1, expectedRemaining: 0 })).status).toBe(
      404,
    );
    expect(
      (await fulfill({ groupKey: 'robux', amount: 1, expectedRemaining: 0 }, borya)).status,
    ).toBe(404);
    expect(
      (await fulfill({ groupKey: 'robux', amount: 1, expectedRemaining: 200 }, adminId)).status,
    ).toBe(404);
    expect(group(await wishes(), 'robux')?.remaining).toBe(200);
  });

  it('shows the history 20 at a time, newest first', async () => {
    buy(item('tokens'));
    for (let i = 0; i < 21; i += 1) {
      await fulfill({ groupKey: 'robux', amount: 1, expectedRemaining: 300 - i });
    }
    const page = await wishes();
    expect(page.history.items).toHaveLength(20);
    expect(page.history.nextCursor).not.toBeNull();
    const rest = (await (
      await anyaClient.get(`/api/me/wishes?cursor=${page.history.nextCursor ?? ''}`)
    ).json()) as WishesDto;
    expect(rest.history.items).toHaveLength(1);
    expect(rest.history.nextCursor).toBeNull();
    expect(page.history.items[0]?.id).toBeGreaterThan(rest.history.items[0]?.id ?? 0);
    const all = (await (
      await admin.get('/api/admin/wishes?status=remaining')
    ).json()) as LearnerWishesDto[];
    expect(all[0]?.groups[0]).toMatchObject({ groupKey: 'robux', remaining: 279, status: 'ready' });
    expect(await (await admin.get('/api/admin/wishes')).json()).toEqual([]);
  });
});
