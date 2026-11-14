// FEAT-042: a new shop item from built-in art and from an upload, then handing out what a
// learner bought and asked for — part of the Robux and a wish.
import { request as playwrightRequest } from '@playwright/test';
import { expect, expectNoHorizontalScroll, test } from './fixtures/admin';

/** A valid 1 × 1 PNG: the smallest picture the upload endpoint accepts. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test('a ticket from built-in art, then with an uploaded picture', async ({ page, install }) => {
  void install;
  await page.goto('/admin/shop/new');
  const form = page.getByRole('form', { name: 'Товар' });
  await form.getByRole('radio', { name: 'Билет' }).click();
  await form.getByLabel(/Название/).fill('Поход в кино');
  await form.getByLabel('Цена, монет').fill('50');
  await form.getByLabel('Цена, монет').blur();
  const art = form.getByLabel('Картинка билета');
  await art.selectOption({ index: 1 });
  await form.getByText('Показывать в магазине ребёнка').click();
  await form.getByRole('button', { name: 'Создать товар' }).click();
  await expect(page).toHaveURL(/\/admin\/shop\/\d+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Поход в кино' })).toBeVisible();
  await expect(page.getByText(/Билет · версия 1/)).toBeVisible();

  await form.getByRole('radio', { name: 'Своя загрузка' }).click();
  await form.getByLabel('Или загрузите новую').setInputFiles({
    name: 'ticket.png',
    mimeType: 'image/png',
    buffer: PIXEL_PNG,
  });
  await expect(form.getByText(/^Загрузка № \d+$/)).toBeVisible();
  await form.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Сохранено, версия 2')).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto('/admin/shop');
  await page.getByRole('tab', { name: 'Билеты' }).click();
  const card = page.getByRole('button', { name: 'Изменить: Поход в кино' });
  await expect(card.getByText('В магазине')).toBeVisible();
});

test('Robux are handed out in part, a wish is confirmed', async ({ page, install }) => {
  const learner = await install.call<{ id: number }>('POST', '/api/admin/users', {
    role: 'learner',
    name: 'Саша',
    pin: '2468',
  });
  await install.call('POST', `/api/admin/learners/${learner.id}/awards`, {
    reasonId: 'custom',
    title: 'Подарок',
    date: '2026-11-14',
    xp: 0,
    coins: 1000,
    requestId: 'e2e-shop-coins-1',
  });
  const tickets = await install.call<{ id: number; rewardType: string; active: boolean }[]>(
    'GET',
    '/api/admin/catalog/items?kind=ticket',
  );
  const wish = tickets.find((ticket) => ticket.rewardType === 'wish');
  if (!wish) throw new Error('The seed has no wish ticket');
  if (!wish.active) {
    await install.call('PATCH', `/api/admin/catalog/items/${wish.id}`, { active: true });
  }

  // On the tablet: both tickets bought, both asked for.
  const device = await install.learnerDevice(learner.id, '2468');
  const kid = await playwrightRequest.newContext({
    baseURL: install.stack.baseURL,
    storageState: device.storageState(),
  });
  try {
    const shop = (await (await kid.get('/api/shop')).json()) as {
      items: { id: number; version: number; rewardType: string | null }[];
    };
    for (const type of ['robux', 'wish']) {
      const item = shop.items.find((entry) => entry.rewardType === type);
      if (!item) throw new Error(`No ${type} ticket in the shop`);
      const bought = await kid.post('/api/shop/purchases', {
        data: { itemId: item.id, version: item.version, requestId: `e2e-buy-${type}-01` },
      });
      expect(bought.status(), await bought.text()).toBe(201);
    }
    const wishes = (await (await kid.get('/api/me/wishes')).json()) as {
      groups: { groupKey: string }[];
    };
    for (const group of wishes.groups) {
      await kid.post('/api/me/wish-requests', { data: { groupKey: group.groupKey } });
    }
  } finally {
    await kid.dispose();
  }

  await page.goto('/admin/wishes');
  await expect(page.getByRole('tab', { name: /Просят сейчас/ })).toContainText('2');
  await page.getByRole('button', { name: 'Подтвердить выполнение' }).click();
  await expect(page.getByText(/: выполнено$/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Подтвердить выполнение' })).toBeHidden();

  const amount = page.getByLabel('Выдать Robux: Robux');
  await expect(page.getByText('Сейчас осталось: 300 · После отметки: 0')).toBeVisible();
  await amount.fill('100');
  await amount.blur();
  await expect(page.getByText('Сейчас осталось: 300 · После отметки: 200')).toBeVisible();
  await page.getByRole('button', { name: 'Выдать Robux' }).click();
  await expect(page.getByText('Выдано 100 Robux')).toBeVisible();
  // The request is answered; the rest stays among what is not handed out yet.
  await expect(page.getByText('Никто ничего не просит')).toBeVisible();
  await page.getByRole('tab', { name: 'Всё невыданное' }).click();
  await expect(page.getByText('Сейчас осталось: 200 · После отметки: 0')).toBeVisible();
  await expectNoHorizontalScroll(page);
});
