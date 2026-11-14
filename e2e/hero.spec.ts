// FEAT-034: the fitting room against the real API — one tap wears a hero and puts up a room (saved
// on the server), the dressing puff, the live hero moving on its screen, device settings.
import { expect, expectNoHorizontalScroll, expectScreenshot, test } from './fixtures/learning';
import { buyItem, grantCoins } from './fixtures/wardrobe';

test('one tap wears a hero and puts up a room; both are saved', async ({
  page,
  admin,
  learner,
}) => {
  await grantCoins(admin, learner.id, 200);
  await buyItem(page, 'Космонавт');
  await buyItem(page, 'Звёздная студия');
  // A still scene keeps the screenshots stable.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/hero');
  await expect(page.getByRole('heading', { level: 1, name: 'Примерка' })).toBeVisible();
  const scene = page.locator('.qc-scene');
  await expect(scene.getByRole('img', { name: 'Комната: Уютная примерочная' })).toBeVisible();
  await expect(scene.getByRole('img', { name: 'Синий исследователь' })).toBeVisible();
  const list = page.getByRole('list', { name: 'Твои обычные персонажи' });
  await expect(list.getByRole('button')).toHaveCount(3);
  await expectNoHorizontalScroll(page);
  await expectScreenshot(page, 'hero');

  await list.getByRole('button', { name: 'Космонавт' }).click();
  await expect(page.getByText('Персонаж надет!')).toBeVisible();
  await expect(scene.getByRole('img', { name: 'Космонавт' })).toBeVisible();
  await expect(list.getByRole('button', { name: 'Космонавт, надет' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('tab', { name: 'Комнаты' }).click();
  await page
    .getByRole('list', { name: 'Мои комнаты' })
    .getByRole('button', { name: 'Звёздная студия' })
    .click();
  await expect(page.getByText('Комната выбрана!')).toBeVisible();
  await expect(scene.getByRole('img', { name: 'Комната: Звёздная студия' })).toBeVisible();
  await expect(page.getByText('Звёздная студия', { exact: true }).first()).toBeVisible();

  // Saved on the server: a new visit shows the same hero and room.
  await page.reload();
  await expect(scene.getByRole('img', { name: 'Комната: Звёздная студия' })).toBeVisible();
  await expect(scene.getByRole('img', { name: 'Космонавт' })).toBeVisible();
  await page.getByRole('tab', { name: 'Комнаты' }).click();
  await expect(page.locator('.qc-toast')).toHaveCount(0, { timeout: 10_000 });
  await expectNoHorizontalScroll(page);
  await expectScreenshot(page, 'hero-rooms');
});

test('the dressing puff plays, then the worn live hero moves by itself', async ({
  page,
  admin,
  learner,
}) => {
  await grantCoins(admin, learner.id, 100);
  await buyItem(page, 'Синий исследователь');
  await page.goto('/hero');
  await page.getByRole('tab', { name: 'Живые' }).click();
  await page
    .getByRole('list', { name: 'Твои живые персонажи' })
    .getByRole('button', { name: 'Синий исследователь, живой' })
    .click();
  const scene = page.locator('.qc-scene');
  await expect(scene).toHaveAttribute('data-phase', /cover|reveal/);
  await expect(scene).toHaveAttribute('data-phase', 'idle');
  await expect(page.getByText('Персонаж надет!')).toBeVisible();
  await expect(scene.getByRole('figure')).toHaveAttribute('data-moving', 'true', {
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Остановить героя' }).click();
  await expect(scene.getByRole('figure')).not.toHaveAttribute('data-playing', /.*/);
});

test('hero settings: the name is saved, motion stays off on this device', async ({
  page,
  admin,
  learner,
}) => {
  await grantCoins(admin, learner.id, 100);
  await buyItem(page, 'Синий исследователь');
  await page.goto('/hero');
  await page.getByRole('tab', { name: 'Живые' }).click();
  await page.getByRole('button', { name: 'Синий исследователь, живой' }).click();
  await expect(page.locator('.qc-scene')).toHaveAttribute('data-phase', 'idle');

  await page.getByRole('button', { name: 'Настройки героя' }).click();
  const dialog = page.getByRole('dialog', { name: 'Настройки героя' });
  const motion = dialog.getByRole('switch', { name: 'Герой двигается сам' });
  await expect(motion).toBeChecked();
  await dialog.getByText('Герой двигается сам').click();
  await expect(motion).not.toBeChecked();
  await dialog.getByRole('textbox', { name: 'Имя героя' }).fill('Гром');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  const hero = page.locator('.qc-scene').getByRole('figure');
  await expect(hero).toBeVisible();
  // Motion is off: the live hero waits for the button.
  await page.waitForTimeout(1500);
  await expect(hero).not.toHaveAttribute('data-playing', /.*/);
  await page.getByRole('button', { name: 'Оживить героя' }).click();
  await expect(hero).toHaveAttribute('data-moving', 'true', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Настройки героя' }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Настройки героя' })
      .getByRole('textbox', { name: 'Имя героя' }),
  ).toHaveValue('Гром');
});
