// @vitest-environment jsdom
// FEAT-037: «Мои награды» (experience details, «От родителя», «Билетики») and «Мой прогресс»
// (totals, streak, passed tasks, the history of XP and coins page by page).
import type { LedgerEntryDto } from '@questclass/shared/economy/dto';
import type { LearnerProgressDto, TaskProgressDto } from '@questclass/shared/progress/dto';
import type { AwardDto } from '@questclass/shared/rewards/dto';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dateText, ledgerLabel } from '../src/features/rewards/queries';
import { learner, mockApi, renderRoute, sessionApi, type ApiTable } from './helpers';

const wallet = { xp: 450, coins: 120, level: 2, levelXp: 150, xpToNext: 150 };

function award(id: number, patch: Partial<AwardDto> = {}): AwardDto {
  return {
    id,
    learnerId: learner.id,
    reasonId: 1,
    reasonName: 'Домашняя работа',
    title: `Прописи ${id}`,
    date: '2026-11-13',
    subjectId: 2,
    subjectName: 'Русский язык',
    taskId: null,
    xp: 50,
    coins: 10,
    note: null,
    ledgerId: 100 + id,
    at: '2026-11-13T15:00:00Z',
    cancelledAt: null,
    createdBy: 1,
    ...patch,
  };
}

function entry(id: number, patch: Partial<LedgerEntryDto>): LedgerEntryDto {
  return {
    id,
    at: '2026-11-14T10:00:00Z',
    xp: 0,
    coins: 0,
    sourceType: 'award',
    sourceId: null,
    note: null,
    reversesId: null,
    reversedById: null,
    createdBy: null,
    ...patch,
  };
}

const passed: TaskProgressDto = {
  taskId: 5,
  title: 'Сложение в пределах 100',
  type: 'quiz',
  subjectId: 1,
  assigned: true,
  epoch: 0,
  state: 'passed',
  completed: true,
  score: 3,
  total: 3,
  startedAt: '2026-11-14T09:00:00Z',
  completedAt: '2026-11-14T09:10:00Z',
  closedBy: null,
  closedReason: null,
  available: true,
  lockReason: null,
};

const progress: LearnerProgressDto = {
  mode: 'rotation',
  nextTaskId: null,
  assignedTotal: 1,
  assignedDone: 1,
  tasks: [passed, { ...passed, taskId: 6, title: 'Не начато', completed: false, state: 'none' }],
};

const streak = {
  current: 1,
  best: 1,
  days: ['2026-11-14'],
  todayDone: true,
  cycleDays: 5,
  cycleProgress: 1,
  nextRewardAt: 5,
  reward: { xp: 200, coins: 200 },
};

