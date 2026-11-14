// @vitest-environment jsdom
// FEAT-029: the learner's home — header numbers from the wallet, greeting, streak card, the
// counter of the parent's tasks, the next lesson with the live hero, the lesson picker and the
// empty states.
import type { WalletDto } from '@questclass/shared/economy/dto';
import type {
  LearnerProgressDto,
  StreakDto,
  TaskProgressDto,
} from '@questclass/shared/progress/dto';
import type { LearnerTaskDto, SubjectDto } from '@questclass/shared/tasks/dto';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { STREAK_EXPANDED_KEY } from '../src/features/streak/StreakPanel';
import {
  ctaLabel,
  greeting,
  joinLessons,
  lessonDateText,
  lessonStatus,
} from '../src/features/tasks/model';
import { learner, mockApi, noRetryClient, renderRoute, sessionApi, type ApiTable } from './helpers';

const subjects: SubjectDto[] = [
  {
    id: 1,
    key: 'russian',
    name: 'Русский язык',
    icon: 'game/subjects-pixel/russian',
    iconUploadId: null,
    sort: 1,
    archived: false,
  },
  {
    id: 2,
    key: 'math',
    name: 'Математика',
    icon: 'game/subjects-pixel/math',
    iconUploadId: null,
    sort: 2,
    archived: false,
  },
  { id: 3, key: 'own', name: 'Шахматы', icon: null, iconUploadId: null, sort: 3, archived: false },
];

function task(id: number, patch: Partial<LearnerTaskDto> = {}): LearnerTaskDto {
  return {
    id,
    type: 'video_lesson',
    subjectId: 2,
    title: `Урок ${id}`,
    description: '',
    config: {},
    xp: 100,
    coins: 350,
    releaseAt: null,
    lessonDate: null,
    sort: id,
    assigned: false,
    ...patch,
  };
}

function progressOf(t: LearnerTaskDto, patch: Partial<TaskProgressDto> = {}): TaskProgressDto {
  return {
    taskId: t.id,
    title: t.title,
    type: t.type,
    subjectId: t.subjectId,
    assigned: t.assigned,
    epoch: 0,
    state: 'none',
    completed: false,
    score: null,
    total: null,
    startedAt: null,
    completedAt: null,
    closedBy: null,
    closedReason: null,
    available: true,
    lockReason: null,
    ...patch,
  };
}

const wallet: WalletDto = { xp: 1131, coins: 30, level: 4, levelXp: 231, xpToNext: 69 };

const streak: StreakDto = {
  current: 2,
  best: 4,
  days: ['2026-11-13', '2026-11-14'],
  todayDone: true,
  cycleDays: 5,
  cycleProgress: 2,
  nextRewardAt: 5,
  reward: { xp: 200, coins: 200 },
};

