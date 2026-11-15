// FEAT-030: taking a quiz against the real attempts engine — a pass with the celebration and the
// reward in the header, a fail followed by the free retry, and used-up retries: the learner asks,
// the parent allows one more attempt.
import { createQuiz, grantRetry } from './fixtures/content';
import { expect, expectNoHorizontalScroll, expectScreenshot, test } from './fixtures/learning';
import type { Page } from '@playwright/test';

/** Answers the current question with the option whose text starts with `prefix`. */
async function answer(page: Page, prefix: 'Верно' | 'Мимо') {
  const counter = page.getByText(/^Вопрос \d из 3$/);
  const before = await counter.textContent();
  await page
    .getByRole('button', { name: new RegExp(`${prefix} \\d`) })
    .first()
    .click();
  await page.getByRole('button', { name: /^Ответить/ }).click();
  if (before !== 'Вопрос 3 из 3') {
    await expect(counter).not.toHaveText(before ?? '');
  }
}

async function answerAll(page: Page, prefix: 'Верно' | 'Мимо') {
  for (let i = 0; i < 3; i += 1) {
    await answer(page, prefix);
  }
}

test('a pass: three answers, the celebration, the reward in the header', async ({
  page,
  admin,
  learner,
}) => {
  const taskId = await createQuiz(admin, {
    title: 'Сложение и вычитание',
    learnerId: learner.id,
    xp: 90,
    coins: 300,
  });
  await page.goto(`/tasks/${taskId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Сложение и вычитание' })).toBeVisible();
  await expect(page.getByText('Награда за пройденный тест')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectScreenshot(page, 'quiz-intro');

  await page.getByRole('button', { name: 'Начать тест' }).click();
  await expect(page.getByText('Вопрос 1 из 3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ответить' })).toBeDisabled();
  await expectNoHorizontalScroll(page);
  await answerAll(page, 'Верно');

  const dialog = page.getByRole('dialog', { name: 'Миссия выполнена!' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('+90 XP')).toBeVisible();
  await dialog.getByRole('button', { name: /Отлично/ }).click();
  const summary = page.getByRole('region', { name: 'Миссия выполнена!' });
  await expect(summary.getByText('Верных ответов: 3 из 3.')).toBeVisible();
  await expectScreenshot(summary, 'quiz-result');

  await summary.getByRole('link', { name: 'К урокам' }).click();
  const numbers = page.getByRole('group', { name: 'Мои достижения' });
  await expect(numbers.getByText('300')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Все уроки пройдены!' })).toBeVisible();
  // The passed quiz opens as its result.
  await page.goto(`/tasks/${taskId}`);
  await expect(page.getByRole('heading', { name: 'Тест пройден!' })).toBeVisible();
});

test('a fail, then the free retry passes', async ({ page, admin, learner }) => {
  const taskId = await createQuiz(admin, { title: 'Числа до 100', learnerId: learner.id });
  await page.goto(`/tasks/${taskId}`);
  await page.getByRole('button', { name: 'Начать тест' }).click();
  await answerAll(page, 'Мимо');
  const summary = page.getByRole('region', { name: 'Попробуем ещё раз' });
  await expect(summary.getByText('Верных ответов: 0 из 3.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Давай разберём' })).toContainText('Верный ответ');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  await summary.getByRole('button', { name: 'Пересдать' }).click();
  await expect(page.getByText('Вопрос 1 из 3')).toBeVisible();
  await answerAll(page, 'Верно');
  await expect(page.getByRole('dialog', { name: 'Миссия выполнена!' })).toBeVisible();
});

test('retries used up: the learner asks, the parent allows one more attempt', async ({
  page,
  admin,
  learner,
}) => {
  const taskId = await createQuiz(admin, { title: 'Задачи на смекалку', learnerId: learner.id });
  await page.goto(`/tasks/${taskId}`);
  await page.getByRole('button', { name: 'Начать тест' }).click();
  await answerAll(page, 'Мимо');
  await page.getByRole('button', { name: 'Пересдать' }).click();
  await answerAll(page, 'Мимо');

  const summary = page.getByRole('region', { name: 'Попробуем ещё раз' });
  await expect(summary.getByText('Новую попытку откроет родитель.')).toBeVisible();
  await expect(summary.getByRole('button', { name: 'Пересдать' })).toHaveCount(0);
  await summary.getByRole('button', { name: 'Попросить пересдачу' }).click();
  await expect(page.getByText('Просьба отправлена. Новую попытку откроет родитель.')).toBeVisible();

  // Without the permission the start is refused, and the request is already waiting.
  await page.reload();
  await page.getByRole('button', { name: 'Продолжить тест' }).click();
  await expect(page.getByRole('heading', { name: 'Новую попытку откроет родитель' })).toBeVisible();
  await expect(page.getByText('Просьба отправлена. Ждём родителя.')).toBeVisible();

  await grantRetry(admin, learner.id, taskId);
  await page.reload();
  await page.getByRole('button', { name: 'Продолжить тест' }).click();
  await expect(page.getByText('Вопрос 1 из 3')).toBeVisible();
  await answerAll(page, 'Верно');
  await expect(page.getByRole('dialog', { name: 'Миссия выполнена!' })).toBeVisible();
});
