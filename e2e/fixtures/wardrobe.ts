// Coins, purchases and the worn look of a test learner, through the real API (the shop and the
// fitting room are tested on their own screens; other specs only need the outcome).
import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** The parent's award «Своя награда» with coins only. */
export async function grantCoins(
  admin: APIRequestContext,
  learnerId: number,
  coins: number,
): Promise<void> {
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

/** Buys the shop item with this title as the learner signed in in `page`; returns its id. */
export async function buyItem(page: Page, title: string): Promise<number> {
  const shop = (await (await page.request.get('/api/shop')).json()) as {
    items: { id: number; title: string; version: number }[];
  };
  const item = shop.items.find((candidate) => candidate.title === title);
  if (!item) throw new Error(`No «${title}» in the shop`);
  const res = await page.request.post('/api/shop/purchases', {
    data: { itemId: item.id, version: item.version, requestId: randomUUID() },
  });
  expect(res.status(), await res.text()).toBe(201);
  return item.id;
}

/** Wears an owned look. */
export async function wearLook(page: Page, itemId: number): Promise<void> {
  const res = await page.request.put('/api/me/character/look', { data: { itemId } });
  expect(res.status(), await res.text()).toBe(200);
}
