// @vitest-environment jsdom
// FEAT-041: a learner's progress with the parent's actions (close, reopen, reset, coins, retry,
// watch confirmation through the type plugin), attempt details, the review queues, awards with
// their cancellation and the reasons.
import type { AdminAttemptDto, AttemptSummaryDto } from '@questclass/shared/attempts/dto';
import type { UserDto } from '@questclass/shared/auth/dto';
import type { LearnerProgressDto, TaskProgressDto } from '@questclass/shared/progress/dto';
import type { AwardDto, RewardReasonDto } from '@questclass/shared/rewards/dto';
import type { ChoreCompletionDto } from '@questclass/shared/task-types/chore/dto';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { admin, errorReply, mockApi, renderRoute, sessionApi, type ApiTable } from './helpers';

const user = (id: number, name: string, role: UserDto['role'] = 'learner'): UserDto => ({
  id,
  role,
  name,
  login: role === 'admin' ? 'mama' : null,
  avatar: null,
  active: true,
  hasPin: role === 'learner',
  createdAt: '2026-11-01T10:00:00.000Z',
  deactivatedAt: null,
});
const users = [user(1, 'Мама', 'admin'), user(2, 'Саша'), user(3, 'Маша')];

const row = (
  patch: Partial<TaskProgressDto> & Pick<TaskProgressDto, 'taskId' | 'title'>,
): TaskProgressDto => ({
  type: 'quiz',
  subjectId: 1,
  assigned: false,
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
});

const progress: LearnerProgressDto = {
  mode: 'rotation',
  nextTaskId: 10,
  assignedTotal: 1,
  assignedDone: 0,
  tasks: [
    row({
      taskId: 10,
      title: 'Сложение до 100',
      state: 'started',
      score: 1,
      total: 3,
      assigned: true,
    }),
    row({
      taskId: 11,
      title: 'Как растут растения',
      type: 'video_lesson',
      available: false,
      lockReason: 'rotation',
    }),
    row({ taskId: 12, title: 'Буква А', state: 'passed', completed: true, score: 3, total: 3 }),
  ],
};

const attempts: AttemptSummaryDto[] = [
  {
    id: 50,
    taskId: 10,
    epoch: 0,
    status: 'finished',
    startedAt: '2026-11-14T10:00:00.000Z',
    finishedAt: '2026-11-14T10:05:00.000Z',
    correct: 1,
    total: 3,
    passed: false,
  },
];

function progressApi(extra: ApiTable = {}): ApiTable {
  return sessionApi(admin, {
    'GET /api/admin/users': { body: users },
    'GET /api/admin/learners/2/progress': { body: progress },
    'GET /api/admin/learners/2/streak': {
      body: {
        current: 3,
        best: 5,
        days: [],
        todayDone: true,
        cycleDays: 5,
        cycleProgress: 3,
        nextRewardAt: 5,
        reward: { xp: 200, coins: 200 },
      },
    },
    'GET /api/admin/learners/2/attempts': { body: attempts },
    ...extra,
  });
}

