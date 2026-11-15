// FEAT-027: the five screen templates on demo data — they fit 390 and 1440 px without horizontal
// scrolling and match their screenshots.
import { expect, expectNoHorizontalScroll, expectScreenshot, test } from './fixtures/test';

// The demo pages live under /dev, which production opens to admins only.
test.use({ persona: 'admin' });

const TEMPLATES: readonly (readonly [string, string])[] = [
  ['learner', 'Саша, начнём?'],
  ['task', 'Сложение и вычитание в пределах 100'],
  ['catalog', 'Магазин желаний'],
  ['progress', 'Мой прогресс'],
  ['admin', 'Пользователи'],
];

for (const [name, heading] of TEMPLATES) {
  test(`template ${name}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/dev/templates/${name}`);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectScreenshot(page, `template-${name}`);
    expect(errors).toEqual([]);
  });
}

test('learner shell: numbers, profile menu and bottom navigation', async ({ page }) => {
  await page.goto('/dev/templates/learner');
  await expect(page.getByRole('group', { name: 'Мои достижения' })).toContainText('1 131');
  await expect(page.getByRole('link', { name: 'Мои желания: 1' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Награды' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Разделы' });
  await expect(nav.getByRole('link')).toHaveText(['Учёба', 'Герой', 'Магазин']);
  await expect(nav.getByRole('link', { name: 'Учёба' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Профиль' }).click();
  const menu = page.getByRole('menu', { name: 'Профиль' });
  await expect(menu.getByRole('menuitem')).toHaveText(['Сменить ученика', 'Родителям']);
  await expectScreenshot(page, 'template-learner-menu');
});

test('catalog: the filter and the details dialog', async ({ page }) => {
  await page.goto('/dev/templates/catalog');
  await page.getByRole('tab', { name: 'Комнаты' }).click();
  await page.getByRole('button', { name: /Комната Дракулы/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Комната Дракулы' });
  await expect(dialog.getByRole('button', { name: 'Купить за 120' })).toBeDisabled();
  await expectNoHorizontalScroll(page);
});
