import type { CatalogItemDto } from '@questclass/shared/catalog/dto';
import type { PurchaseOutcomeDto, ShopDto } from '@questclass/shared/shop/dto';
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
});

afterEach(async () => {
  await runtime.close();
});

let grants = 0;
function give(learnerId: number, coins: number): void {
  grants += 1;
  runtime.ctx.ledger.post({
    learnerId,
    coins,
    sourceType: 'award',
    idemKey: requestKey('award', learnerId, `gift-${String(grants).padStart(8, '0')}`),
  });
}

const item = (seedKey: string): CatalogItemDto => {
  const found = runtime.ctx.catalog.items().find((i) => i.seedKey === seedKey);
  if (!found) throw new Error(`No item ${seedKey}`);
  return found;
};
let requests = 0;
const nextRequest = () => `buy-request-${String((requests += 1)).padStart(6, '0')}`;
const buy = (target: CatalogItemDto, requestId = nextRequest(), client = anyaClient) =>
  client.post('/api/shop/purchases', { itemId: target.id, version: target.version, requestId });
const shop = async (client = anyaClient): Promise<ShopDto> =>
  (await (await client.get('/api/shop')).json()) as ShopDto;
const rows = (table: string): number =>
  (runtime.ctx.db.$client.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('purchases', () => {
  it('takes a snapshot and the coins in one go, keyed purchase:<learner>:<requestId>', async () => {
    give(anya, 100);
    const space = item('space');
    const requestId = nextRequest();
    const res = await buy(space, requestId);
    expect(res.status).toBe(201);
    const outcome = (await res.json()) as PurchaseOutcomeDto;
    expect(outcome.coins).toBe(60);
    expect(outcome.purchase).toMatchObject({
      itemId: space.id,
      itemVersion: 1,
      kind: 'outfit',
      title: 'Космонавт',
      price: 40,
      hero: { characterKey: 'space', image: '/assets/game/fitting-room/space-original.webp' },
    });
    const entry = runtime.ctx.db.$client
      .prepare("SELECT idem_key, source_id, coins FROM ledger WHERE source_type = 'purchase'")
      .get();
    expect(entry).toEqual({
      idem_key: requestKey('purchase', anya, requestId),
      source_id: String(outcome.purchase.id),
      coins: -40,
    });

    // A retry is the same purchase; the same request id for another item is refused.
    const again = await buy(space, requestId);
    expect(again.status).toBe(200);
    expect(((await again.json()) as PurchaseOutcomeDto).purchase.id).toBe(outcome.purchase.id);
    const other = await buy(item('forest'), requestId);
    expect(other.status).toBe(409);
    expect(await errorCode(other)).toBe('request_conflict');
    expect(runtime.ctx.ledger.balance(anya).coins).toBe(60);
    expect(rows('purchases')).toBe(1);
  });

  it('a purchase stays as bought when the admin edits the item', async () => {
    give(anya, 100);
    const pizza = item('pizza');
    await buy(pizza);
    await admin.patch(`/api/admin/catalog/items/${pizza.id}`, {
      title: 'Пицца 2',
      price: 99,
      description: 'Новое',
    });
    expect(runtime.ctx.shop.purchases(anya)[0]).toMatchObject({
      title: 'Пицца',
      price: 40,
      itemVersion: 1,
      hero: { characterKey: 'pizza', sprite: { col: 0, row: 0 } },
    });
    // The bought item's kind cannot change any more.
    const res = await admin.patch(`/api/admin/catalog/items/${pizza.id}`, {
      kind: 'room',
      characterKey: null,
      roomKey: 'room-star-studio',
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('kind_locked');
  });

  it('refuses stale versions, inactive and starter items, and missing coins', async () => {
    give(anya, 50);
    const seek = item('seek');
    await admin.patch(`/api/admin/catalog/items/${seek.id}`, { price: 45 });
    const stale = await buy(seek);
    expect(stale.status).toBe(409);
    expect(await errorCode(stale)).toBe('item_changed');

    const cases: [CatalogItemDto | { id: number; version: number }, string][] = [
      [item('fries'), 'item_unavailable'], // switched off
      [item('blue'), 'item_unavailable'], // starter
      [{ id: 99_999, version: 1 }, 'item_unavailable'],
      [item('room-night-hotel-v1'), 'insufficient_coins'], // 200 > 50
    ];
    for (const [target, code] of cases) {
      const res = await anyaClient.post('/api/shop/purchases', {
        itemId: target.id,
        version: target.version,
        requestId: nextRequest(),
      });
      expect(res.status, code).toBe(409);
      expect(await errorCode(res)).toBe(code);
    }
    expect(rows('purchases')).toBe(0);
    expect(runtime.ctx.ledger.balance(anya).coins).toBe(50);
  });

  it('a negative balance blocks every purchase', async () => {
    give(anya, 100);
    const entry = runtime.ctx.ledger.list(anya).items[0];
    runtime.ctx.ledger.spend({
      learnerId: anya,
      price: 60,
      sourceType: 'purchase',
      idemKey: requestKey('purchase', anya, 'outside-0001'),
    });
    runtime.ctx.ledger.reverse(entry?.id ?? 0, { createdBy: adminId }); // -60 now
    const free = await admin.post('/api/admin/catalog/items', {
      kind: 'outfit',
      title: 'Бесплатный',
      price: 0,
      characterKey: 'zombie-boy',
      animationKey: 'boy-fairy',
    });
    const res = await buy((await free.json()) as CatalogItemDto);
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('insufficient_coins');
    const view = await shop();
    expect(view.coins).toBe(-60);
    expect(view.items.find((i) => i.title === 'Бесплатный')).toMatchObject({
      affordable: false,
      missingCoins: 60,
    });
  });

  it('a hero or room is owned once, also as a look-alike or a starter; tickets any number of times', async () => {
    give(anya, 1000);
    expect((await buy(item('space'))).status).toBe(201);
    expect((await buy(item('room-dracula'))).status).toBe(201);
    const twin = async (body: Record<string, unknown>) =>
      (await (
        await admin.post('/api/admin/catalog/items', { price: 10, title: 'Двойник', ...body })
      ).json()) as CatalogItemDto;
    const cases: [CatalogItemDto, string][] = [
      [
        await twin({ kind: 'outfit', characterKey: 'space' }),
        'Этот образ уже есть в твоём гардеробе',
      ],
      [
        await twin({ kind: 'outfit', characterKey: 'blue' }),
        'Этот образ уже есть в твоём гардеробе',
      ],
      [await twin({ kind: 'room', roomKey: 'room-dracula' }), 'Эта комната уже у тебя есть'],
      [await twin({ kind: 'room', roomKey: 'room-default' }), 'Эта комната уже у тебя есть'],
    ];
    for (const [target, message] of cases) {
      const res = await buy(target);
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: { code: string; message: string } }).error).toEqual({
        code: 'already_owned',
        message,
      });
    }
    // The same picture with an animation is another thing (a live hero).
    expect(
      (await buy(await twin({ kind: 'outfit', characterKey: 'space', animationKey: 'hero-hair' })))
        .status,
    ).toBe(201);

    const tokens = item('tokens');
    expect((await buy(tokens)).status).toBe(201);
    expect((await buy(tokens)).status).toBe(201);
    expect(runtime.ctx.shop.purchases(anya).filter((p) => p.kind === 'ticket')).toHaveLength(2);
    expect(runtime.ctx.ledger.balance(anya).coins).toBe(1000 - 40 - 200 - 10 - 600);
  });
});

