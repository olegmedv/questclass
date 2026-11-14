// FEAT-028: the sign-in screens against the real API — the full path on a fresh installation,
// the profile picker and PIN on the trusted device, the untrusted-device message, admin login.
import { expect, expectNoHorizontalScroll, expectScreenshot, test } from './fixtures/test';

test('setup → make this device the children’s → the learner signs in with the PIN', async ({
  page,
  freshStack,
}) => {
  test.setTimeout(90_000);
  await page.goto(`${freshStack.baseURL}/`);
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Первый запуск' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectScreenshot(page, 'setup');

  await page.getByLabel('Код установки').fill(freshStack.setupToken ?? '');
  await page.getByLabel('Как к вам обращаться').fill('Мама');
  await page.getByLabel('Логин').fill('mama');
  await page.getByLabel('Пароль').fill('e2e-password-1');
  await page.getByRole('button', { name: 'Создать и войти' }).click();

  await expect(page).toHaveURL(/\/admin\/device$/);
  await expect(page.getByText(/Учётная запись создана/)).toBeVisible();
  await page.getByLabel('Название устройства').fill('Планшет (e2e)');
  await page.getByRole('button', { name: 'Сделать устройство детским' }).click();
  await expect(page.getByText(/Это устройство — детское/)).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Планшет (e2e)' })).toBeVisible();

  // Learners are added in the admin area later (FEAT-039); here through the API, as this admin.
  const created = await page.request.post(`${freshStack.baseURL}/api/admin/users`, {
    data: { role: 'learner', name: 'Саша', pin: '2468' },
  });
  expect(created.status()).toBe(201);

  await page.getByRole('button', { name: 'Профиль родителя' }).click();
  await page.getByRole('menuitem', { name: 'Выйти' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole('button', { name: /Саша/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Привет, Саша!' })).toBeVisible();
  await page.keyboard.type('2468');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Учёба' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Разделы' })).toBeVisible();
});

test.describe('on an untrusted device', () => {
  test('a parent is asked to switch the device on', async ({ page }) => {
    await page.goto('/login');
    await expect(
      page.getByRole('heading', { name: 'Попросите родителя включить это устройство' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Я родитель' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Вход для родителя' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectScreenshot(page, 'login-admin');
  });

  test('a wrong admin password is reported', async ({ page }) => {
    await page.goto('/login?as=admin');
    await page.getByLabel('Логин').fill('nobody');
    await page.getByLabel('Пароль').fill('wrong-password');
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByRole('alert')).toContainText('Неверный логин или пароль');
  });
});

test.describe('on the trusted device', () => {
  test.use({ persona: 'device' });

  test('the profile picker and the PIN pad', async ({ page, env }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Кто учится?' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectScreenshot(page, 'login-picker');
    await page.getByRole('button', { name: new RegExp(env.family.learner.name) }).click();
    const pad = page.getByRole('group', { name: `PIN ученика ${env.family.learner.name}` });
    await expect(pad).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectScreenshot(page, 'login-pin');
  });
});
