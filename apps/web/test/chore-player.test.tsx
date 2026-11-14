// @vitest-environment jsdom
// FEAT-032: the chore Player — «Я сделал» → «Ждёт проверки» → «Засчитано» (celebrated once on
// this device) or «Не засчитано: комментарий»; a repeatable chore follows its period.
import type { LearnerProgressDto, TaskProgressDto } from '@questclass/shared/progress/dto';
import type { ChoreRepeat } from '@questclass/shared/task-types/chore/contract';
import type { ChoreCompletionDto, ChoreStatusDto } from '@questclass/shared/task-types/chore/dto';
import type { LearnerTaskDto } from '@questclass/shared/tasks/dto';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { choreCelebrationKey, shouldCelebrate } from '../src/task-types/chore/Player';
import { errorReply, learner, mockApi, renderRoute, sessionApi, type ApiTable } from './helpers';

const task: LearnerTaskDto = {
  id: 7,
  type: 'chore',
  subjectId: null,
  title: 'Убрать игрушки',
  description: 'Все игрушки — на свои места.',
  config: { repeat: 'once' },
  xp: 20,
  coins: 15,
  releaseAt: null,
  lessonDate: null,
  sort: 0,
  assigned: true,
};

function progress(patch: Partial<TaskProgressDto> = {}): LearnerProgressDto {
  return {
    mode: 'rotation',
    nextTaskId: 7,
    assignedTotal: 1,
    assignedDone: 0,
    tasks: [
      {
        taskId: 7,
        title: task.title,
        type: 'chore',
        subjectId: null,
        assigned: true,
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
      },
    ],
  };
}

const NOW = Date.now();
const recently = new Date(NOW - 60_000).toISOString();

function completion(patch: Partial<ChoreCompletionDto> = {}): ChoreCompletionDto {
  return {
    id: 31,
    learnerId: learner.id,
    taskId: 7,
    taskTitle: task.title,
    periodKey: 'once',
    status: 'pending',
    note: null,
    createdAt: recently,
    reviewedAt: null,
    reviewedBy: null,
    reward: null,
    ...patch,
  };
}

const approved = (patch: Partial<ChoreCompletionDto> = {}) =>
  completion({
    status: 'approved',
    reviewedAt: recently,
    reviewedBy: 1,
    reward: { xp: 20, coins: 15 },
    ...patch,
  });

function choreStatus(
  current: ChoreCompletionDto | null,
  { repeat = 'once', items }: { repeat?: ChoreRepeat; items?: ChoreCompletionDto[] } = {},
): ChoreStatusDto {
  return {
    taskId: 7,
    repeat,
    periodKey: current?.periodKey ?? 'once',
    current,
    items: items ?? (current ? [current] : []),
  };
}

