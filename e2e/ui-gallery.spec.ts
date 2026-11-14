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
  for (const id of SECTIONS) {
    await expectScreenshot(page.locator(`[data-gallery="${id}"]`), `gallery-${id}`);
  }
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
