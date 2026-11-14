// FEAT-053 smoke: the stack is up, sessions of each persona work, assets and fixtures exist.
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, expectNoHorizontalScroll, expectScreenshot, test } from './fixtures/test';

test('API answers through the SPA origin', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
});

test('built bundles and game assets are served separately', async ({ page, request }) => {
  await page.goto('/login');
  const scripts = await page
    .locator('script[type="module"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src')));
  expect(scripts.some((src) => src?.startsWith('/_app/'))).toBe(true);
  const asset = await request.get('/assets/game/heroes.webp');
  expect(asset.status()).toBe(200);
  expect(asset.headers()['content-type']).toContain('image/webp');
});

test('video fixtures are generated for the run', ({ env }) => {
  expect(statSync(env.video.mp4).size).toBeGreaterThan(10_000);
  // The playlist, its fMP4 init segment and the media segments live in one folder.
  const playlist = readFileSync(env.video.hls, 'utf8');
  expect(playlist).toContain('#EXT-X-MAP:URI="init.mp4"');
  expect(statSync(join(dirname(env.video.hls), 'init.mp4')).size).toBeGreaterThan(0);
  expect(statSync(join(dirname(env.video.hls), 'segment-000.m4s')).size).toBeGreaterThan(0);
});

test.describe('anonymous', () => {
  test('is sent to the login screen', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Вход');
    await expectNoHorizontalScroll(page);
    await expectScreenshot(page, 'login');
  });
});

test.describe('learner on the trusted device', () => {
  test.use({ persona: 'learner' });

  test('opens the learner home', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Учёба');
    await expectNoHorizontalScroll(page);
  });

  test('sees «Нет доступа» in the admin area', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Нет доступа');
  });
});

test.describe('admin', () => {
  test.use({ persona: 'admin' });

  test('opens the admin home', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Кабинет родителя');
  });

  test('the session belongs to the seeded admin', async ({ page, env }) => {
    const res = await page.request.get('/api/auth/me');
    expect(await res.json()).toMatchObject({ id: env.family.admin.id, role: 'admin' });
  });
});

test.describe('trusted device without a session', () => {
  test.use({ persona: 'device' });

  test('lists the learner profiles', async ({ page, env }) => {
    const res = await page.request.get('/api/auth/profiles');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([
      expect.objectContaining({ id: env.family.learner.id, name: env.family.learner.name }),
    ]);
  });
});

test('a fresh installation leads to /setup', async ({ page, freshStack }) => {
  expect(freshStack.setupToken).toBeTruthy();
  await page.goto(`${freshStack.baseURL}/shop`);
  await expect(page).toHaveURL(/\/setup$/);
});
