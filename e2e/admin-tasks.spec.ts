// FEAT-040: an imported draft is corrected in the admin area — a question, the watch condition,
// the learner — published, and the learner sees it with the corrected question.
import { importVideoLesson, sampleQuestions } from './fixtures/content';
import { expect, expectNoHorizontalScroll, test } from './fixtures/admin';

test('imported draft → fix a question → publish → the learner sees the lesson', async ({
  page,
  browser,
  install,
  env,
}) => {
  test.setTimeout(90_000);
  const learner = await install.call<{ id: number }>('POST', '/api/admin/users', {
    role: 'learner',
    name: 'Саша',
    pin: '2468',
  });
  const taskId = await importVideoLesson(install.api, install.stack.baseURL, env.video, {
    title: 'Как растут растения',
    subjectKey: 'world',
    kind: 'mp4',
    questions: sampleQuestions('Растения'),
  });

  await page.goto('/admin/tasks');
  const row = page.getByRole('row', { name: /Как растут растения/ });
  await expect(row.getByText('Черновик')).toBeVisible();
  await row.getByRole('link', { name: 'Как растут растения' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/tasks/${taskId}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Как растут растения' })).toBeVisible();

  // The import left three questions; the first one is reworded.
  await page.getByRole('button', { name: 'Изменить вопрос 1' }).click();
  const editor = page.getByRole('dialog', { name: 'Изменить вопрос' });
  await editor.getByLabel(/^Вопрос/).fill('Что нужно растению, чтобы расти?');
  await editor.getByRole('button', { name: 'Сохранить' }).click();
  await expect(editor).toBeHidden();
  const first = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Вопрос 1' }) });
  await expect(first.getByText('Что нужно растению, чтобы расти?')).toBeVisible();
  await expect(first.getByText('v2')).toBeVisible();
  await expect(first.getByText('правка родителя')).toBeVisible();

  // Questions open without watching, the lesson goes to Саша.
  await page.getByLabel('Как проверять просмотр').selectOption({ label: 'Без условия' });
  await page.getByRole('button', { name: 'Сохранить настройки' }).click();
  await expect(page.getByText('Настройки задания сохранены')).toBeVisible();
  await page.getByText('Саша', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Саша' })).toBeChecked();

  await page.getByRole('button', { name: 'Опубликовать' }).click();
  await expect(page.getByText('Опубликовано', { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // The learner's tablet: the lesson is there, and its questions are the corrected ones.
  const device = await install.learnerDevice(learner.id, '2468');
  const tablet = await browser.newContext({
    baseURL: install.stack.baseURL,
    storageState: device.storageState(),
  });
  try {
    const kid = await tablet.newPage();
    await kid.goto('/');
    await expect(kid.getByRole('article', { name: 'Как растут растения' })).toBeVisible();
    const attempt = await kid.request.post(`/api/tasks/${taskId}/attempts`);
    expect(attempt.status()).toBe(201);
    const { questions } = (await attempt.json()) as { questions: { text: string }[] };
    expect(questions.map((q) => q.text)).toContain('Что нужно растению, чтобы расти?');
  } finally {
    await tablet.close();
  }
});
