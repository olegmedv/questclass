// FEAT-031: the lesson player against the real API and media — HLS on a throttled «Slow 4G»
// network (playback goes, the percent grows, «Перейти к вопросам» opens, the hint fragment plays
// and closes by itself), the MP4 fallback with the saved place and the strip in fullscreen.
import type { Page } from '@playwright/test';
import { createVideoLesson } from './fixtures/content';
import { expect, expectNoHorizontalScroll, expectScreenshot, test } from './fixtures/learning';

/** Chrome DevTools «Slow 4G»: 150 ms latency, 1.6 Mbit/s down, 750 kbit/s up. */
async function slow4g(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
}

const videoTime = (page: Page) =>
  page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime);

test('HLS on «Slow 4G»: it plays, the percent grows, the questions open, a hint plays', async ({
  page,
  admin,
  learner,
  clips,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const taskId = await createVideoLesson(admin, baseURL ?? '', clips, {
    title: 'Числа до 100',
    learnerId: learner.id,
    kind: 'hls',
  });
  await slow4g(page);
  await page.goto(`/tasks/${taskId}`);
  await expect(page.getByRole('group', { name: 'Видео урока «Числа до 100»' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Просмотрено 0%' })).toHaveAttribute(
    'aria-valuetext',
    'Нужно 70%',
  );
  const go = page.getByRole('button', { name: 'Перейти к вопросам' });
  await expect(go).toBeDisabled();
  await expect
    .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState), {
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(2);
  await expectNoHorizontalScroll(page);
  await expectScreenshot(page, 'video-lesson', { mask: [page.locator('video')] });

  await page.getByRole('button', { name: 'Смотреть' }).click();
  await expect(page.getByRole('button', { name: 'Пауза' })).toBeVisible();
  await expect.poll(() => videoTime(page), { timeout: 30_000 }).toBeGreaterThan(1);
  // At the end of the video the played seconds are reported and the rule is met.
  await expect(
    page.getByRole('progressbar', { name: /Просмотрено (7\d|8\d|9\d|100)%/ }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('✓ Место остановки сохранено')).toBeVisible();
  await expect(go).toBeEnabled();

  await go.click();
  for (let i = 1; i <= 3; i += 1) {
    await expect(page.getByText(`Вопрос ${i} из 3`)).toBeVisible();
    await page
      .getByRole('button', { name: /Мимо \d/ })
      .first()
      .click();
    await page.getByRole('button', { name: /^Ответить/ }).click();
  }
  await expect(page.getByRole('heading', { name: 'Попробуем ещё раз' })).toBeVisible();
  await page.getByRole('button', { name: 'Посмотреть объяснение' }).first().click();
  const hint = page.getByRole('dialog', { name: 'Помощь к вопросу' });
  await expect(hint).toBeVisible();
  // The fragment (1–3 s) starts 3 s early, plays and returns to the result by itself.
  await expect(hint).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Пересдать' })).toBeVisible();
  // Leaving the video for the questions kept the place where it stopped (the end), and the
  // hint fragment (1–3 s) did not move it.
  await page.reload();
  await expect(page.getByText(/Продолжаем с места остановки: 0:05\./)).toBeVisible();
});

test('MP4: plays, keeps the place to resume, the strip stays in fullscreen', async ({
  page,
  admin,
  learner,
  clips,
  baseURL,
}) => {
  test.setTimeout(60_000);
  const taskId = await createVideoLesson(admin, baseURL ?? '', clips, {
    title: 'Сложение столбиком',
    learnerId: learner.id,
    kind: 'mp4',
  });
  await page.goto(`/tasks/${taskId}`);
  expect(await page.locator('video').getAttribute('src')).toMatch(/\/api\/media\/\d+\/video\.mp4$/);
  await page.getByRole('button', { name: 'Смотреть' }).click();
  await expect.poll(() => videoTime(page), { timeout: 20_000 }).toBeGreaterThan(1.2);
  await page.getByRole('button', { name: 'Пауза' }).click();
  await expect(page.getByText('✓ Место остановки сохранено')).toBeVisible();

  await page.reload();
  await expect(page.getByText(/Продолжаем с места остановки: 0:0[1-3]\./)).toBeVisible();
  await expect.poll(() => videoTime(page), { timeout: 20_000 }).toBeGreaterThan(1);

  // The strip: keyboard height, and it is part of the fullscreen frame.
  const handle = page.getByRole('slider', { name: 'Высота чёрной полосы' });
  await handle.focus();
  await page.keyboard.press('ArrowUp');
  await expect(handle).toHaveAttribute('aria-valuenow', '10');
  await page.getByRole('button', { name: 'На весь экран' }).click();
  await expect(page.getByRole('button', { name: 'Свернуть' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.fullscreenElement?.querySelector('[data-testid="shutter"]') !== null,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Свернуть' }).click();
  await expect(page.getByRole('button', { name: 'На весь экран' })).toBeVisible();
});
