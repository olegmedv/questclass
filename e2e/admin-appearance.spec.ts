// FEAT-061/063/064: «Оформление» — one logo file for every size, answered at the usual addresses
// (header, sign-in screens, favicon), and the built-in one back with one button; a special room
// shows the files of its scene on its own shop page.
import { readFileSync } from 'node:fs';
import { expect, expectNoHorizontalScroll, expectScreenshot, test } from './fixtures/admin';

const LOGO_URL = '/assets/icons/star-v1-192.png';
const TAB_URL = '/assets/icons/star-v1-32.png';
/** A 256 × 256 built-in picture stands in for the family's own logo. */
const OWN_LOGO = readFileSync(
  new URL('../apps/web/public/assets/game/subjects-pixel/math.webp', import.meta.url),
);

test('the logo is replaced in every size at once and put back', async ({ page, install }) => {
  void install;
  await page.goto('/admin/appearance');
  await expect(page.getByRole('heading', { level: 1, name: 'Оформление' })).toBeVisible();
  const logoCard = page.getByRole('region', { name: 'Логотип' });
  await expect(logoCard.getByRole('button', { name: /^Заменить: Логотип/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Заменённые \(0\)/ })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectScreenshot(page, 'admin-appearance');

  await logoCard.locator('input[type=file]').setInputFiles({
    name: 'logo.webp',
    mimeType: 'image/webp',
    buffer: OWN_LOGO,
  });
  await expect(page.getByText('Логотип заменён')).toBeVisible();

  // Same addresses, new picture: the header shows it after a reload, the tab icon too.
  for (const url of [LOGO_URL, TAB_URL]) {
    const replaced = await page.request.get(url);
    expect(replaced.headers()['content-type'], url).toBe('image/webp');
    expect(Buffer.from(await replaced.body()), url).toEqual(OWN_LOGO);
  }
  await page.reload();
  const header = page.locator(`img[src="${LOGO_URL}"]`).first();
  await expect.poll(() => header.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(256);

  await logoCard.getByRole('button', { name: 'Вернуть встроенный логотип' }).click();
  await expect(page.getByText('Встроенный логотип возвращён')).toBeVisible();
  for (const url of [LOGO_URL, TAB_URL]) {
    expect((await page.request.get(url)).headers()['content-type'], url).toBe('image/png');
  }
  await page.reload();
  await expect.poll(() => header.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(192);
});

test('a special room lists its scene files on its shop page', async ({ page, install }) => {
  void install;
  const items = (await (await page.request.get('/api/admin/catalog/items')).json()) as {
    id: number;
    title: string;
  }[];
  const hotel = items.find((item) => item.title === 'Ночной отель');
  if (!hotel) throw new Error('No «Ночной отель» in the seed catalog');
  await page.goto(`/admin/shop/${hotel.id}`);
  const scene = page.getByRole('region', { name: 'Сцена комнаты: фон, слои и звуки' });
  await expect(scene.getByRole('button', { name: /^Заменить: Фон сцены/ })).toBeVisible();
  await expect(scene.getByRole('button', { name: /^Заменить: Слой сцены: свечи/ })).toBeVisible();
  // Sounds are rows under the pictures: «гром», not «гром, второй».
  await scene.getByRole('button', { name: /^Звук события: гром(?!,)/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Ночной отель — звук события: гром' });
  await expect(dialog.getByRole('button', { name: 'Прослушать' })).toBeVisible();
  await expectNoHorizontalScroll(page);
});