function choreApi(
  status: ChoreStatusDto | (() => ChoreStatusDto),
  extra: ApiTable = {},
  progressPatch: Partial<TaskProgressDto> = {},
  config: LearnerTaskDto['config'] = { repeat: 'once' },
): ApiTable {
  return sessionApi(learner, {
    'GET /api/tasks/7': { body: { ...task, config } },
    'GET /api/subjects': { body: [] },
    'GET /api/me/progress': { body: progress(progressPatch) },
    'GET /api/me/wallet': { body: { xp: 0, coins: 0, level: 1, levelXp: 0, xpToNext: 300 } },
    'GET /api/tasks/7/chore-completions': () => ({
      body: typeof status === 'function' ? status() : status,
    }),
    ...extra,
  });
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('chore player', () => {
  it('«Я сделал» sends the report once and shows «Ждёт проверки»', async () => {
    let current: ChoreCompletionDto | null = null;
    const { calls } = mockApi(
      choreApi(() => choreStatus(current), {
        'POST /api/tasks/7/chore-completions': () => {
          current = completion();
          return { status: 201, body: current };
        },
      }),
    );
    renderRoute('/tasks/7');
    expect(await screen.findByRole('heading', { level: 1, name: task.title })).toBeInTheDocument();
    expect(await screen.findByText('Все игрушки — на свои места.')).toBeInTheDocument();
    expect(screen.getByText('Награда за дело')).toBeInTheDocument();
    expect(screen.getByText('+20 XP')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Шаги задания' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Я сделал' }));
    expect(await screen.findByRole('heading', { name: 'Ждёт проверки' })).toBeInTheDocument();
    expect(screen.getByText(/Родитель проверит и начислит награду/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Я сделал' })).toBeNull();
    expect(
      calls.filter((c) => c.method === 'POST' && c.path === '/api/tasks/7/chore-completions'),
    ).toHaveLength(1);
  });

  it('an approval is celebrated once on this device and shows «Засчитано» with the reward', async () => {
    mockApi(choreApi(choreStatus(approved())));
    const first = renderRoute('/tasks/7');
    const dialog = await screen.findByRole('dialog', { name: 'Засчитано!' });
    expect(within(dialog).getByText('+20 XP')).toBeInTheDocument();
    expect(within(dialog).getByText('+15 монет')).toBeInTheDocument();
    expect(localStorage.getItem(choreCelebrationKey(approved()))).toBe('1');
    await userEvent.click(within(dialog).getByRole('button', { name: /Отлично/ }));
    expect(screen.getByRole('heading', { name: 'Засчитано' })).toBeInTheDocument();
    expect(screen.getByText('Родитель подтвердил: дело сделано.')).toBeInTheDocument();
    first.unmount();

    // Opening it again on the same device: no second celebration.
    renderRoute('/tasks/7');
    expect(await screen.findByRole('heading', { name: 'Засчитано' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a waiting report turns into «Засчитано» when the parent approves it', async () => {
    let current = completion();
    mockApi(choreApi(() => choreStatus(current)));
    const { client } = renderRoute('/tasks/7');
    expect(await screen.findByRole('heading', { name: 'Ждёт проверки' })).toBeInTheDocument();
    current = approved();
    // The Player re-checks a waiting report (every 30 s and on returning to the tab).
    await client.refetchQueries({ queryKey: ['me', 'chores', 7] });
    expect(await screen.findByRole('dialog', { name: 'Засчитано!' })).toBeInTheDocument();
  });

  it('«Не засчитано» shows the parent’s comment and lets the learner report again', async () => {
    let current: ChoreCompletionDto = completion({
      status: 'rejected',
      note: 'Под кроватью ещё машинки',
      reviewedAt: recently,
      reviewedBy: 1,
    });
    const { calls } = mockApi(
      choreApi(() => choreStatus(current), {
        'POST /api/tasks/7/chore-completions': () => {
          current = completion({ id: 32 });
          return { status: 201, body: current };
        },
      }),
    );
    renderRoute('/tasks/7');
    expect(await screen.findByRole('heading', { name: 'Не засчитано' })).toBeInTheDocument();
    expect(screen.getByText('Комментарий родителя: Под кроватью ещё машинки')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Я сделал' }));
    expect(await screen.findByRole('heading', { name: 'Ждёт проверки' })).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('a daily chore approved today waits for tomorrow; a new day opens «Я сделал» again', async () => {
    const yesterday = approved({
      id: 30,
      periodKey: '2026-11-13',
      createdAt: '2026-11-13T09:00:00Z',
    });
    const today = approved({ id: 31, periodKey: '2026-11-14' });
    let current: ChoreCompletionDto | null = today;
    mockApi(
      choreApi(
        () =>
          choreStatus(current, {
            repeat: 'daily',
            items: current ? [current, yesterday] : [yesterday],
          }),
        {},
        {},
        { repeat: 'daily' },
      ),
    );
    localStorage.setItem(choreCelebrationKey(today), '1');
    const { client } = renderRoute('/tasks/7');
    expect(await screen.findByRole('heading', { name: 'Засчитано' })).toBeInTheDocument();
    expect(screen.getByText('Сегодня уже засчитано. Завтра можно снова.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Я сделал' })).toBeNull();
    const history = screen.getByRole('list', { name: 'Раньше' });
    expect(within(history).getAllByRole('listitem')).toHaveLength(1);
    expect(within(history).getByText('13.11.2026')).toBeInTheDocument();

    // The next day: the period has no report yet.
    current = null;
    await client.refetchQueries({ queryKey: ['me', 'chores', 7] });
    expect(await screen.findByRole('button', { name: 'Я сделал' })).toBeEnabled();
    expect(
      screen.getByText('Это дело можно делать каждый день. Награда — один раз в день.'),
    ).toBeInTheDocument();
  });

  it('a locked chore cannot be reported; a server refusal is explained', async () => {
    mockApi(choreApi(choreStatus(null), {}, { available: false, lockReason: 'previous' }));
    renderRoute('/tasks/7');
    expect(await screen.findByRole('button', { name: 'Я сделал' })).toBeDisabled();
    expect(screen.getByText('Это дело ещё не открыто.')).toBeInTheDocument();
  });

  it('a refused report (locked meanwhile) shows a message and keeps the button', async () => {
    mockApi(
      choreApi(choreStatus(null), {
        'POST /api/tasks/7/chore-completions': errorReply(
          409,
          'task_locked',
          'Это дело ещё не открыто',
        ),
      }),
    );
    renderRoute('/tasks/7');
    await userEvent.click(await screen.findByRole('button', { name: 'Я сделал' }));
    await waitFor(() => expect(screen.getByText('Это дело ещё не открыто.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Я сделал' })).toBeInTheDocument();
  });

  it('celebrates only recent approvals not seen on this device', () => {
    const now = Date.parse('2026-11-14T12:00:00Z');
    expect(shouldCelebrate(null, now)).toBe(false);
    expect(shouldCelebrate(completion(), now)).toBe(false);
    const fresh = approved({ reviewedAt: '2026-11-14T11:00:00Z' });
    expect(shouldCelebrate(fresh, now)).toBe(true);
    expect(shouldCelebrate(approved({ reviewedAt: '2026-11-01T11:00:00Z' }), now)).toBe(false);
    localStorage.setItem(choreCelebrationKey(fresh), '1');
    expect(shouldCelebrate(fresh, now)).toBe(false);
  });
});
