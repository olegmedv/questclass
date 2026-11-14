// FEAT-061: «Оформление» — the logo replaced in the admin area is answered at its usual address
// (header, sign-in screens, favicon), and the built-in one comes back with one button.
import { readFileSync } from 'node:fs';
import { expect, expectNoHorizontalScroll, expectScreenshot, test } from './fixtures/admin';

const LOGO_URL = '/assets/icons/star-v1-192.png';
/** A 256 × 256 built-in picture stands in for the family's own logo. */
const OWN_LOGO = readFileSync(
  new URL('../apps/web/public/assets/game/subjects-pixel/math.webp', import.meta.url),
);

test('the logo is replaced from the admin area and put back', async ({ page, install }) => {
  void install;
  await page.goto('/admin/appearance');
  await expect(page.getByRole('heading', { level: 1, name: 'Оформление' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Заменённые \(0\)/ })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectScreenshot(page, 'admin-appearance');

  await page.getByRole('button', { name: /Логотип и значки приложения/ }).click();
  await page.getByRole('button', { name: 'Заменить: star-v1-192.png' }).click();
  const dialog = page.getByRole('dialog', { name: 'star-v1-192.png' });
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'logo.webp',
    mimeType: 'image/webp',
    buffer: OWN_LOGO,
  });
  await expect(page.getByText('Файл заменён')).toBeVisible();
  await expect(dialog.getByText('Сейчас: своя')).toBeVisible();
  await dialog.getByRole('button', { name: 'Готово' }).click();

  // Same address, new picture: the header shows it after a reload, nothing else changed.
  const replaced = await page.request.get(LOGO_URL);
  expect(replaced.headers()['content-type']).toBe('image/webp');
  expect(Buffer.from(await replaced.body())).toEqual(OWN_LOGO);
  await page.reload();
  const header = page.locator(`img[src="${LOGO_URL}"]`).first();
  await expect.poll(() => header.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(256);
  await expect(page.getByRole('radio', { name: /Заменённые \(1\)/ })).toBeVisible();

  await page.getByRole('radio', { name: /Заменённые/ }).check();
  await page.getByRole('button', { name: 'Заменить: star-v1-192.png' }).click();
  await page
    .getByRole('dialog', { name: 'star-v1-192.png' })
    .getByRole('button', { name: 'Вернуть встроенный' })
    .click();
  await expect(page.getByText('Встроенный файл возвращён')).toBeVisible();
  const restored = await page.request.get(LOGO_URL);
  expect(restored.headers()['content-type']).toBe('image/png');
  await page.reload();
  await expect.poll(() => header.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(192);
});
