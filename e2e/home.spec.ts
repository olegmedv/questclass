// FEAT-029: the learner's home against the real API — the next lesson with the parent's tasks
// counter, the streak card, the lesson picker, the live hero and the empty home.
import { createQuiz } from './fixtures/content';
import { buyItem, grantCoins, wearLook } from './fixtures/wardrobe';
import { expect, expectNoHorizontalScroll, expectScreenshot, test } from './fixtures/learning';

test('the next lesson, the parent’s tasks, the streak and the lesson picker', async ({
  page,
  admin,
  learner,
}) => {
  const first = await createQuiz(admin, {
    title: 'Сложение и вычитание в пределах 100',
    subjectKey: 'math',
    learnerId: learner.id,
    lessonDate: '2026-11-12',
  });
  await createQuiz(admin, {
    title: 'Что нас окружает. Повторение',
    subjectKey: 'world',
    learnerId: learner.id,
  });
  // A still hero keeps the screenshots stable (the live hero has its own test below).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Саша, начнём?' })).toBeVisible();
  const numbers = page.getByRole('group', { name: 'Мои достижения' });
  await expect(numbers.getByText('Уровень:', { exact: false })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Задания от родителя' })).toHaveAttribute(
    'aria-valuetext',
    '0 из 2',
  );
  const card = page.getByRole('article', { name: 'Сложение и вычитание в пределах 100' });
  await expect(card.getByText('Урок от 12.11.2026 · Задание от родителя')).toBeVisible();
  await expect(card.getByRole('link', { name: 'Начать тест' })).toHaveAttribute(
    'href',
    `/tasks/${first}`,
  );
  await expect(card.getByRole('img', { name: 'Твой герой' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectScreenshot(page, 'home');

  const streak = page.getByRole('button', { name: /Серия занятий/ });
  await streak.click();
  await expect(streak).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('region', { name: 'Серия занятий' })).toContainText(
    'За 5 дней подряд',
  );
  await expectScreenshot(page, 'home-streak');
  // The expanded card is remembered on this device.
  await page.reload();
  await expect(page.getByRole('button', { name: /Серия занятий/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );

  await page.getByRole('button', { name: 'Выбрать предмет или урок' }).click();
  const picker = page.getByRole('dialog', { name: 'Выбери урок' });
  await expect(picker.getByRole('radio', { name: 'Мои задания · 2' })).toBeChecked();
  await picker.getByRole('button', { name: 'Окружающий мир' }).click();
  await expect(picker.getByRole('list', { name: 'Уроки' }).getByRole('listitem')).toHaveCount(1);
  await expectNoHorizontalScroll(page);
  await expectScreenshot(picker, 'home-picker');
  await picker.getByRole('link', { name: /Что нас окружает/ }).click();
  await expect(page).toHaveURL(/\/tasks\/\d+$/);
});

test('the hero on the home comes alive by itself for 3 seconds', async ({
  page,
  admin,
  learner,
}) => {
  await createQuiz(admin, { title: 'Урок с героем', learnerId: learner.id });
  // The card shows the worn hero: a live one greets the learner.
  await grantCoins(admin, learner.id, 100);
  await wearLook(page, await buyItem(page, 'Синий исследователь'));
  await page.goto('/');
  const hero = page.getByRole('article', { name: 'Урок с героем' }).getByRole('figure');
  await expect(hero).toHaveAttribute('data-moving', 'true');
  // 3 s from the moment the animation loaded, then the poster again.
  await expect(hero).not.toHaveAttribute('data-playing', /.*/, { timeout: 6_000 });
});

test('an empty home says that a new lesson is coming', async ({ page, learner }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: `${learner.name}, начнём?` }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Скоро новый урок' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Выбрать предмет или урок' })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectScreenshot(page, 'home-empty');
});