function rewardsApi(extra: ApiTable = {}): ApiTable {
  return sessionApi(learner, {
    'GET /api/me/wallet': { body: wallet },
    'GET /api/me/wishes': { body: { groups: [], history: { items: [], nextCursor: null } } },
    'GET /api/me/awards': { body: { items: [], nextCursor: null } },
    ...extra,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('«Мои награды»', () => {
  it('shows the experience and the parent’s awards, 20 at a time; a cancelled one is marked', async () => {
    const { calls } = mockApi(
      rewardsApi({
        'GET /api/me/awards': () => {
          const last = calls.filter((c) => c.path.startsWith('/api/me/awards')).at(-1);
          return last?.path.includes('cursor=2')
            ? { body: { items: [award(1)], nextCursor: null } }
            : {
                body: {
                  items: [
                    award(3, { cancelledAt: '2026-11-14T08:00:00Z' }),
                    award(2, { note: 'Молодец!' }),
                  ],
                  nextCursor: '2',
                },
              };
        },
      }),
    );
    renderRoute('/rewards');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Мои награды' }),
    ).toBeInTheDocument();
    const experience = await screen.findByRole('region', { name: 'Мой опыт' });
    expect(within(experience).getByRole('heading', { name: 'Уровень 2' })).toBeInTheDocument();
    expect(within(experience).getByText('450 XP всего')).toBeInTheDocument();
    expect(within(experience).getByRole('progressbar', { name: 'До уровня 3' })).toHaveAttribute(
      'aria-valuetext',
      '150 / 300 XP · до уровня 3',
    );
    expect(within(experience).getByRole('link', { name: 'Мой прогресс' })).toHaveAttribute(
      'href',
      '/progress',
    );
    expect(screen.getByRole('tab', { name: 'От родителя' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    const list = await screen.findByRole('list', { name: 'Награды от родителя' });
    const cancelled = within(list).getByRole('article', { name: 'Прописи 3' });
    expect(within(cancelled).getByText('Отменено')).toBeInTheDocument();
    expect(within(cancelled).getByText('Было начислено')).toBeInTheDocument();
    const kept = within(list).getByRole('article', { name: 'Прописи 2' });
    expect(
      within(kept).getByText('Домашняя работа · 13.11.2026 · Русский язык'),
    ).toBeInTheDocument();
    expect(within(kept).getByText('Молодец!')).toBeInTheDocument();
    expect(within(kept).getByText('+50 XP')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));
    await waitFor(() => expect(within(list).getAllByRole('article')).toHaveLength(3));
    expect(calls.some((c) => c.path === '/api/me/awards?limit=20&cursor=2')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull();
  });

  it('without awards says where they will appear; «Билетики» show the wishes', async () => {
    const { router } = (() => {
      mockApi(rewardsApi());
      return renderRoute('/rewards');
    })();
    expect(await screen.findByText('Здесь будут награды от родителя')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Билетики' }));
    expect(await screen.findByRole('heading', { name: 'Купленные желания' })).toBeInTheDocument();
    expect(screen.getByText('Пока нет неиспользованных наград')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?tab=tickets');
  });

  it('opens on «Билетики» by the link', async () => {
    mockApi(rewardsApi());
    renderRoute('/rewards?tab=tickets');
    expect(await screen.findByRole('tab', { name: 'Билетики' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByRole('heading', { name: 'Купленные желания' })).toBeInTheDocument();
  });
});

describe('«Мой прогресс»', () => {
  it('shows totals, the streak, passed tasks and the history page by page', async () => {
    const { calls } = mockApi(
      rewardsApi({
        'GET /api/me/progress': { body: progress },
        'GET /api/me/streak': { body: streak },
        'GET /api/tasks': {
          body: [
            {
              id: 5,
              type: 'quiz',
              subjectId: 1,
              title: 'Сложение в пределах 100',
              description: '',
              config: {},
              xp: 100,
              coins: 350,
              releaseAt: null,
              lessonDate: null,
              sort: 0,
              assigned: true,
            },
          ],
        },
        'GET /api/subjects': {
          body: [{ id: 1, key: 'math', name: 'Математика', icon: null, sort: 1, archived: false }],
        },
        'GET /api/me/ledger': () => {
          const last = calls.filter((c) => c.path.startsWith('/api/me/ledger')).at(-1);
          return last?.path.includes('cursor=8')
            ? {
                body: {
                  items: [entry(7, { sourceType: 'award', note: 'Домашка', xp: 50, coins: 10 })],
                  nextCursor: null,
                },
              }
            : {
                body: {
                  items: [
                    entry(10, { sourceType: 'purchase', note: 'Космонавт', coins: -40 }),
                    entry(9, {
                      sourceType: 'task',
                      sourceId: '5',
                      note: 'Награда за задание',
                      xp: 100,
                      coins: 350,
                    }),
                    entry(8, {
                      sourceType: 'streak',
                      note: 'Серия занятий: 5 дней подряд',
                      xp: 200,
                      coins: 200,
                    }),
                  ],
                  nextCursor: '8',
                },
              };
        },
      }),
    );
    renderRoute('/progress');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Мой прогресс' }),
    ).toBeInTheDocument();
    const totals = screen.getByRole('list', { name: 'Итоги' });
    await waitFor(() => expect(within(totals).getByText('До 3-го — 150 XP')).toBeInTheDocument());
    expect(within(totals).getByText('Заданий пройдено')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Серия занятий/ })).toBeInTheDocument();

    const done = await screen.findByRole('list', { name: 'Пройденные задания' });
    expect(within(done).getAllByRole('listitem')).toHaveLength(1);
    expect(within(done).getByText('Математика · 14.11.2026 · верных 3 из 3')).toBeInTheDocument();

    const history = await screen.findByRole('region', { name: 'История начислений' });
    await waitFor(() => expect(within(history).getAllByRole('row')).toHaveLength(4));
    expect(within(history).getByText('Покупка: Космонавт')).toBeInTheDocument();
    expect(within(history).getByText('-40')).toBeInTheDocument();
    expect(
      within(history).getByText('Награда за задание: Сложение в пределах 100'),
    ).toBeInTheDocument();
    expect(within(history).getByText('Серия занятий: 5 дней подряд')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));
    await waitFor(() => expect(within(history).getAllByRole('row')).toHaveLength(5));
    expect(within(history).getByText('От родителя: Домашка')).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/api/me/ledger?limit=20&cursor=8')).toBe(true);
  });

  it('names each kind of entry for the learner', () => {
    const titles = new Map([['5', 'Урок про дроби']]);
    expect(
      ledgerLabel(
        entry(1, { sourceType: 'task', sourceId: '5', note: 'Награда за задание' }),
        titles,
      ),
    ).toBe('Награда за задание: Урок про дроби');
    expect(
      ledgerLabel(
        entry(1, { sourceType: 'task', sourceId: '9', note: 'Награда за задание' }),
        titles,
      ),
    ).toBe('Награда за задание');
    expect(ledgerLabel(entry(1, { sourceType: 'chore', note: 'Убрать игрушки' }), titles)).toBe(
      'Дело: Убрать игрушки',
    );
    expect(
      ledgerLabel(
        entry(1, { sourceType: 'award', note: 'Отмена: Прописи', reversesId: 3 }),
        titles,
      ),
    ).toBe('Отмена: Прописи');
    expect(ledgerLabel(entry(1, { sourceType: 'coins_reset', note: null }), titles)).toBe(
      'Монеты обнулены',
    );
    expect(dateText('2026-11-03')).toBe('03.11.2026');
  });
});
