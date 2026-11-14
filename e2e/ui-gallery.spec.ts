// FEAT-025: the component gallery at /dev/ui — every section renders without page errors, the
// page fits 390 and 1440 px without horizontal scrolling, and each section matches its baseline.
import { expect, expectNoHorizontalScroll, expectScreenshot, test } from './fixtures/test';

// In production builds the gallery is open to admins only.
test.use({ persona: 'admin' });

const SECTIONS = [
  'button',
  'icon-button',
  'card',
  'item-card',
  'modal',
  'sheet',
  'drawer',
  'tabs',
  'segmented',
  'progress',
  'ring',
  'stat',
  'badge',
  'avatar',
  'steps',
  'lesson-card',
  'streak-card',
  'choice-tile',
  'action-list',
  'result',
  'review',
  'empty',
  'toast',
  'tooltip',
  'placeholder',
  'field',
  'select',
  'switch',
  'checkbox',
  'number',
  'slider',
  'textarea',
  'datetime',
  'file',
  'accordion',
  'table',
  'pinpad',
  'spinner',
  'question',
  'option',
  'skeleton',
  'typography',
  'animated-hero',
  'celebration',
  'sounds',
  'menu',
  'navigation',
  'frames',
  'notice',
  'auth-frame',
];

test('gallery shows every component in five states and fits the screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/dev/ui');
  await expect(page.getByRole('heading', { level: 1, name: 'Галерея компонентов' })).toBeVisible();
  for (const id of SECTIONS) {
    const section = page.locator(`[data-gallery="${id}"]`);
    await expect(section, id).toHaveCount(1);
    for (const state of ['default', 'disabled', 'loading', 'empty', 'error']) {
      await expect(section.locator(`[data-state="${state}"]`), `${id}: ${state}`).toHaveCount(1);
    }
  }
  await expectNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('gallery sections match their screenshots', async ({ page }) => {
  await page.goto('/dev/ui');
  await expect(page.getByRole('heading', { level: 1, name: 'Галерея компонентов' })).toBeVisible();
  for (const id of [...SECTIONS, 'live-heroes']) {
    await expectScreenshot(page.locator(`[data-gallery="${id}"]`), `gallery-${id}`);
  }
});

test('every live hero and the 9 action animations play, one at a time', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/dev/ui');
  const heroes = page.locator('[data-live-hero]');
  await expect(heroes).toHaveCount(20);
  await expect(heroes.filter({ hasText: 'Экшен' })).toHaveCount(9);
  for (let i = 0; i < 20; i += 1) {
    const card = heroes.nth(i);
    const id = await card.getAttribute('data-live-hero');
    await card.scrollIntoViewIfNeeded();
    await card.getByRole('button', { name: 'Оживить героя' }).click();
    // Moving = the animated WebP has loaded (or the CSS motion runs) — the poster came first.
    await expect(card.locator('figure[data-moving]'), `${id} moves`).toHaveCount(1, {
      timeout: 30_000,
    });
    await expect(page.locator('figure[data-moving]'), 'only one hero moves').toHaveCount(1);
  }
  await expect(page.locator('.qc-hero-error')).toHaveCount(1); // only the gallery's error demo
});

test('a modal opens over the page, traps focus and closes with Escape', async ({ page }) => {
  await page.goto('/dev/ui');
  const opener = page.getByRole('button', { name: 'Открыть: обычное' }).first();
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Модальное окно' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Имя ребёнка' })).toBeFocused();
  await expectNoHorizontalScroll(page);
  await expectScreenshot(dialog, 'gallery-modal-open');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('celebrations open as dialogs: pass, purchase, streak and its static version', async ({
  page,
}) => {
  await page.goto('/dev/ui');
  const section = page.locator('[data-gallery="celebration"]');

  await section.getByRole('button', { name: 'Зачёт', exact: true }).click();
  const pass = page.getByRole('dialog', { name: 'Тест пройден!' });
  await expect(pass.getByText('+100 XP')).toBeVisible();
  await expect(pass.getByText('Предпросмотр: ничего не начислено')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectScreenshot(pass, 'celebration-pass');
  await pass.getByRole('button', { name: 'Закрыть предпросмотр' }).click();

  await section.getByRole('button', { name: 'Покупка' }).click();
  await expect(page.getByRole('dialog', { name: 'Куплено!' })).toBeVisible();
  await page.keyboard.press('Escape');

  await section.getByRole('button', { name: 'Серия', exact: true }).click();
  const streak = page.getByRole('dialog', { name: 'Пять дней подряд — серия завершена!' });
  await expect(
    streak.getByRole('img', { name: 'Герой побеждает и поднимает кубок' }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await streak.getByRole('button', { name: 'К наградам' }).click();
  await expect(streak.getByRole('button', { name: 'Закрыть предпросмотр' })).toBeVisible({
    timeout: 5000,
  });
  await expect(streak.getByText('550', { exact: true })).toBeVisible();
  await streak.getByRole('button', { name: 'Закрыть предпросмотр' }).click();

  await section.getByRole('button', { name: 'Серия без движения' }).click();
  const still = page.getByRole('dialog', { name: 'Пять дней подряд — серия завершена!' });
  await expect(still.locator('.qc-streak-movie')).toHaveCount(0);
  await expect(still.getByRole('button', { name: 'Закрыть предпросмотр' })).toBeVisible();
  await expectScreenshot(still, 'celebration-streak-static');
});
