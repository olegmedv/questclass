// FEAT-033: the shop and «Мои желания» against the real API — buying a hero, a room and a ticket,
// the ticket opening the wishes, «Хочу использовать», the parent handing out Robux and the history.
import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { expect, expectNoHorizontalScroll, expectScreenshot, test } from './fixtures/learning';

async function grantCoins(admin: APIRequestContext, learnerId: number, coins: number) {
  const res = await admin.post(`/api/admin/learners/${learnerId}/awards`, {
    data: {
      reasonId: 'custom',
      title: 'Монеты для магазина',
      date: '2026-11-14',
      xp: 0,
      coins,
      requestId: randomUUID(),
    },
  });
  expect(res.status(), await res.text()).toBe(201);
}

test('buys a hero, a room and a ticket; the ticket opens «Мои желания»', async ({
  page,
  admin,
  learner,
}) => {
  await grantCoins(admin, learner.id, 1000);
  // Still heroes keep the screenshots stable.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/shop');
  await expect(page.getByRole('heading', { level: 1, name: 'Магазин желаний' })).toBeVisible();
  const numbers = page.getByRole('group', { name: 'Мои достижения' });
  await expect(numbers.getByRole('link', { name: 'Мои желания: 0' })).toBeVisible();
  const sections = page.getByRole('radiogroup', { name: 'Разделы магазина' });

  // A hero.
  await sections.getByRole('radio', { name: 'Герои' }).click();
  await page
    .getByRole('radiogroup', { name: 'Какие герои' })
    .getByRole('radio', { name: 'Обычные' })
    .click();
  await page.getByRole('button', { name: 'Купить «Космонавт» за 40 монет' }).click();
  const confirm = page.getByRole('dialog', { name: 'Забираем персонажа?' });
  await expect(confirm.getByText('Потратишь 40 монет. Останется 960.')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectScreenshot(confirm, 'shop-confirm');
  await confirm.getByRole('button', { name: 'Подтвердить покупку' }).click();
  await expect(page.getByText('Новый образ в твоём гардеробе!')).toBeVisible();
  // Bought heroes leave the shop.
  await expect(page.getByRole('heading', { name: 'Космонавт', exact: true })).toHaveCount(0);
  await expect(numbers.getByText('960', { exact: true })).toBeVisible();

  // A room.
  await sections.getByRole('radio', { name: 'Комнаты' }).click();
  await page
    .getByRole('radiogroup', { name: 'Какие комнаты' })
    .getByRole('radio', { name: 'День' })
    .click();
  await page.getByRole('button', { name: 'Купить «Звёздная студия» за 120 монет' }).click();
  await page
    .getByRole('dialog', { name: 'Забираем комнату?' })
    .getByRole('button', { name: 'Подтвердить покупку' })
    .click();
  await expect(
    page.getByText('Новая комната! Выбери её в разделе «Герой → Комнаты».'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Звёздная студия', exact: true })).toHaveCount(0);

  // A ticket: «Мои желания» open right away.
  await sections.getByRole('radio', { name: 'Желания' }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  // Toasts fade on their own; screenshots wait for them to go.
  await expect(page.locator('.qc-toast')).toHaveCount(0, { timeout: 10_000 });
  await expectNoHorizontalScroll(page);
  await expectScreenshot(page, 'shop-wishes');
  await page.getByRole('button', { name: 'Купить «300 Robux» за 300 монет' }).click();
  await page
    .getByRole('dialog', { name: 'Забираем билет?' })
    .getByRole('button', { name: 'Подтвердить покупку' })
    .click();
  await expect(page).toHaveURL(/\/wishes$/);
  await expect(page.getByText('Билет сохранён в «Мои желания»!')).toBeVisible();
  const robux = page.getByRole('article', { name: 'Robux' });
  await expect(robux.getByText('300 Robux', { exact: true })).toBeVisible();
  await expect(robux.getByText('Куплено · можно использовать')).toBeVisible();
  await expect(numbers.getByRole('link', { name: 'Мои желания: 1' })).toBeVisible();
  await expect(numbers.getByText('540', { exact: true })).toBeVisible();
  await expect(page.locator('.qc-toast')).toHaveCount(0, { timeout: 10_000 });
  await expectNoHorizontalScroll(page);
  await expectScreenshot(page, 'wishes');

  await robux.getByRole('button', { name: 'Хочу использовать' }).click();
  await expect(robux.getByText('Просьба отправлена')).toBeVisible();

  // The parent hands out a part of the Robux.
  const handed = await admin.post(`/api/admin/learners/${learner.id}/fulfillments`, {
    data: { groupKey: 'robux', amount: 100, expectedRemaining: 300, requestId: randomUUID() },
  });
  expect(handed.status(), await handed.text()).toBe(201);
  await page.reload();
  await expect(robux.getByText('200 Robux', { exact: true })).toBeVisible();
  await expect(robux.getByText('Куплено · можно использовать')).toBeVisible();
  await page.getByRole('button', { name: 'Получено' }).click();
  const history = page.getByRole('list', { name: 'Получено' });
  await expect(history.getByText('100 Robux', { exact: true })).toBeVisible();
  await expect(history.getByText(/^Выданы родителем · \d\d\.\d\d\.\d{4}$/)).toBeVisible();
});

test('a live hero comes alive only by its play button; missing coins block the price', async ({
  page,
  learner,
}) => {
  expect(learner.id).toBeGreaterThan(0);
  await page.goto('/shop');
  await page
    .getByRole('radiogroup', { name: 'Разделы магазина' })
    .getByRole('radio', { name: 'Герои' })
    .click();
  await page
    .getByRole('radiogroup', { name: 'Какие герои' })
    .getByRole('radio', { name: 'Анимированные' })
    .click();
  const card = page.getByRole('article').first();
  const hero = card.getByRole('figure');
  await expect(hero).not.toHaveAttribute('data-playing', /.*/);
  await card.getByRole('button', { name: 'Оживить героя' }).click();
  await expect(hero).toHaveAttribute('data-moving', 'true', { timeout: 20_000 });
  await expect(page.locator('figure[data-moving]')).toHaveCount(1);
  // A new learner has no coins: every price says how many are missing.
  await expect(card.getByText(/^Ещё \d+ монет$/)).toBeVisible();
  await expect(card.getByRole('button', { name: /монет, ещё \d+ монет$/ })).toBeDisabled();
});
