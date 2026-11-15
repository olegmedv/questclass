// FEAT-039: users, settings and import tokens in the admin area, against the real API.
import { expect, expectNoHorizontalScroll, expectScreenshot, test } from './fixtures/admin';

test('users: add a learner, rename them, switch them off', async ({ page, install }) => {
  void install;
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { level: 1, name: 'Пользователи' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Мама (вы)', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Добавить' }).click();
  const create = page.getByRole('dialog', { name: 'Новый пользователь' });
  await create.getByLabel(/Имя/).fill('Саша');
  await create.getByLabel(/PIN/).fill('2468');
  await create.getByRole('button', { name: 'Добавить' }).click();
  await expect(create).toBeHidden();
  await expect(page.getByRole('cell', { name: 'Саша', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Изменить: Саша' }).click();
  const edit = page.getByRole('dialog', { name: 'Изменить: Саша' });
  await edit.getByLabel(/Имя/).fill('Шура');
  await edit.getByRole('button', { name: 'Сохранить' }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByRole('cell', { name: 'Шура', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Изменить: Шура' }).click();
  const again = page.getByRole('dialog', { name: 'Изменить: Шура' });
  // The switch is a styled checkbox: a click on its label toggles it, as for a user.
  await again.getByText('Может входить', { exact: true }).click();
  await expect(again.getByRole('switch', { name: 'Может входить' })).not.toBeChecked();
  await again.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('cell', { name: 'Шура', exact: true })).toBeHidden();
  await page.getByText(/Показать отключённых/).click();
  await expect(page.getByRole('row', { name: /Шура/ }).getByText('Отключён')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('settings: the form from the registry saves and keeps a value', async ({ page, install }) => {
  void install;
  await page.goto('/admin/settings');
  const form = page.getByRole('form', { name: 'Настройки' });
  await expect(form.getByLabel('Тест: верных ответов для зачёта')).toHaveValue('2');
  await expectNoHorizontalScroll(page);
  await expectScreenshot(page, 'admin-settings');

  await form.getByLabel('Тест: верных ответов для зачёта').fill('3');
  await form.getByLabel('Как открываются задания').selectOption({ label: 'Все сразу' });
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Настройки сохранены')).toBeVisible();
  await page.reload();
  await expect(form.getByLabel('Тест: верных ответов для зачёта')).toHaveValue('3');
  await expect(form.getByLabel('Как открываются задания')).toHaveValue('all');

  await page.getByRole('tab', { name: 'Ключи API' }).click();
  await expect(page).toHaveURL(/\/admin\/settings\/secrets$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Ключи API' })).toBeVisible();
});

test('import tokens: a new token is shown once and can be revoked', async ({
  page,
  install,
  request,
}) => {
  await page.goto('/admin/settings/import-tokens');
  await page.getByLabel('Название').fill('Ноутбук мамы');
  await page.getByRole('button', { name: 'Выпустить токен' }).click();
  const dialog = page.getByRole('dialog', { name: 'Токен «Ноутбук мамы»' });
  const token = await dialog.getByLabel('Токен').inputValue();
  expect(token.length).toBeGreaterThan(20);
  // The token opens the import API (an unknown media answers 404, not 401). `request` has no
  // browser cookies, so the token is its only credential.
  const probe = await request.get(`${install.stack.apiURL}/api/import/media/999`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(probe.status()).toBe(404);
  await dialog.getByRole('button', { name: 'Я сохранил токен' }).click();
  await expect(page.getByText(token)).toBeHidden();

  const row = page.getByRole('row', { name: /Ноутбук мамы/ });
  await expect(row.getByText('Действует')).toBeVisible();
  await row.getByRole('button', { name: 'Отозвать' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Отозвать' }).click();
  await expect(row.getByText('Отозван')).toBeVisible();
  const after = await request.get(`${install.stack.apiURL}/api/import/media/999`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(after.status()).toBe(401);
});
