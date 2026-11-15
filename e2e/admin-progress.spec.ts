// FEAT-041: the parent's hand on progress against the real API — a failed test asks for a retry
// and gets it, a task is closed with its reward and reopened, a chore is approved, an award is
// given and cancelled.
import { request as playwrightRequest } from '@playwright/test';
import { createQuiz } from './fixtures/content';
import { expect, expectNoHorizontalScroll, test } from './fixtures/admin';

test('progress, reviews and awards of a learner', async ({ page, install }) => {
  test.setTimeout(90_000);
  const learner = await install.call<{ id: number }>('POST', '/api/admin/users', {
    role: 'learner',
    name: 'Саша',
    pin: '2468',
  });
  const quizId = await createQuiz(install.api, { title: 'Сложение до 100', learnerId: learner.id });
  const chore = await install.call<{ id: number }>('POST', '/api/admin/tasks', {
    type: 'chore',
    title: 'Убрать игрушки',
  });
  await install.call('PATCH', `/api/admin/tasks/${chore.id}`, { status: 'published' });

  // On the tablet: the test is failed twice (no free retry left), a retry is asked, the chore
  // is reported.
  const device = await install.learnerDevice(learner.id, '2468');
  const kid = await playwrightRequest.newContext({
    baseURL: install.stack.baseURL,
    storageState: device.storageState(),
  });
  try {
    for (let i = 0; i < 2; i++) {
      const attempt = (await (await kid.post(`/api/tasks/${quizId}/attempts`)).json()) as {
        id: number;
        questions: { id: number; options: { id: string; text: string }[] }[];
      };
      for (const question of attempt.questions) {
        const wrong = question.options.find((option) => option.text.startsWith('Мимо'));
        await kid.put(`/api/attempts/${attempt.id}/answers/${question.id}`, {
          data: { optionId: wrong?.id },
        });
      }
      expect((await kid.post(`/api/attempts/${attempt.id}/completion`)).ok()).toBe(true);
    }
    expect((await kid.post(`/api/tasks/${quizId}/retry-requests`)).status()).toBe(201);
    expect((await kid.post(`/api/tasks/${chore.id}/chore-completions`)).status()).toBe(201);
  } finally {
    await kid.dispose();
  }

  // Reviews: the chore is approved, the retry granted.
  await page.goto('/admin/reviews');
  await page.getByRole('button', { name: 'Засчитать: Убрать игрушки', exact: true }).click();
  await expect(page.getByText(/Засчитано/).first()).toBeVisible();
  await page.getByRole('tab', { name: /Пересдачи/ }).click();
  await page.getByRole('button', { name: 'Разрешить пересдачу: Сложение до 100' }).click();
  await expect(page.getByText('Пересдача разрешена')).toBeVisible();
  await expect(page.getByText('Просьб нет')).toBeVisible();

  // Progress: the test is closed with its reward, then reopened.
  await page.goto('/admin/progress');
  await expect(page).toHaveURL(new RegExp(`/admin/progress/${learner.id}$`));
  const row = page
    .getByRole('region', { name: 'Задания: Саша' })
    .getByRole('row', { name: /Сложение до 100/ });
  await expect(row.getByText('Начато')).toBeVisible();
  await row.getByRole('button', { name: 'Действия: Сложение до 100' }).click();
  await page.getByRole('menuitem', { name: 'Закрыть…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть задание' }).click();
  await expect(page.getByText('Закрыто. Начислено: +100 XP, +350 монет')).toBeVisible();
  await expect(row.getByText('Закрыто родителем')).toBeVisible();
  await row.getByRole('button', { name: 'Действия: Сложение до 100' }).click();
  await page.getByRole('menuitem', { name: 'Переоткрыть («Пройти с мамой»)' }).click();
  await expect(row.getByText('пройдено раньше')).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Список попыток' })
      .getByRole('link', { name: 'Сложение до 100' }),
  ).toHaveCount(2);
  await expectNoHorizontalScroll(page);

  // An award «От родителя», then its cancellation.
  await page.goto('/admin/awards');
  const form = page.getByRole('form', { name: 'Начислить' });
  await form.getByLabel(/Название/).fill('Помог бабушке');
  await form.getByLabel('Монеты').fill('25');
  await form.getByLabel('Монеты').blur();
  await form.getByRole('button', { name: 'Начислить' }).click();
  await expect(page.getByText('Саша: +0 XP, +25 монет')).toBeVisible();
  const list = page.getByRole('region', { name: 'Выданные награды' });
  await list.getByRole('button', { name: 'Отменить: Помог бабушке' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Отменить награду' }).click();
  await expect(list.getByText('Отменено')).toBeVisible();
});
