import manifestJson from '@questclass/shared/assets/manifest.json';
import type {
  CatalogItemDto,
  CatalogLibraryDto,
  CatalogSeed,
} from '@questclass/shared/catalog/dto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import catalogJson from '../seed/catalog.json';
import { createApp } from '../src/app';
import { HttpError } from '../src/http/errors';
import { loadCatalogSeed, seedCatalog } from '../src/modules/catalog/seed';
import { createCatalogService, type UploadInfo } from '../src/modules/catalog/service';
import { createClient, errorCode, loginAdmin, type TestClient } from './helpers/client';
import { quickAdmin } from './helpers/fastUsers';
import { createTestRuntime, type TestRuntime } from './helpers/db';

const manifest = manifestJson as Record<string, { kind: string; w?: number; h?: number }>;

let runtime: TestRuntime;
let adminId: number;
let admin: TestClient;

beforeEach(async () => {
  runtime = await createTestRuntime();
  adminId = await quickAdmin(runtime.ctx);
  admin = createClient(createApp(runtime.ctx).app);
  await loginAdmin(admin);
});

afterEach(async () => {
  await runtime.close();
});

const items = () => runtime.ctx.catalog.items();
const bySeed = (seedKey: string): CatalogItemDto => {
  const found = items().find((i) => i.seedKey === seedKey);
  if (!found) {
    throw new Error(`No item ${seedKey}`);
  }
  return found;
};
const changes = () =>
  (runtime.ctx.db.$client.prepare('SELECT total_changes() AS n').get() as { n: number }).n;

/** Every string of the seed that names a file (pictures, animations, sounds). */
function assetPaths(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    if (/\.(webp|png|jpg|svg|ogg|mp3)$/.test(value)) {
      out.push(value);
    }
  } else if (Array.isArray(value)) {
    for (const v of value) assetPaths(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) assetPaths(v, out);
  }
  return out;
}