function homeApi(
  tasks: LearnerTaskDto[],
  items: TaskProgressDto[],
  patch: Partial<LearnerProgressDto> = {},
  extra: ApiTable = {},
): ApiTable {
  const progress: LearnerProgressDto = {
    mode: 'rotation',
    nextTaskId: null,
    assignedTotal: 0,
    assignedDone: 0,
    tasks: items,
    ...patch,
  };
  return sessionApi(learner, {
    'GET /api/me/wallet': { body: wallet },
    'GET /api/me/streak': { body: streak },
    'GET /api/me/progress': { body: progress },
    'GET /api/tasks': { body: tasks },
    'GET /api/subjects': { body: subjects },
    ...extra,
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe('learner home', () => {
  it('the header shows level, XP and coins from the wallet', async () => {
    mockApi(homeApi([], []));
    renderRoute('/');
    const numbers = await screen.findByRole('group', { name: 'Мои достижения' });
    expect(await within(numbers).findByText('1 131')).toBeInTheDocument();
    expect(within(numbers).getByText('4')).toBeInTheDocument();
    expect(within(numbers).getByText('30')).toBeInTheDocument();
    // No wishes API yet: the chip is hidden rather than showing a made-up number.
    expect(screen.queryByRole('link', { name: /Мои желания/ })).not.toBeInTheDocument();
  });

  it('greets the learner and shows the next lesson with the hero, the CTA and the steps', async () => {
    const next = task(7, {
      title: 'Сложение и вычитание в пределах 100',
      lessonDate: '2026-11-12',
    });
    mockApi(homeApi([task(6), next], [progressOf(task(6)), progressOf(next)], { nextTaskId: 7 }));
    renderRoute('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Саша, начнём?' }),
    ).toBeInTheDocument();
    const card = await screen.findByRole('article', {
      name: 'Сложение и вычитание в пределах 100',
    });
    expect(within(card).getByText('Математика')).toBeInTheDocument();
    expect(within(card).getByText('Урок от 12.11.2026')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Начать урок' })).toHaveAttribute(
      'href',
      '/tasks/7',
    );
    const steps = within(card).getByRole('list', { name: 'Шаги урока' });
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Видео: сейчас', 'Вопросы: впереди', 'Награда: впереди']);
    // The live hero plays by itself on the home (3 s, the manager stops it).
    const hero = within(card).getByRole('figure');
    expect(within(hero).getAllByRole('img', { name: 'Твой герой' }).length).toBeGreaterThan(0);
    expect(hero).toHaveAttribute('data-playing');
  });

  it('counts the parent’s tasks «Задания от родителя: X из Y» only when there are some', async () => {
    const a = task(1, { assigned: true });
    const b = task(2, { assigned: true });
    mockApi(
      homeApi([a, b], [progressOf(a, { completed: true, state: 'passed' }), progressOf(b)], {
        nextTaskId: 2,
        assignedTotal: 2,
        assignedDone: 1,
      }),
    );
    renderRoute('/');
    const bar = await screen.findByRole('progressbar', { name: 'Задания от родителя' });
    expect(bar).toHaveAttribute('aria-valuetext', '1 из 2');
    expect(screen.getByText('Задания от родителя')).toBeInTheDocument();
  });

  it('has no counter without assigned tasks', async () => {
    mockApi(homeApi([task(1)], [progressOf(task(1))], { nextTaskId: 1 }));
    renderRoute('/');
    await screen.findByRole('article', { name: 'Урок 1' });
    expect(screen.queryByRole('progressbar', { name: 'Задания от родителя' })).toBeNull();
  });

  it('the streak card shows N/5 and expands to the days, the bonus and a preview', async () => {
    mockApi(homeApi([], []));
    renderRoute('/');
    const toggle = await screen.findByRole('button', { name: /Серия занятий: 2 из 5 дней/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(localStorage.getItem(STREAK_EXPANDED_KEY)).toBe('1');
    const panel = screen.getByRole('region', { name: 'Серия занятий' });
    expect(within(panel).getByText(/День 2/).textContent).toBe('День 2: засчитан');
    expect(within(panel).getByText(/День 3/).textContent).toBe('День 3');
    expect(within(panel).getByText('За 5 дней подряд')).toBeInTheDocument();
    expect(
      within(panel).getByText('Сегодня день уже засчитан. Приходи завтра!'),
    ).toBeInTheDocument();
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Предпросмотр награды за серию' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('ПРЕДПРОСМОТР')).toBeInTheDocument();
  });

  it('remembers an expanded streak card on this device', async () => {
    localStorage.setItem(STREAK_EXPANDED_KEY, '1');
    mockApi(homeApi([], []));
    renderRoute('/');
    expect(await screen.findByRole('button', { name: /Серия занятий: 2/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('the lesson picker filters by subject and shows each lesson’s status', async () => {
    const done = task(1, { subjectId: 1, title: 'Устное народное творчество' });
    const open = task(2, { title: 'Повторение чисел от 1 до 100' });
    const locked = task(3, { subjectId: 1, title: 'Входная проверочная работа' });
    mockApi(
      homeApi(
        [done, open, locked],
        [
          progressOf(done, { completed: true, state: 'passed' }),
          progressOf(open),
          progressOf(locked, { available: false, lockReason: 'previous' }),
        ],
        { nextTaskId: 2 },
      ),
    );
    renderRoute('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Выбрать предмет или урок' }));
    const dialog = screen.getByRole('dialog', { name: 'Выбери урок' });
    expect(within(dialog).getByText('У каждого предмета своя очередь.')).toBeInTheDocument();
    const subjectsGroup = within(dialog).getByRole('group', { name: 'Предметы' });
    // Only subjects with lessons; «Шахматы» has none.
    expect(
      within(subjectsGroup)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Все предметы', 'Русский язык', 'Математика']);
    const list = within(dialog).getByRole('list', { name: 'Уроки' });
    expect(within(list).getByRole('link', { name: /Повторение чисел/ })).toHaveAttribute(
      'href',
      '/tasks/2',
    );
    expect(
      within(list).getByRole('link', { name: /Устное народное творчество/ }),
    ).toHaveTextContent('Русский язык · Выполнено');
    // A locked lesson is listed but cannot be opened.
    expect(within(list).queryByRole('link', { name: /Входная проверочная/ })).toBeNull();
    expect(within(list).getByText('Русский язык · После предыдущего урока')).toBeInTheDocument();

    await userEvent.click(within(subjectsGroup).getByRole('button', { name: 'Математика' }));
    expect(within(subjectsGroup).getByRole('button', { name: 'Математика' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  });

  it('the picker starts with the parent’s tasks when there are any', async () => {
    const mine = task(1, { assigned: true, title: 'Моё задание' });
    const other = task(2, { title: 'Обычный урок' });
    mockApi(
      homeApi([mine, other], [progressOf(mine), progressOf(other)], {
        nextTaskId: 1,
        assignedTotal: 1,
      }),
    );
    renderRoute('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Выбрать предмет или урок' }));
    const dialog = screen.getByRole('dialog', { name: 'Выбери урок' });
    expect(
      within(dialog).getByText('Это уроки, которые выбрал для тебя родитель.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Мои задания · 1' })).toBeChecked();
    expect(
      within(dialog)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual([expect.stringContaining('Моё задание')]);
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Все уроки' }));
    expect(within(dialog).getAllByRole('link')).toHaveLength(2);
  });

  it('without lessons it says «Скоро новый урок» and offers no picker', async () => {
    mockApi(homeApi([], []));
    renderRoute('/');
    expect(await screen.findByRole('heading', { name: 'Скоро новый урок' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Выбрать предмет или урок' })).toBeNull();
  });

  it('when everything is done it says «Все уроки пройдены!»', async () => {
    const t = task(1);
    mockApi(homeApi([t], [progressOf(t, { completed: true, state: 'passed' })]));
    renderRoute('/');
    expect(await screen.findByRole('heading', { name: 'Все уроки пройдены!' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выбрать предмет или урок' })).toBeInTheDocument();
  });

  it('a failed load can be retried', async () => {
    mockApi(
      homeApi(
        [],
        [],
        {},
        {
          'GET /api/me/progress': { status: 500, body: { error: { code: 'x', message: 'Сбой' } } },
        },
      ),
    );
    renderRoute('/', { client: noRetryClient() });
    expect(await screen.findByRole('alert')).toHaveTextContent('Не получилось загрузить уроки');
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });
});

describe('home model', () => {
  const view = (patch: Partial<LearnerTaskDto>, p: Partial<TaskProgressDto> = {}) =>
    joinLessons([task(1, patch)], [progressOf(task(1, patch), p)], subjects)[0]!;

  it('labels the CTA by type and state', () => {
    expect(ctaLabel(view({}))).toBe('Начать урок');
    expect(ctaLabel(view({}, { state: 'started' }))).toBe('Продолжить урок');
    expect(ctaLabel(view({ type: 'quiz' }))).toBe('Начать тест');
    expect(ctaLabel(view({ type: 'quiz' }, { state: 'started' }))).toBe('Продолжить тест');
    expect(ctaLabel(view({}, { state: 'passed', completed: true }))).toBe('Посмотреть результат');
  });

  it('describes locked lessons by the reason', () => {
    expect(lessonStatus(view({}, { available: false, lockReason: 'rotation' })).text).toBe(
      'Откроется по очереди предметов',
    );
    expect(lessonStatus(view({}, { state: 'started' }))).toEqual({
      status: 'open',
      text: 'Начато',
    });
  });

  it('formats the lesson date and the greeting', () => {
    expect(lessonDateText('2026-11-02')).toBe('Урок от 02.11.2026');
    expect(lessonDateText(null)).toBeNull();
    expect(greeting('Игрок')).toBe('Начнём?');
    expect(greeting(' Саша ')).toBe('Саша, начнём?');
  });
});
