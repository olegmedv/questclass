// FEAT-036: live rooms against the real catalog — every room of every scene type opens on the
// «Герой» screen without console errors and shows its own layers (chosen by `room.scene`), the
// «Ночной отель» wakes on a tap, a live room plays in the shop by its button, and reduced motion
// keeps the rooms still.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/learning';
import { buyItem, grantCoins } from './fixtures/wardrobe';

interface ShopRoom {
  readonly title: string;
  readonly animated: boolean;
  readonly kind: string;
  readonly room: { readonly scene: string } | null;
}

/** Live rooms of the shop and one still room (bought for the test learner). */
async function buyRooms(page: Page): Promise<{ title: string; scene: string }[]> {
  const shop = (await (await page.request.get('/api/shop')).json()) as { items: ShopRoom[] };
  const live = shop.items.filter((item) => item.kind === 'room' && item.animated);
  const still = shop.items.find((item) => item.kind === 'room' && !item.animated);
  const rooms = [...live, ...(still ? [still] : [])].map((item) => ({
    title: item.title,
    scene: item.room?.scene ?? 'static',
  }));
  for (const room of rooms) await buyItem(page, room.title);
  return rooms;
}

/** What each scene type puts over the room. */
function layerOf(scene: string): string | null {
  if (scene === 'night-hotel') return '.qc-room-touch';
  if (scene === 'astro') return 'img.qc-room-motion';
  if (scene === 'rebound' || scene === 'ambient:rebound') return '.qc-rebound';
  if (scene.startsWith('ambient:')) return `.qc-ambient[data-theme="${scene.slice(8)}"]`;
  return null;
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function chooseRoom(page: Page, title: string) {
  await page
    .getByRole('list', { name: 'Мои комнаты' })
    .getByRole('button', { name: new RegExp(`^${title}(,|$)`) })
    .click();
  await expect(
    page.locator('.qc-scene').getByRole('img', { name: `Комната: ${title}` }),
  ).toBeVisible();
}

test('every live room opens with its own layers and no errors; the night hotel wakes on a tap', async ({
  page,
  admin,
  learner,
}) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await grantCoins(admin, learner.id, 1000);
  await grantCoins(admin, learner.id, 1000);

  // In the shop a live room plays by its button.
  await page.goto('/shop');
  await page
    .getByRole('radiogroup', { name: 'Разделы магазина' })
    .getByRole('radio', { name: 'Комнаты' })
    .click();
  await page
    .getByRole('radiogroup', { name: 'Какие комнаты' })
    .getByRole('radio', { name: 'Анимированные' })
    .click();
  const card = page.getByRole('article').first();
  await card.getByRole('button', { name: 'Посмотреть анимацию комнаты' }).click();
  await expect(card.locator('.qc-scene')).toHaveAttribute('data-room-motion', 'on');
  await card.getByRole('button', { name: 'Остановить анимацию комнаты' }).click();
  await expect(card.locator('.qc-scene')).toHaveCount(0);

  const rooms = await buyRooms(page);
  const scenes = new Set(rooms.map((room) => room.scene));
  for (const scene of ['night-hotel', 'astro', 'rebound', 'static'])
    expect(scenes).toContain(scene);
  expect([...scenes].filter((scene) => scene.startsWith('ambient:')).length).toBeGreaterThan(2);

  await page.goto('/hero');
  await page.getByRole('tab', { name: 'Комнаты' }).click();
  const sceneRoot = page.locator('.qc-scene');
  for (const room of rooms) {
    await chooseRoom(page, room.title);
    await expect(sceneRoot, room.title).toHaveAttribute('data-room-scene', room.scene);
    const layer = layerOf(room.scene);
    if (layer) {
      await expect(sceneRoot, room.title).toHaveAttribute('data-room-motion', 'on');
      await expect(sceneRoot.locator(layer), room.title).not.toHaveCount(0);
    } else {
      await expect(sceneRoot.locator('.qc-room-layer'), room.title).toHaveCount(0);
    }
  }

  // The night hotel: a tap wakes a random event at once.
  const hotel = rooms.find((room) => room.scene === 'night-hotel');
  if (!hotel) throw new Error('No night hotel in the catalog');
  await chooseRoom(page, hotel.title);
  await sceneRoot.getByRole('button', { name: 'Оживить комнату: случайная анимация' }).click();
  await expect(sceneRoot.locator('img[data-event]')).toHaveCount(1, { timeout: 15_000 });
  await expect(sceneRoot.locator('.qc-room-hint')).toHaveText(
    /Кто-то просыпается…|Смотри, что происходит…|Ещё сюрприз через \d+ с/,
  );

  expect(errors).toEqual([]);
});

test('reduced motion keeps every live room still', async ({ page, admin, learner }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await grantCoins(admin, learner.id, 1000);
  await grantCoins(admin, learner.id, 1000);
  const rooms = await buyRooms(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/hero');
  await page.getByRole('tab', { name: 'Комнаты' }).click();
  const sceneRoot = page.locator('.qc-scene');
  for (const room of rooms.filter((r) => r.scene !== 'static')) {
    await chooseRoom(page, room.title);
    await expect(sceneRoot, room.title).toHaveAttribute('data-room-scene', room.scene);
    await expect(sceneRoot, room.title).toHaveAttribute('data-room-motion', 'off');
    await expect(sceneRoot.locator('.qc-room-layer, .qc-room-touch'), room.title).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