describe('seed', () => {
  it('every picture, animation and sound of catalog.json is in the asset manifest', () => {
    const paths = assetPaths(catalogJson);
    expect(paths.length).toBeGreaterThan(150);
    const missing = paths.filter((p) => !manifest[p]);
    expect(missing).toEqual([]);
    // Animated WebPs really are animated; posters and stills are not.
    for (const a of loadCatalogSeed().animations) {
      if (a.src !== undefined) {
        expect(manifest[a.src], a.key).toMatchObject({ animated: true });
      }
      expect(manifest[a.poster], a.key).toMatchObject({ animated: false });
    }
  });

  it('contains all heroes and packs, 9 action animations, all rooms and the tickets', () => {
    const lib = runtime.ctx.catalog.library();
    expect(lib.characters).toHaveLength(45);
    const heroAnimations = lib.animations.filter((a) => a.kind === 'hero');
    expect(heroAnimations).toHaveLength(20);
    expect(lib.animations.filter((a) => a.kind === 'room').map((a) => a.key)).toEqual([
      'astro-room-night',
    ]);
    const actions = [
      'hero-punch',
      'hero-hair',
      'claw-show',
      'fairy-swing',
      'fairy-magic',
      'vampire-juice',
      'vampire-bat',
      'vampire-awakening',
      'boy-fairy',
    ];
    for (const key of actions) {
      expect(bySeed(`action-${key}`)).toMatchObject({
        kind: 'outfit',
        animated: true,
        animation: { key },
      });
    }
    const packs = ['mart', 'cadence', 'dozer', 'rebound', 'astro'];
    for (const pack of packs) {
      expect(
        lib.characters.some((c) => c.key.startsWith(pack)),
        pack,
      ).toBe(true);
    }
    for (const live of ['vampire-live', 'fairy-live', 'seek-live', 'blue-live', 'astro-live']) {
      expect(bySeed(live).animated, live).toBe(true);
    }

    const all = items();
    const count = (kind: string) => all.filter((i) => i.kind === kind).length;
    expect({ outfit: count('outfit'), room: count('room'), ticket: count('ticket') }).toEqual({
      outfit: 53,
      room: 38,
      ticket: 4,
    });
    expect(lib.rooms).toHaveLength(38);
  });

  it('gives every room a scene: static, ambient themes, night hotel, Astro, Rebound', () => {
    const rooms = runtime.ctx.catalog.library().rooms;
    const scene = (key: string) => rooms.find((r) => r.key === key)?.scene;
    expect(scene('room-night-hotel-v1')).toBe('night-hotel');
    expect(scene('room-astro-night')).toBe('astro');
    expect(scene('room-rebound-hotel')).toBe('rebound');
    expect(scene('room-default')).toBe('static');
    const themes = new Set(
      rooms.filter((r) => r.scene.startsWith('ambient:')).map((r) => r.scene.slice(8)),
    );
    // The sixth theme (rebound) is part of the Rebound scene.
    expect([...themes, 'rebound'].sort()).toEqual(
      ['clock', 'embers', 'fairy', 'forest', 'rebound', 'water'].sort(),
    );
    expect(rooms.filter((r) => r.category === 'day').length).toBeGreaterThanOrEqual(10);
    const hotel = rooms.find((r) => r.key === 'room-night-hotel-v1');
    expect(Object.keys(hotel?.sceneAssets?.layers ?? {})).toHaveLength(10);
    expect(hotel?.sceneAssets?.audio?.events?.length).toBeGreaterThan(5);
    expect(rooms.find((r) => r.key === 'room-danya-day')?.footAnchor).toEqual({ x: 50, y: 79.5 });
    // Pictures are served from /assets.
    expect(hotel?.image).toBe('/assets/game/rooms/night-hotel/room_base.webp');
  });

  it('applies the default prices of spec/02 §2.5', () => {
    const sold = items().filter((i) => !i.starter);
    for (const item of sold.filter((i) => i.kind === 'outfit')) {
      expect(item.price, item.title).toBe(item.animated ? 80 : 40);
    }
    for (const item of sold.filter((i) => i.kind === 'room')) {
      expect(item.price, item.title).toBe(item.animated ? 200 : 120);
    }
    expect(bySeed('room-night-hotel-v1')).toMatchObject({ price: 200, animated: true });
    expect(bySeed('room-star-studio')).toMatchObject({ price: 120, animated: false });
    expect(bySeed('tokens')).toMatchObject({
      title: '300 Robux',
      price: 300,
      rewardType: 'robux',
      rewardAmount: 300,
    });
    expect(bySeed('fries')).toMatchObject({
      title: 'Картошка и наггетсы из Додо',
      price: 400,
      rewardType: 'wish',
      rewardAmount: 1,
    });
    expect(bySeed('cinema').price).toBe(100);
    expect(bySeed('gift').price).toBe(200);
  });

  it('marks the starters by a flag: blue and purple explorers and the cosy room', () => {
    const starters = runtime.ctx.catalog.starters();
    expect(starters.map((s) => [s.seedKey, s.kind, s.price])).toEqual([
      ['blue', 'outfit', 0],
      ['purple', 'outfit', 0],
      ['room-default', 'room', 0],
    ]);
    expect(starters.every((s) => !s.active)).toBe(true);
    expect(bySeed('room-default').room).toMatchObject({
      title: 'Уютная примерочная',
      image: '/assets/game/fitting-room/room-bright.webp',
    });
    // The flag decides, not an id: another flagged item is a starter too.
    runtime.ctx.db.$client
      .prepare("UPDATE catalog_items SET starter = 1 WHERE seed_key = 'space'")
      .run();
    expect(runtime.ctx.catalog.starters().map((s) => s.seedKey)).toContain('space');
  });

  it('MVP visibility: every hero, live hero and room is on sale; of tickets only 300 Robux', () => {
    const sold = items().filter((i) => !i.starter);
    expect(sold.filter((i) => i.kind !== 'ticket').every((i) => i.active)).toBe(true);
    expect(
      sold
        .filter((i) => i.kind === 'ticket')
        .map((i) => [i.seedKey, i.active])
        .sort(),
    ).toEqual([
      ['cinema', false],
      ['fries', false],
      ['gift', false],
      ['tokens', true],
    ]);
    // Every animation and every moving room can be reached in the shop.
    const active = runtime.ctx.catalog.items({ activeOnly: true });
    for (const animation of runtime.ctx.catalog.library().animations) {
      expect(
        active.some((i) => i.animation?.key === animation.key),
        animation.key,
      ).toBe(true);
    }
    for (const room of runtime.ctx.catalog.library().rooms.filter((r) => r.scene !== 'static')) {
      expect(
        active.some((i) => i.room?.roomKey === room.key),
        room.key,
      ).toBe(true);
    }
  });

  it('re-seeding changes nothing and writes nothing', () => {
    const before = changes();
    expect(seedCatalog(runtime.ctx.db, runtime.ctx.catalog)).toEqual({ inserted: 0, updated: 0 });
    expect(changes()).toBe(before);
  });

  it('upserts by seed_key and keeps the fields the admin edited', async () => {
    const space = bySeed('space');
    const res = await admin.patch(`/api/admin/catalog/items/${space.id}`, {
      title: 'Мой космонавт',
      price: 55,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      version: 2,
      editedFields: ['title', 'price'],
    });

    const seed: CatalogSeed = structuredClone(loadCatalogSeed());
    const next = seed.items.find((i) => i.seedKey === 'space');
    const forest = seed.items.find((i) => i.seedKey === 'forest');
    if (!next || !forest) throw new Error('seed items');
    Object.assign(next, { title: 'Новый космонавт', price: 70, description: 'Обновлено сидом.' });
    Object.assign(forest, { price: 45 });
    seed.items.push({
      seedKey: 'new-hero',
      kind: 'outfit',
      title: 'Новый герой',
      description: '',
      price: 40,
      active: true,
      character: 'hotdog-boy',
    });
    expect(seedCatalog(runtime.ctx.db, runtime.ctx.catalog, seed)).toEqual({
      inserted: 1,
      updated: 2,
    });
    expect(bySeed('space')).toMatchObject({
      title: 'Мой космонавт',
      price: 55,
      description: 'Обновлено сидом.',
      version: 3,
    });
    expect(bySeed('forest')).toMatchObject({ price: 45, version: 2 });
    expect(bySeed('new-hero')).toMatchObject({ version: 1, hero: { characterKey: 'hotdog-boy' } });
  });

  it('a seed change that no longer fits an edited item leaves the admin’s version', async () => {
    const dracula = bySeed('room-dracula');
    const res = await admin.patch(`/api/admin/catalog/items/${dracula.id}`, {
      animationKey: 'astro-room-night',
    });
    expect(await res.json()).toMatchObject({ version: 2, editedFields: ['animationKey'] });
    // The seed moves the item to the night hotel, which takes no animation of its own.
    const seed: CatalogSeed = structuredClone(loadCatalogSeed());
    const next = seed.items.find((i) => i.seedKey === 'room-dracula');
    if (!next) throw new Error('seed item');
    next.room = 'room-night-hotel-v1';
    expect(seedCatalog(runtime.ctx.db, runtime.ctx.catalog, seed).updated).toBe(0);
    expect(bySeed('room-dracula')).toMatchObject({
      version: 2,
      room: { roomKey: 'room-dracula' },
      animation: { key: 'astro-room-night' },
    });
  });
});

