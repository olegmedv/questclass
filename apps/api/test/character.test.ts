import type { CatalogItemDto } from '@questclass/shared/catalog/dto';
import type { CharacterDto } from '@questclass/shared/character/dto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { requestKey } from '../src/modules/ledger/service';
import {
  createClient,
  errorCode,
  loginAdmin,
  trustDevice,
  type RequestOptions,
  type TestClient,
} from './helpers/client';
import { quickAdmin, quickLearner } from './helpers/fastUsers';
import { createTestRuntime, type TestRuntime } from './helpers/db';

let runtime: TestRuntime;
let adminId: number;
let anya: number;
let borya: number;
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
  anyaClient = await learnerClient(anya, '1111');
  runtime.ctx.ledger.post({
    learnerId: anya,
    coins: 10_000,
    sourceType: 'award',
    idemKey: requestKey('award', anya, 'hero-gift-0001'),
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
const buy = (seedKey: string, learnerId = anya) => {
  const target = item(seedKey);
  counter += 1;
  return runtime.ctx.shop.purchase(learnerId, {
    itemId: target.id,
    version: target.version,
    requestId: `hero-buy-${String(counter).padStart(6, '0')}`,
  });
};
const put = (client: TestClient, part: string, json: unknown) =>
  client.request('PUT', `/api/me/character/${part}`, { json } satisfies RequestOptions);
const view = async (client = anyaClient): Promise<CharacterDto> =>
  (await (await client.get('/api/me/character')).json()) as CharacterDto;
const changes = () =>
  (runtime.ctx.db.$client.prepare('SELECT total_changes() AS n').get() as { n: number }).n;
const characterRow = (learnerId: number) =>
  runtime.ctx.db.$client
    .prepare('SELECT name, look_item_id, room_item_id FROM learner_characters WHERE learner_id = ?')
    .get(learnerId);

describe('GET /api/me/character', () => {
  it('starts with the starters of the catalog and writes nothing', async () => {
    const before = changes();
    const hero = await view();
    expect(changes()).toBe(before);
    expect(characterRow(anya)).toBeUndefined();
    expect(hero).toMatchObject({
      name: '',
      look: { itemId: item('blue').id, purchaseId: null, title: 'Синий исследователь' },
      room: { itemId: item('room-default').id, title: 'Уютная примерочная' },
    });
    expect(hero.looks.map((l) => l.title)).toEqual([
      'Синий исследователь',
      'Фиолетовый исследователь',
    ]);
    expect(hero.look?.hero).toMatchObject({
      image: '/assets/game/fitting-room/blue-original.webp',
      footOffset: 4.4,
    });
    expect(hero.room?.room).toMatchObject({ footAnchor: { x: 50, y: 75 }, scene: 'static' });
  });

  it('the starters come from the flag, not from ids in code', async () => {
    runtime.ctx.db.$client
      .prepare("UPDATE catalog_items SET starter = 1 WHERE seed_key = 'forest'")
      .run();
    expect((await view()).looks.map((l) => l.itemId)).toContain(item('forest').id);
  });

  it('shows the first owned look when the worn one is no longer owned, without writing', async () => {
    expect((await put(anyaClient, 'look', { itemId: item('purple').id })).status).toBe(200);
    runtime.ctx.db.$client
      .prepare("UPDATE catalog_items SET starter = 0 WHERE seed_key = 'purple'")
      .run();
    const before = changes();
    const hero = await view();
    expect(hero.look?.itemId).toBe(item('blue').id);
    expect(changes()).toBe(before);
    expect(characterRow(anya)).toMatchObject({ look_item_id: item('purple').id });
  });
});

describe('PUT look | room | name', () => {
  it('wears what the learner owns, as bought', async () => {
    buy('space');
    buy('room-dracula');
    buy('action-hero-punch');
    const space = item('space');
    runtime.ctx.catalog.update(space.id, { title: 'Космонавт 2.0' }, adminId);

    const look = await put(anyaClient, 'look', { itemId: space.id });
    expect(look.status).toBe(200);
    expect(((await look.json()) as CharacterDto).look).toMatchObject({
      itemId: space.id,
      title: 'Космонавт',
      hero: { characterKey: 'space' },
    });
    const room = await put(anyaClient, 'room', { itemId: item('room-dracula').id });
    expect(((await room.json()) as CharacterDto).room).toMatchObject({
      title: 'Замок Дракулы',
      room: { scene: 'ambient:embers' },
      animated: true,
    });
    const hero = await view();
    expect(hero.looks.map((l) => l.title)).toEqual([
      'Синий исследователь',
      'Фиолетовый исследователь',
      'Космонавт',
      'Супергерой · удар',
    ]);
    expect(hero.looks.at(-1)).toMatchObject({ animated: true, animation: { key: 'hero-punch' } });
    expect(characterRow(anya)).toMatchObject({
      look_item_id: space.id,
      room_item_id: item('room-dracula').id,
    });
  });

  it('refuses what is not owned with 403', async () => {
    buy('space', anya);
    const boryaClient = await learnerClient(borya, '2222');
    const cases: [TestClient, string, number, string][] = [
      [anyaClient, 'look', item('forest').id, 'Сначала открой этот скин в магазине'],
      [anyaClient, 'room', item('room-dracula').id, 'Сначала открой этот фон в магазине'],
      [anyaClient, 'look', item('room-default').id, 'Сначала открой этот скин в магазине'],
      [anyaClient, 'room', 99_999, 'Сначала открой этот фон в магазине'],
      // Another learner's purchase is not theirs.
      [boryaClient, 'look', item('space').id, 'Сначала открой этот скин в магазине'],
    ];
    for (const [client, part, itemId, message] of cases) {
      const res = await put(client, part, { itemId });
      expect(res.status, `${part} ${itemId}`).toBe(403);
      expect(((await res.json()) as { error: unknown }).error).toEqual({
        code: 'not_owned',
        message,
      });
    }
    expect(characterRow(anya)).toBeUndefined();
    expect(characterRow(borya)).toBeUndefined();
  });

  it('names the hero: 1–30 characters', async () => {
    const res = await put(anyaClient, 'name', { name: '  Дан   Великий ' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as CharacterDto).name).toBe('Дан Великий');
    expect((await put(anyaClient, 'name', { name: '   ' })).status).toBe(400);
    expect((await put(anyaClient, 'name', { name: 'я'.repeat(31) })).status).toBe(400);
    expect((await put(anyaClient, 'name', { name: 'я'.repeat(30) })).status).toBe(200);
    const res2 = await put(anyaClient, 'name', { name: 7 });
    expect(await errorCode(res2)).toBe('validation_failed');
    // Changing the name keeps the worn look.
    expect((await view()).look?.itemId).toBe(item('blue').id);
    expect((await view(await learnerClient(borya, '2222'))).name).toBe('');
  });
});
