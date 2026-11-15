// FEAT-055: «Кабинет родителя» against the real API — the queues count what learners did, the
// cards lead to their screens, the search finds settings; a screenshot of the home.
import { request as playwrightRequest } from '@playwright/test';
import { expect, expectNoHorizontalScroll, expectScreenshot, test } from './fixtures/admin';

test('the home shows what waits and finds actions', async ({ page, install }) => {
  test.setTimeout(90_000);
  const learner = await install.call<{ id: number }>('POST', '/api/admin/users', {
    role: 'learner',
    name: 'Саша',
    pin: '2468',
  });
  const chore = await install.call<{ id: number }>('POST', '/api/admin/tasks', {
    type: 'chore',
    title: 'Убрать игрушки',
  });
  await install.call('PATCH', `/api/admin/tasks/${chore.id}`, { status: 'published' });
  await install.call('POST', `/api/admin/learners/${learner.id}/awards`, {
    reasonId: 'custom',
    title: 'Подарок',
    date: '2026-11-14',
    xp: 0,
    coins: 1000,
    requestId: 'e2e-home-coins-01',
  });

  // On the tablet: the chore is reported, a Robux ticket bought and asked for.
  const device = await install.learnerDevice(learner.id, '2468');
  const kid = await playwrightRequest.newContext({
    baseURL: install.stack.baseURL,
    storageState: device.storageState(),
  });
  try {
    expect((await kid.post(`/api/tasks/${chore.id}/chore-completions`)).status()).toBe(201);
    const shop = (await (await kid.get('/api/shop')).json()) as {
      items: { id: number; version: number; rewardType: string | null }[];
    };
    const robux = shop.items.find((item) => item.rewardType === 'robux');
    if (!robux) throw new Error('No Robux ticket in the shop');
    const bought = await kid.post('/api/shop/purchases', {
      data: { itemId: robux.id, version: robux.version, requestId: 'e2e-home-robux-1' },
    });
    expect(bought.status()).toBe(201);
    await kid.post('/api/me/wish-requests', { data: { groupKey: 'robux' } });
  } finally {
    await kid.dispose();
  }

  await page.goto('/admin');
  await expect(page.getByRole('heading', { level: 1, name: 'Кабинет родителя' })).toBeVisible();
  const chips = page.getByLabel('Сейчас ждут');
  await expect(chips.getByText('Дела на проверку: 1')).toBeVisible();
  await expect(chips.getByText('Ждут выдачи: 1')).toBeVisible();
  await expect(chips.getByText('Robux к выдаче: 300')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectScreenshot(page, 'admin-home');

  const box = page.getByLabel('Поиск по кабинету');
  await box.fill('видео');
  await expect(
    page.getByRole('list', { name: 'Найдено' }).getByRole('link', {
      name: /Видео: сколько процентов нужно посмотреть/,
    }),
  ).toBeVisible();
  await box.fill('');

  await page
    .getByRole('article', { name: 'Дела на проверку' })
    .getByRole('link', { name: 'Проверить дела' })
    .click();
  await expect(page).toHaveURL(/\/admin\/reviews$/);
  await page.getByRole('button', { name: 'Засчитать: Убрать игрушки', exact: true }).click();
  await expect(page.getByText(/Засчитано/).first()).toBeVisible();

  await page.getByRole('link', { name: 'Главная' }).click();
  await expect(page.getByLabel('Сейчас ждут').getByText('Ждут выдачи: 1')).toBeVisible();
  await expect(page.getByLabel('Сейчас ждут').getByText(/Дела на проверку/)).toBeHidden();
});