describe('GET /api/shop', () => {
  it('hides what the learner owns, keeps tickets, puts live items first, flags affordability', async () => {
    give(anya, 100);
    const before = await shop();
    expect(before.coins).toBe(100);
    expect(before.items.some((i) => i.starter)).toBe(false);
    expect(before.items.some((i) => i.seedKey === 'fries')).toBe(false);
    const firstStatic = before.items.findIndex((i) => !i.animated);
    expect(firstStatic).toBeGreaterThan(0);
    expect(before.items.slice(firstStatic).every((i) => !i.animated)).toBe(true);
    expect(before.items.find((i) => i.seedKey === 'space')).toMatchObject({
      affordable: true,
      missingCoins: 0,
    });
    expect(before.items.find((i) => i.seedKey === 'room-night-hotel-v1')).toMatchObject({
      affordable: false,
      missingCoins: 100,
    });

    await buy(item('space'));
    // 60 coins left: the 300 Robux ticket is not affordable.
    expect((await buy(item('tokens'))).status).toBe(409);
    const after = await shop();
    expect(after.items.some((i) => i.seedKey === 'space')).toBe(false);
    expect(after.items.some((i) => i.seedKey === 'tokens')).toBe(true);
    expect(after.items).toHaveLength(before.items.length - 1);

    // Another learner's purchase changes nothing for this one.
    const boryaClient = await learnerClient(borya, '2222');
    const forB = await shop(boryaClient);
    expect(forB.items.some((i) => i.seedKey === 'space')).toBe(true);
    expect(forB.coins).toBe(0);

    // Reading the shop writes nothing.
    const changes = () =>
      (runtime.ctx.db.$client.prepare('SELECT total_changes() AS n').get() as { n: number }).n;
    const n = changes();
    await shop();
    expect(changes()).toBe(n);
  });
});
