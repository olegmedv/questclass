// FEAT-037: «Мои награды» and «Мой прогресс» against the real API — the parent's award, the
// experience details, the tickets tab, the passed lesson and the history of XP and coins.
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { createQuiz } from './fixtures/content';
import { expect, expectNoHorizontalScroll, expectScreenshot, test } from './fixtures/learning';
import { buyItem, grantCoins } from './fixtures/wardrobe';

/** Passes a quiz of `sampleQuestions` (the right answer is always `a`) through the API. */
async function passQuiz(page: Page, taskId: number): Promise<void> {
  const started = await page.request.post(`/api/tasks/${taskId}/attempts`);
  expect(started.status(), await started.text()).toBe(201);
  const attempt = (await started.json()) as { id: number; questions: { id: number }[] };
  for (const question of attempt.questions) {
    const answered = await page.request.put(`/api/attempts/${attempt.id}/answers/${question.id}`, {
      data: { optionId: 'a' },
    });
    expect(answered.ok(), await answered.text()).toBe(true);
  }
  const finished = await page.request.post(`/api/attempts/${attempt.id}/completion`);
  expect(finished.ok(), await finished.text()).toBe(true);
}

test('the parent’s award, the experience, the tickets and the progress with its history', async ({
  page,
  admin,
  learner,
}) => {
  const awarded = await admin.post(`/api/admin/learners/${learner.id}/awards`, {
    data: {
      reasonId: 'custom',
      title: 'Прописи без ошибок',
      date: '2026-11-13',
      xp: 50,
      coins: 30,
      requestId: randomUUID(),
    },
  });
  expect(awarded.status(), await awarded.text()).toBe(201);
  const taskId = await createQuiz(admin, {
    title: 'Сложение в пределах 100',
    subjectKey: 'math',
    learnerId: learner.id,
    xp: 300,
    coins: 350,
  });
  await passQuiz(page, taskId);
  await grantCoins(admin, learner.id, 300);
  await buyItem(page, '300 Robux');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/rewards');
  await expect(page.getByRole('heading', { level: 1, name: 'Мои награды' })).toBeVisible();
  const experience = page.getByRole('region', { name: 'Мой опыт' });
  // 50 XP of the award + 300 of the lesson: level 2 and 50 of the next 300.
  await expect(experience.getByRole('heading', { name: 'Уровень 2' })).toBeVisible();
  await expect(experience.getByText('350 XP всего')).toBeVisible();
  const award = page.getByRole('article', { name: 'Прописи без ошибок' });
  await expect(award.getByText('Своя награда · 13.11.2026 · Без предмета')).toBeVisible();
  await expect(award.getByText('+50 XP')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectScreenshot(page, 'rewards');

  await page.getByRole('tab', { name: 'Билетики' }).click();
  await expect(page).toHaveURL(/\?tab=tickets$/);
  await expect(
    page.getByRole('article', { name: 'Robux' }).getByText('300 Robux', { exact: true }),
  ).toBeVisible();

  await experience.getByRole('link', { name: 'Мой прогресс' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Мой прогресс' })).toBeVisible();
  const done = page.getByRole('list', { name: 'Пройденные задания' });
  await expect(done.getByText('Сложение в пределах 100')).toBeVisible();
  const history = page.getByRole('region', { name: 'История начислений' });
  await expect(history.getByText('Награда за задание: Сложение в пределах 100')).toBeVisible();
  await expect(history.getByText('От родителя: Прописи без ошибок')).toBeVisible();
  await expect(history.getByText('Покупка: 300 Robux')).toBeVisible();
  await expect(page.getByRole('button', { name: /Серия занятий/ })).toBeVisible();
  await expectNoHorizontalScroll(page);
  // Dates of today's entries change from day to day: they are painted over.
  await expectScreenshot(page, 'progress', {
    mask: [history.locator('.qc-text[data-size="xs"]'), done.locator('.qc-action-row-description')],
  });
});