async function openMenu(title: string, item: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Действия: ${title}` }));
  await userEvent.click(await screen.findByRole('menuitem', { name: item }));
}

describe('/admin/progress', () => {
  it('opens the first learner and shows states, results and locks', async () => {
    mockApi(progressApi());
    const { router } = renderRoute('/admin/progress');
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/progress/2'));
    const table = await screen.findByRole('region', { name: 'Задания: Саша' });
    const sum = within(table)
      .getByRole('link', { name: 'Сложение до 100' })
      .closest('tr') as HTMLElement;
    expect(within(sum).getByText('Начато')).toBeInTheDocument();
    expect(within(sum).getByText('1 из 3')).toBeInTheDocument();
    expect(within(sum).getByText(/назначено/)).toBeInTheDocument();
    const video = within(table)
      .getByRole('link', { name: 'Как растут растения' })
      .closest('tr') as HTMLElement;
    expect(within(video).getByText('закрыто: ждёт очереди в круге предметов')).toBeInTheDocument();
    // Watch confirmation comes from the video lesson plugin, only on its rows.
    expect(
      within(video).getByRole('button', { name: 'Подтвердить просмотр: Как растут растения' }),
    ).toBeVisible();
    expect(
      within(sum).queryByRole('button', { name: /Подтвердить просмотр/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Как открываются задания: По кругу предметов.')).toBeInTheDocument();
  });

  it('closes a task with its reward and a reason', async () => {
    const { calls } = mockApi(
      progressApi({
        'POST /api/admin/learners/2/progress/10/closure': {
          status: 201,
          body: { progress: progress.tasks[0], reward: { xp: 100, coins: 350 } },
        },
      }),
    );
    renderRoute('/admin/progress/2');
    await openMenu('Сложение до 100', 'Закрыть…');
    const dialog = await screen.findByRole('dialog', { name: 'Закрыть «Сложение до 100»?' });
    await userEvent.type(within(dialog).getByLabelText('Причина'), 'Решили вместе');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Закрыть задание' }));
    expect(await screen.findByText('Закрыто. Начислено: +100 XP, +350 монет')).toBeInTheDocument();
    expect(calls.find((call) => call.path.endsWith('/closure'))?.body).toEqual({
      withReward: true,
      reason: 'Решили вместе',
    });
  });

  it('reopens a done task and allows another attempt', async () => {
    const { calls } = mockApi(
      progressApi({
        'POST /api/admin/learners/2/progress/12/reopening': {
          status: 201,
          body: progress.tasks[2],
        },
        'POST /api/admin/retry-grants': { status: 201, body: { id: 1 } },
      }),
    );
    renderRoute('/admin/progress/2');
    await openMenu('Буква А', 'Переоткрыть («Пройти с мамой»)');
    expect(await screen.findByText('Задание переоткрыто')).toBeInTheDocument();
    await openMenu('Сложение до 100', 'Разрешить ещё попытку');
    await waitFor(() =>
      expect(calls.find((call) => call.path === '/api/admin/retry-grants')?.body).toEqual({
        learnerId: 2,
        taskId: 10,
      }),
    );
  });

  it('resets one task, saying honestly that the video is not asked again', async () => {
    const { calls } = mockApi(
      progressApi({
        'POST /api/admin/learners/2/progress-resets': { status: 201, body: { created: true } },
      }),
    );
    renderRoute('/admin/progress/2');
    await openMenu('Сложение до 100', 'Сбросить…');
    const dialog = await screen.findByRole('dialog', { name: 'Сбросить «Сложение до 100»?' });
    expect(dialog).toHaveAccessibleDescription(
      expect.stringContaining('Просмотренное видео не сбрасывается'),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сбросить' }));
    await waitFor(() =>
      expect(calls.some((call) => call.path.endsWith('/progress-resets'))).toBe(true),
    );
    const body = calls.find((call) => call.path.endsWith('/progress-resets'))?.body as {
      taskId: number;
      requestId: string;
    };
    expect(body.taskId).toBe(10);
    expect(body.requestId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('a full reset needs the word СБРОСИТЬ; coins are zeroed by one ledger row', async () => {
    const { calls } = mockApi(
      progressApi({
        'POST /api/admin/learners/2/progress-resets': { status: 201, body: { created: true } },
        'POST /api/admin/learners/2/coins-resets': {
          status: 201,
          body: { id: 9, coins: -120, xp: 0 },
        },
      }),
    );
    renderRoute('/admin/progress/2');
    await userEvent.click(await screen.findByRole('button', { name: 'Сбросить весь прогресс' }));
    const dialog = await screen.findByRole('dialog', { name: 'Сбросить весь прогресс: Саша?' });
    const confirm = within(dialog).getByRole('button', { name: 'Сбросить всё' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/напишите СБРОСИТЬ/), 'сбросить');
    await userEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const reset = calls.find((call) => call.path.endsWith('/progress-resets'))?.body as object;
    expect(Object.keys(reset)).toEqual(['requestId']);

    await userEvent.click(screen.getByRole('button', { name: 'Обнулить монеты' }));
    const coins = await screen.findByRole('dialog', { name: 'Обнулить монеты: Саша?' });
    await userEvent.click(within(coins).getByRole('button', { name: 'Обнулить' }));
    expect(await screen.findByText('Списано монет: 120')).toBeInTheDocument();
  });

  it('confirms the watching of a video lesson', async () => {
    const { calls } = mockApi(
      progressApi({
        'POST /api/admin/learners/2/watch/11/confirmation': {
          status: 201,
          body: { confirmed: true },
        },
      }),
    );
    renderRoute('/admin/progress/2');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Подтвердить просмотр: Как растут растения' }),
    );
    expect(await screen.findByText('Просмотр подтверждён: вопросы открыты')).toBeInTheDocument();
    expect(calls.some((call) => call.path.endsWith('/watch/11/confirmation'))).toBe(true);
  });

  it('lists attempts with a link to their details', async () => {
    mockApi(progressApi());
    renderRoute('/admin/progress/2');
    const list = await screen.findByRole('region', { name: 'Попытки' });
    const link = await within(list).findByRole('link', { name: 'Сложение до 100' });
    expect(link).toHaveAttribute('href', '/admin/attempts/50');
    expect(within(list).getByText('не зачёт')).toBeInTheDocument();
  });
});

describe('/admin/attempts/:id', () => {
  it('shows the snapshot with the learner’s answers and the correct options', async () => {
    const attempt: AdminAttemptDto = {
      id: 50,
      taskId: 10,
      learnerId: 2,
      epoch: 0,
      status: 'finished',
      startedAt: '2026-11-14T10:00:00.000Z',
      finishedAt: '2026-11-14T10:05:00.000Z',
      retryGrantId: null,
      retry: null,
      result: {
        correct: 1,
        total: 2,
        passed: false,
        reward: { xp: 0, coins: 0 },
        streakReward: { xp: 0, coins: 0 },
      },
      questions: [
        {
          id: 1,
          position: 1,
          text: 'Сколько будет 2 + 2?',
          image: null,
          options: [
            { id: 'b', text: '5', image: null },
            { id: 'a', text: '4', image: null },
            { id: 'c', text: '3', image: null },
            { id: 'd', text: '6', image: null },
          ],
          answer: 'a',
          correct: 'a',
          isCorrect: true,
        },
        {
          id: 2,
          position: 2,
          text: 'Сколько будет 3 + 3?',
          image: null,
          options: [
            { id: 'a', text: '6', image: null },
            { id: 'b', text: '7', image: null },
            { id: 'c', text: '8', image: null },
            { id: 'd', text: '9', image: null },
          ],
          answer: 'c',
          correct: 'a',
          isCorrect: false,
        },
      ],
    };
    mockApi(
      sessionApi(admin, {
        'GET /api/admin/attempts/50': { body: attempt },
        'GET /api/admin/tasks/10': { body: { id: 10, title: 'Сложение до 100' } },
        'GET /api/admin/users': { body: users },
      }),
    );
    renderRoute('/admin/attempts/50');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Попытка: Сложение до 100' }),
    ).toBeVisible();
    expect(await screen.findByText(/^Саша · начата/)).toBeInTheDocument();
    expect(screen.getByText('Верно 1 из 2')).toBeInTheDocument();
    expect(screen.getByText('2. Сколько будет 3 + 3?')).toBeInTheDocument();
    expect(screen.getByText('В) 8')).toBeInTheDocument();
    expect(screen.getAllByText('А) 6').length).toBeGreaterThan(0);
  });
});

describe('/admin/reviews', () => {
  const report: ChoreCompletionDto = {
    id: 5,
    learnerId: 2,
    taskId: 20,
    taskTitle: 'Убрать игрушки',
    periodKey: '2026-11-14',
    status: 'pending',
    note: null,
    createdAt: '2026-11-14T10:00:00.000Z',
    reviewedAt: null,
    reviewedBy: null,
    reward: null,
  };

  it('approves a chore with its reward and rejects another with a comment', async () => {
    const { calls } = mockApi(
      sessionApi(admin, {
        'GET /api/admin/users': { body: users },
        'GET /api/admin/chores/reviews': {
          body: [report, { ...report, id: 6, learnerId: 3, taskTitle: 'Полить цветы' }],
        },
        'GET /api/admin/retry-requests': { body: [] },
        'POST /api/admin/chores/reviews/5/approval': {
          status: 201,
          body: { ...report, status: 'approved', reward: { xp: 50, coins: 100 } },
        },
        'POST /api/admin/chores/reviews/6/rejection': {
          status: 201,
          body: { ...report, id: 6, status: 'rejected' },
        },
      }),
    );
    renderRoute('/admin/reviews');
    const tab = await screen.findByRole('tab', { name: /Дела/ });
    await waitFor(() => expect(tab).toHaveTextContent('2'));
    const row = (await screen.findByText('Убрать игрушки')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Саша')).toBeInTheDocument();
    expect(within(row).getByText('14.11.2026')).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Засчитать: Убрать игрушки' }));
    expect(await screen.findByText('Засчитано: +50 XP, +100 монет')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Не засчитать: Полить цветы' }));
    const dialog = await screen.findByRole('dialog', { name: 'Не засчитать «Полить цветы»?' });
    await userEvent.type(within(dialog).getByLabelText('Комментарий'), 'Цветы сухие');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Не засчитать' }));
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/6/rejection'))?.body).toEqual({
        comment: 'Цветы сухие',
      }),
    );
  });

  it('grants a retry the learner asked for', async () => {
    const { calls } = mockApi(
      sessionApi(admin, {
        'GET /api/admin/users': { body: users },
        'GET /api/admin/chores/reviews': { body: [] },
        'GET /api/admin/retry-requests': {
          body: [
            {
              id: 1,
              learnerId: 2,
              taskId: 10,
              taskTitle: 'Сложение до 100',
              attemptId: 50,
              status: 'open',
              createdAt: '2026-11-14T10:00:00.000Z',
              resolvedAt: null,
            },
          ],
        },
        'POST /api/admin/retry-grants': { status: 201, body: { id: 3 } },
      }),
    );
    renderRoute('/admin/reviews?queue=retries');
    expect(await screen.findByRole('link', { name: 'Сложение до 100' })).toHaveAttribute(
      'href',
      '/admin/attempts/50',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Разрешить пересдачу: Сложение до 100' }),
    );
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
        learnerId: 2,
        taskId: 10,
      }),
    );
  });
});

describe('/admin/awards', () => {
  const reasons: RewardReasonDto[] = [
    { id: 1, seedKey: 'homework', name: 'Домашка', xp: 50, coins: 100, archived: false },
    { id: 2, seedKey: null, name: 'Старая причина', xp: 10, coins: 0, archived: true },
  ];
  const award: AwardDto = {
    id: 7,
    learnerId: 2,
    reasonId: 1,
    reasonName: 'Домашка',
    title: 'Домашка',
    date: '2026-11-13',
    subjectId: null,
    subjectName: 'Без предмета',
    taskId: null,
    xp: 50,
    coins: 100,
    note: null,
    ledgerId: 30,
    at: '2026-11-13T10:00:00.000Z',
    cancelledAt: null,
    createdBy: 1,
  };

  function awardsApi(extra: ApiTable = {}) {
    return sessionApi(admin, {
      'GET /api/admin/users': { body: users },
      'GET /api/admin/reward-reasons': { body: reasons },
      'GET /api/admin/subjects': {
        body: [{ id: 1, key: 'math', name: 'Математика', icon: null, sort: 1, archived: false }],
      },
      'GET /api/admin/tasks': { body: [] },
      'GET /api/admin/learners/2/awards': { body: { items: [award], nextCursor: null } },
      ...extra,
    });
  }

  it('a reason fills the form; a repeated award is confirmed with the same request id', async () => {
    let tries = 0;
    const { calls } = mockApi(
      awardsApi({
        'POST /api/admin/learners/2/awards': () =>
          tries++ === 0
            ? errorReply(409, 'duplicate_award', 'За это занятие или задание награда уже выдана.', {
                force: true,
              })
            : { status: 201, body: award },
      }),
    );
    renderRoute('/admin/awards/2');
    const form = await screen.findByRole('form', { name: 'Начислить' });
    const reason = within(form).getByLabelText('За что');
    expect(
      within(reason).queryByRole('option', { name: /Старая причина/ }),
    ).not.toBeInTheDocument();
    await within(reason).findByRole('option', { name: 'Домашка · +50 XP · +100 монет' });
    await userEvent.selectOptions(reason, 'Домашка · +50 XP · +100 монет');
    expect(within(form).getByLabelText(/Название/)).toHaveValue('Домашка');
    expect(within(form).getByLabelText('XP')).toHaveValue('50');
    await userEvent.selectOptions(within(form).getByLabelText('Предмет'), 'Математика');
    await userEvent.click(within(form).getByRole('button', { name: 'Начислить' }));
    await userEvent.click(await within(form).findByRole('button', { name: 'Начислить ещё раз' }));
    expect(await screen.findByText('Саша: +50 XP, +100 монет')).toBeInTheDocument();
    const posts = calls
      .filter((call) => call.method === 'POST')
      .map((call) => call.body as Record<string, unknown>);
    expect(posts[0]).toMatchObject({
      reasonId: 1,
      title: 'Домашка',
      subjectKey: 'math',
      xp: 50,
      coins: 100,
    });
    expect(posts[0]?.['force']).toBeUndefined();
    expect(posts[1]).toMatchObject({ force: true, requestId: posts[0]?.['requestId'] });
  });

  it('a custom award needs XP or coins; an award is cancelled and stays listed', async () => {
    const { calls } = mockApi(
      awardsApi({
        'POST /api/admin/learners/2/awards/7/cancellation': {
          status: 201,
          body: { ...award, cancelledAt: '2026-11-14T10:00:00.000Z' },
        },
      }),
    );
    renderRoute('/admin/awards/2');
    const form = await screen.findByRole('form', { name: 'Начислить' });
    await userEvent.type(within(form).getByLabelText(/Название/), 'Помог бабушке');
    await userEvent.click(within(form).getByRole('button', { name: 'Начислить' }));
    expect(await within(form).findByText('Укажите XP или монеты')).toBeInTheDocument();
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);

    const list = screen.getByRole('region', { name: 'Выданные награды' });
    await userEvent.click(within(list).getByRole('button', { name: 'Отменить: Домашка' }));
    const dialog = await screen.findByRole('dialog', { name: 'Отменить «Домашка»?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Отменить награду' }));
    await waitFor(() =>
      expect(calls.some((call) => call.path.endsWith('/cancellation'))).toBe(true),
    );
  });

  it('reasons: add one, archive another', async () => {
    const { calls } = mockApi(
      sessionApi(admin, {
        'GET /api/admin/reward-reasons': { body: reasons },
        'POST /api/admin/reward-reasons': {
          status: 201,
          body: { ...reasons[0], id: 3, name: 'Чтение' },
        },
        'PATCH /api/admin/reward-reasons/1': { body: { ...reasons[0], archived: true } },
      }),
    );
    renderRoute('/admin/awards/reasons');
    await userEvent.click(await screen.findByRole('button', { name: 'Новая причина' }));
    const dialog = await screen.findByRole('dialog', { name: 'Новая причина' });
    await userEvent.type(within(dialog).getByLabelText(/Название/), 'Чтение');
    await userEvent.clear(within(dialog).getByLabelText('Монеты'));
    await userEvent.type(within(dialog).getByLabelText('Монеты'), '30{Tab}');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
        name: 'Чтение',
        xp: 0,
        coins: 30,
      }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Изменить: Домашка' }));
    const edit = await screen.findByRole('dialog', { name: 'Причина «Домашка»' });
    await userEvent.click(within(edit).getByText('В архиве'));
    await userEvent.click(within(edit).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ archived: true }),
    );
  });
});