describe('admin CRUD', () => {
  const post = (body: unknown) => admin.post('/api/admin/catalog/items', body);

  it('creates items of every kind, version 1', async () => {
    const hero = await post({
      kind: 'outfit',
      title: '  Живой хот-дог ',
      price: 90,
      characterKey: 'hotdog-boy',
      animationKey: 'hero-punch',
    });
    expect(hero.status).toBe(201);
    expect(await hero.json()).toMatchObject({
      title: 'Живой хот-дог',
      version: 1,
      active: true,
      seedKey: null,
      animated: true,
      hero: { characterKey: 'hotdog-boy', image: '/assets/game/characters/hotdog-boy.webp' },
      animation: { key: 'hero-punch', src: '/assets/game/animated/repaired/hero-punch.webp' },
    });
    const room = await post({
      kind: 'room',
      title: 'Ещё Дракула',
      price: 10,
      roomKey: 'room-dracula',
    });
    expect(await room.json()).toMatchObject({
      roomCategory: 'night',
      animated: true,
      room: { scene: 'ambient:embers' },
    });
    const ticket = await post({
      kind: 'ticket',
      title: '500 Robux',
      price: 500,
      imageKey: 'game/report-robux.svg',
      rewardType: 'robux',
      rewardAmount: 500,
    });
    expect(await ticket.json()).toMatchObject({
      rewardType: 'robux',
      rewardAmount: 500,
      ticket: { image: '/assets/game/report-robux.svg' },
    });
    const wish = await post({
      kind: 'ticket',
      title: 'Поход в парк',
      price: 150,
      imageKey: 'game/wishes.webp',
      sprite: { cols: 2, rows: 2, col: 1, row: 1 },
      rewardType: 'wish',
      rewardAmount: 7,
    });
    expect(await wish.json()).toMatchObject({ rewardAmount: 1 });
    expect(runtime.ctx.audit.list({ action: 'catalog_item.created' }).items).toHaveLength(4);
  });

  it('validates like the original editor', async () => {
    const cases: [Record<string, unknown>, number][] = [
      [{ kind: 'outfit', title: 'x'.repeat(101), price: 1, characterKey: 'space' }, 400],
      [
        {
          kind: 'outfit',
          title: 'Описание',
          description: 'x'.repeat(801),
          price: 1,
          characterKey: 'space',
        },
        400,
      ],
      [{ kind: 'outfit', title: 'Дорого', price: 100_001, characterKey: 'space' }, 400],
      [{ kind: 'outfit', title: 'Без картинки', price: 1 }, 400],
      [{ kind: 'outfit', title: 'Чужой', price: 1, characterKey: 'nobody' }, 400],
      [
        { kind: 'outfit', title: 'Фон', price: 1, characterKey: 'space', roomKey: 'room-dracula' },
        400,
      ],
      [
        {
          kind: 'outfit',
          title: 'Комнатная анимация',
          price: 1,
          characterKey: 'space',
          animationKey: 'astro-room-night',
        },
        400,
      ],
      [{ kind: 'room', title: 'Без фона', price: 1, roomCategory: 'day' }, 400],
      [
        { kind: 'room', title: 'Герой', price: 1, roomKey: 'room-dracula', characterKey: 'space' },
        400,
      ],
      [
        {
          kind: 'room',
          title: 'Отель',
          price: 1,
          roomKey: 'room-night-hotel-v1',
          animationKey: 'astro-room-night',
        },
        400,
      ],
      [
        {
          kind: 'room',
          title: 'Анимация героя',
          price: 1,
          roomKey: 'room-dracula',
          animationKey: 'hero-punch',
        },
        400,
      ],
      [
        {
          kind: 'ticket',
          title: 'Robux',
          price: 1,
          imageKey: 'game/wishes.webp',
          rewardType: 'robux',
        },
        400,
      ],
      [{ kind: 'ticket', title: 'Без награды', price: 1, imageKey: 'game/wishes.webp' }, 400],
      [
        {
          kind: 'ticket',
          title: 'Живой',
          price: 1,
          imageKey: 'game/wishes.webp',
          rewardType: 'wish',
          animationKey: 'hero-punch',
        },
        400,
      ],
      [
        {
          kind: 'ticket',
          title: 'Комната',
          price: 1,
          imageKey: 'game/rooms/room-dracula.webp',
          rewardType: 'wish',
        },
        400,
      ],
      [
        {
          kind: 'ticket',
          title: 'Нет файла',
          price: 1,
          imageKey: 'game/none.webp',
          rewardType: 'wish',
        },
        400,
      ],
      [{ kind: 'ticket', title: 'Загрузка', price: 1, imageUploadId: 1, rewardType: 'wish' }, 400],
    ];
    for (const [body, status] of cases) {
      const res = await post(body);
      expect(res.status, JSON.stringify(body)).toBe(status);
    }
  });

  it('PATCH bumps the version once per real change and records the edited fields', async () => {
    const item = bySeed('seek');
    const res = await admin.patch(`/api/admin/catalog/items/${item.id}`, { active: false });
    expect(await res.json()).toMatchObject({ active: false, version: 2, editedFields: ['active'] });
    const same = await admin.patch(`/api/admin/catalog/items/${item.id}`, { active: false });
    expect(await same.json()).toMatchObject({ version: 2 });
    const live = await admin.patch(`/api/admin/catalog/items/${item.id}`, {
      animationKey: 'seek-sway',
    });
    expect(await live.json()).toMatchObject({
      version: 3,
      animated: true,
      animation: { motion: 'sway', posterSprite: { col: 1, row: 0 } },
      editedFields: ['active', 'animationKey'],
    });
    expect((await admin.patch('/api/admin/catalog/items/99999', { price: 1 })).status).toBe(404);
    expect((await admin.get('/api/admin/catalog/items/99999')).status).toBe(404);
    expect((await admin.get(`/api/admin/catalog/items/${item.id}`)).status).toBe(200);
    expect(runtime.ctx.audit.list({ action: 'catalog_item.updated' }).items).toHaveLength(2);
  });

  it('the kind of a bought item cannot change', () => {
    let bought = true;
    const catalog = createCatalogService(runtime.ctx.db, {
      audit: runtime.ctx.audit,
      hasPurchases: () => bought,
    });
    const item = bySeed('pizza');
    const toRoom = {
      kind: 'room' as const,
      characterKey: null,
      roomKey: 'room-star-studio',
      sprite: null,
    };
    try {
      catalog.update(item.id, toRoom, adminId);
      throw new Error('expected 409');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).code).toBe('kind_locked');
    }
    // Other changes of a bought item are fine; an item nobody bought may change its kind.
    expect(catalog.update(item.id, { price: 41 }, adminId).version).toBe(2);
    bought = false;
    expect(catalog.update(item.id, toRoom, adminId)).toMatchObject({
      kind: 'room',
      roomCategory: 'day',
      hero: null,
    });
  });

  it('uses uploads when the upload facts are known', () => {
    const upload = () =>
      runtime.ctx.media.create({ taskId: null, role: 'upload', kind: 'image' }).id;
    const [still, square, wide, unknown] = [upload(), upload(), upload(), upload()];
    const uploads = new Map<number, UploadInfo>([
      [still, { animated: false, width: 512, height: 512 }],
      [square, { animated: true, width: 512, height: 512, durationMs: 2000 }],
      [wide, { animated: true, width: 768, height: 512, durationMs: 2000 }],
    ]);
    const catalog = createCatalogService(runtime.ctx.db, {
      audit: runtime.ctx.audit,
      describeUpload: (id) => uploads.get(id),
    });
    const hero = catalog.create(
      {
        kind: 'outfit',
        title: 'Мой герой',
        price: 1,
        imageUploadId: still,
        animationUploadId: square,
      },
      adminId,
    );
    expect(hero).toMatchObject({
      animated: true,
      hero: { uploadId: still, image: `/api/uploads/${still}`, footOffset: 10 },
      animation: {
        uploadId: square,
        src: `/api/uploads/${square}`,
        poster: `/api/uploads/${still}`,
      },
    });
    const room = catalog.create(
      {
        kind: 'room',
        title: 'Моя комната',
        price: 1,
        imageUploadId: still,
        roomCategory: 'special',
        animationUploadId: wide,
      },
      adminId,
    );
    expect(room).toMatchObject({
      roomCategory: 'special',
      room: { scene: 'static', uploadId: still },
    });
    const refuse = (input: Parameters<typeof catalog.create>[0]) =>
      expect(() => catalog.create(input, adminId)).toThrow(HttpError);
    // A square animation is not a room; a still picture is not an animation; unknown uploads.
    refuse({
      kind: 'room',
      title: 'К',
      price: 1,
      imageUploadId: still,
      roomCategory: 'day',
      animationUploadId: square,
    });
    refuse({ kind: 'outfit', title: 'Г', price: 1, imageUploadId: square });
    refuse({ kind: 'outfit', title: 'Г', price: 1, imageUploadId: unknown });
    refuse({ kind: 'room', title: 'К', price: 1, imageUploadId: still });
    // Without the upload facts (before FEAT-018) uploads cannot be used at all.
    expect(() =>
      runtime.ctx.catalog.create(
        { kind: 'outfit', title: 'Г', price: 1, imageUploadId: still },
        adminId,
      ),
    ).toThrow(HttpError);
  });

  it('lists items by kind and the library for pickers', async () => {
    const rooms = (await (
      await admin.get('/api/admin/catalog/items?kind=room')
    ).json()) as CatalogItemDto[];
    expect(rooms).toHaveLength(38);
    expect((await admin.get('/api/admin/catalog/items?kind=hat')).status).toBe(400);
    const lib = (await (await admin.get('/api/admin/catalog/library')).json()) as CatalogLibraryDto;
    expect(lib.characters.find((c) => c.key === 'seek')).toMatchObject({
      image: '/assets/game/special.webp',
      sprite: { cols: 2, rows: 2, col: 1, row: 0 },
    });
    const res = await admin.post('/api/admin/catalog/items', { kind: 'outfit' });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('validation_failed');
  });
});
