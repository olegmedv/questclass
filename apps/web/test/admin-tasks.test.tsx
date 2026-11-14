// @vitest-environment jsdom
// FEAT-040: subjects, the task list with filters, the task page (publication with its problems,
// fields, the type's Editor, assignments), the question bank (versions, editing, import with
// preview) and import revisions.
import type { UserDto } from '@questclass/shared/auth/dto';
import type { RevisionDetailDto } from '@questclass/shared/import/manifest';
import type { QuestionDto, TranscriptDto } from '@questclass/shared/questions/schema';
import type { SubjectDto, TaskDto } from '@questclass/shared/tasks/dto';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { admin, errorReply, mockApi, renderRoute, sessionApi, type ApiTable } from './helpers';

const subjects: SubjectDto[] = [
  {
    id: 1,
    key: 'math',
    name: 'Математика',
    icon: 'game/subjects-pixel/math',
    sort: 10,
    archived: false,
  },
  { id: 2, key: 'world', name: 'Окружающий мир', icon: null, sort: 20, archived: false },
];

const learners: UserDto[] = [
  {
    id: 1,
    role: 'admin',
    name: 'Мама',
    login: 'mama',
    avatar: null,
    active: true,
    hasPin: false,
    createdAt: '2026-11-01T10:00:00.000Z',
    deactivatedAt: null,
  },
  {
    id: 2,
    role: 'learner',
    name: 'Саша',
    login: null,
    avatar: null,
    active: true,
    hasPin: true,
    createdAt: '2026-11-01T10:00:00.000Z',
    deactivatedAt: null,
  },
  {
    id: 3,
    role: 'learner',
    name: 'Маша',
    login: null,
    avatar: null,
    active: true,
    hasPin: true,
    createdAt: '2026-11-01T10:00:00.000Z',
    deactivatedAt: null,
  },
];

const lesson: TaskDto = {
  id: 7,
  type: 'video_lesson',
  subjectId: 2,
  title: 'Как растут растения',
  description: '',
  config: { mediaId: 4, watchMode: 'percent', shutter: { enabled: true, heightPct: 9 } },
  xp: 100,
  coins: 350,
  status: 'draft',
  releaseAt: null,
  lessonDate: '2026-11-12',
  sort: 10,
  externalId: 'plants-1',
  assignees: [2],
  createdAt: '2026-11-12T10:00:00.000Z',
  updatedAt: '2026-11-12T10:00:00.000Z',
  publishedAt: null,
};

const quiz: TaskDto = {
  ...lesson,
  id: 8,
  type: 'quiz',
  title: 'Сложение до 100',
  subjectId: 1,
  config: {},
  assignees: [],
  status: 'published',
  externalId: null,
  lessonDate: null,
};

const question = (n: number, patch: Partial<QuestionDto> = {}): QuestionDto => ({
  id: n,
  taskId: 7,
  key: `q${n}`,
  version: 1,
  text: `Вопрос ${n}?`,
  options: [
    { id: 'a', text: `Верно ${n}` },
    { id: 'b', text: `Мимо ${n}А` },
    { id: 'c', text: `Мимо ${n}Б` },
    { id: 'd', text: `Мимо ${n}В` },
  ],
  correct: 'a',
  image: null,
  evidence: { start: 61, end: 65, quote: 'Растению нужен свет' },
  state: 'active',
  source: 'import',
  position: n,
  createdAt: '2026-11-12T10:00:00.000Z',
  archivedAt: null,
  ...patch,
});

const transcripts: TranscriptDto[] = [
  {
    id: 1,
    taskId: 7,
    mediaId: 4,
    lang: 'ru',
    source: 'youtube',
    segments: [
      { start: 60, end: 63, text: 'Растению нужен свет' },
      { start: 63, end: 66, text: 'и вода' },
      { start: 90, end: 95, text: 'Совсем другое' },
    ],
    createdAt: '2026-11-12T10:00:00.000Z',
  },
];

function taskApi(task: TaskDto = lesson, extra: ApiTable = {}) {
  return sessionApi(admin, {
    'GET /api/admin/subjects': { body: subjects },
    'GET /api/admin/users': { body: learners },
    'GET /api/admin/task-revisions': { body: [] },
    [`GET /api/admin/tasks/${task.id}`]: { body: task },
    [`GET /api/admin/tasks/${task.id}/questions`]: {
      body: [question(1), question(2), question(3)],
    },
    [`GET /api/admin/tasks/${task.id}/transcripts`]: { body: transcripts },
    ...extra,
  });
}

describe('/admin/tasks', () => {
  it('lists tasks and filters them on the server and by title', async () => {
    const { calls } = mockApi(
      sessionApi(admin, {
        'GET /api/admin/subjects': { body: subjects },
        'GET /api/admin/users': { body: learners },
        'GET /api/admin/tasks': { body: [lesson, quiz] },
        'GET /api/admin/task-revisions': { body: [{ id: 1 }] },
      }),
    );
    renderRoute('/admin/tasks');
    const link = await screen.findByRole('link', { name: 'Как растут растения' });
    expect(link).toHaveAttribute('href', '/admin/tasks/7');
    const row = link.closest('tr') as HTMLElement;
    expect(within(row).getByText('Видеоурок')).toBeInTheDocument();
    expect(within(row).getByText('Саша')).toBeInTheDocument();
    expect(within(row).getByText('Черновик')).toBeInTheDocument();
    expect(screen.getByText(/Импорт предлагает изменения опубликованных уроков: 1/)).toBeVisible();

    await userEvent.selectOptions(screen.getByLabelText('Предмет'), 'Математика');
    await userEvent.selectOptions(screen.getByLabelText('Статус'), 'Опубликовано');
    await userEvent.selectOptions(screen.getByLabelText('Тип'), 'Тест');
    await waitFor(() =>
      expect(calls.map((call) => call.path)).toContain(
        '/api/admin/tasks?subjectId=1&status=published&type=quiz',
      ),
    );
    await userEvent.type(screen.getByLabelText('Поиск'), 'слож');
    expect(screen.getByRole('link', { name: 'Сложение до 100' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Как растут растения' })).not.toBeInTheDocument();
  });

  it('a new task is a draft of the chosen type; its page opens', async () => {
    const created = { ...quiz, id: 9, title: 'Таблица умножения', status: 'draft' as const };
    const { calls } = mockApi(
      taskApi(created, {
        'GET /api/admin/tasks': { body: [] },
        'POST /api/admin/tasks': { status: 201, body: created },
        'GET /api/admin/tasks/9/questions': { body: [] },
      }),
    );
    const { router } = renderRoute('/admin/tasks');
    await userEvent.click(await screen.findByRole('button', { name: 'Новое задание' }));
    const dialog = await screen.findByRole('dialog', { name: 'Новое задание' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Тип'), 'Тест');
    await userEvent.type(within(dialog).getByLabelText(/Название/), 'Таблица умножения');
    await userEvent.selectOptions(within(dialog).getByLabelText('Предмет'), 'Математика');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Создать' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/tasks/9'));
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      type: 'quiz',
      title: 'Таблица умножения',
      subjectId: 1,
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Таблица умножения' }),
    ).toBeVisible();
    expect(screen.getByText(/У теста нет своих настроек/)).toBeInTheDocument();
  });
});

describe('/admin/tasks/:id', () => {
  it('shows why the task cannot be published yet', async () => {
    mockApi(
      taskApi(lesson, {
        'PATCH /api/admin/tasks/7': errorReply(
          422,
          'cannot_publish',
          'Задание пока нельзя опубликовать',
          {
            errors: [
              'Видео ещё не загружено до конца',
              'Нужно не меньше 3 вопросов в банке (сейчас 2)',
            ],
          },
        ),
      }),
    );
    renderRoute('/admin/tasks/7');
    await userEvent.click(await screen.findByRole('button', { name: 'Опубликовать' }));
    const problems = await screen.findByRole('list', { name: 'Что мешает публикации' });
    expect(
      within(problems)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Видео ещё не загружено до конца', 'Нужно не меньше 3 вопросов в банке (сейчас 2)']);
  });

  it('saves only changed fields, the type settings and assignments', async () => {
    const { calls } = mockApi(
      taskApi(lesson, {
        'PATCH /api/admin/tasks/7': (body) => ({ body: { ...lesson, ...(body as object) } }),
        'POST /api/admin/tasks/7/assignments': {
          status: 201,
          body: { ...lesson, assignees: [2, 3] },
        },
        'DELETE /api/admin/tasks/7/assignments/2': { status: 204 },
      }),
    );
    renderRoute('/admin/tasks/7');
    const main = await screen.findByRole('form', { name: 'Основное' });
    await userEvent.clear(within(main).getByLabelText(/Название/));
    await userEvent.type(within(main).getByLabelText(/Название/), 'Растения');
    await userEvent.clear(within(main).getByLabelText('Награда: XP'));
    await userEvent.type(within(main).getByLabelText('Награда: XP'), '150{Tab}');
    await userEvent.click(within(main).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(1));
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
      title: 'Растения',
      xp: 150,
    });

    await userEvent.selectOptions(screen.getByLabelText('Как проверять просмотр'), 'Без условия');
    expect(screen.queryByLabelText('Сколько процентов посмотреть')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить настройки' }));
    await waitFor(() => expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(2));
    expect(calls.filter((call) => call.method === 'PATCH')[1]?.body).toEqual({
      config: { mediaId: 4, watchMode: 'none', shutter: { enabled: true, heightPct: 9 } },
    });

    await userEvent.click(screen.getByRole('checkbox', { name: 'Маша' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ learnerId: 3 }),
    );
  });

  it('the bank shows correct answers, fragments from the transcript, and edits a question', async () => {
    const { calls } = mockApi(
      taskApi(lesson, {
        'PUT /api/admin/tasks/7/questions/q1': { body: question(1, { version: 2 }) },
      }),
    );
    renderRoute('/admin/tasks/7');
    const bank = await screen.findByRole('list', { name: 'Банк вопросов' });
    const first = (await within(bank).findByRole('heading', { name: 'Вопрос 1' })).closest(
      'article',
    ) as HTMLElement;
    expect(within(first).getByText('верный').closest('li')).toHaveTextContent('А) Верно 1');
    expect(within(first).getByText(/Объяснение в видео: 1:01–1:05/)).toBeInTheDocument();
    expect(
      within(first).getByText('Расшифровка фрагмента: Растению нужен свет и вода'),
    ).toBeVisible();

    await userEvent.click(within(first).getByRole('button', { name: 'Изменить вопрос 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Изменить вопрос' });
    expect(within(dialog).getByLabelText('Фрагмент: начало')).toHaveValue('1:01');
    await userEvent.clear(within(dialog).getByLabelText(/Вариант Б/));
    await userEvent.type(within(dialog).getByLabelText(/Вариант Б/), 'верно 1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(await within(dialog).findByText('Варианты должны различаться')).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByLabelText(/Вариант Б/));
    await userEvent.type(within(dialog).getByLabelText(/Вариант Б/), 'Солнце');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Б' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
      text: 'Вопрос 1?',
      options: [
        { id: 'a', text: 'Верно 1' },
        { id: 'b', text: 'Солнце' },
        { id: 'c', text: 'Мимо 1Б' },
        { id: 'd', text: 'Мимо 1В' },
      ],
      correct: 'b',
      image: null,
      evidence: { start: 61, end: 65, quote: 'Растению нужен свет' },
    });
  });

  it('the history of a question lists its versions', async () => {
    mockApi(
      taskApi(lesson, {
        'GET /api/admin/tasks/7/questions/q2/versions': {
          body: [
            question(2, { archivedAt: '2026-11-13T10:00:00.000Z' }),
            question(2, { id: 22, version: 2, text: 'Вопрос 2, исправленный?', source: 'admin' }),
          ],
        },
      }),
    );
    renderRoute('/admin/tasks/7');
    await userEvent.click(await screen.findByRole('button', { name: 'История вопроса 2' }));
    const dialog = await screen.findByRole('dialog', { name: 'История вопроса «q2»' });
    const versions = within(dialog).getAllByRole('article');
    expect(versions[0]).toHaveTextContent('Версия 2');
    expect(versions[0]).toHaveTextContent('правка родителя');
    expect(versions[1]).toHaveTextContent('Версия 1');
    expect(versions[1]).toHaveTextContent('в архиве');
  });

  it('a pasted test is recognised and previewed before it replaces or extends the bank', async () => {
    const { calls } = mockApi(
      taskApi(lesson, {
        'POST /api/admin/tasks/7/question-imports': { status: 201, body: [question(4)] },
      }),
    );
    renderRoute('/admin/tasks/7');
    await userEvent.click(await screen.findByRole('button', { name: 'Загрузить тест' }));
    const dialog = await screen.findByRole('dialog', { name: 'Загрузить тест' });
    const text = [1, 2, 3]
      .map(
        (n) =>
          `${n}. Сколько будет ${n} + 1?\nА) ${n + 1}\nБ) ${n + 2}\nВ) ${n + 3}\nГ) ${n + 4}\nОтвет: А`,
      )
      .join('\n\n');
    await userEvent.click(within(dialog).getByLabelText('Или вставьте готовый тест'));
    await userEvent.paste(text);
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Добавить к ним' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Распознать вопросы' }));
    expect(await within(dialog).findByText('Проверьте: 3 вопр.')).toBeInTheDocument();
    expect(within(dialog).getByText('Сколько будет 2 + 1?')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить 3 вопр.' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      content: text,
      append: true,
    });
  });

  it('a test that cannot be recognised is explained', async () => {
    mockApi(taskApi(lesson));
    renderRoute('/admin/tasks/7');
    await userEvent.click(await screen.findByRole('button', { name: 'Загрузить тест' }));
    const dialog = await screen.findByRole('dialog', { name: 'Загрузить тест' });
    await userEvent.click(within(dialog).getByLabelText('Или вставьте готовый тест'));
    await userEvent.paste('просто текст');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Распознать вопросы' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/строка|вопрос/i);
  });
});

describe('/admin/tasks/revisions/:id', () => {
  const revision: RevisionDetailDto = {
    id: 3,
    taskId: 7,
    taskTitle: 'Как растут растения',
    status: 'pending',
    mediaId: 9,
    imagesMediaId: null,
    mediaReady: true,
    questions: { created: ['q4'], updated: ['q1'], unchanged: [], conflicts: ['q2'], removed: [] },
    createdAt: '2026-11-14T10:00:00.000Z',
    decidedAt: null,
    currentMediaId: 4,
    diff: [
      {
        key: 'q1',
        change: 'updated',
        current: { ...question(1), version: 1 },
        proposed: { ...question(1), text: 'Что нужно растению для роста?', version: 2 },
      },
      {
        key: 'q2',
        change: 'conflict',
        current: { ...question(2), version: 2 },
        proposed: { ...question(2), version: 3 },
      },
      { key: 'q4', change: 'created', current: null, proposed: { ...question(4), version: 1 } },
    ],
  };

  it('shows the diff and conflicts and accepts the revision', async () => {
    const { calls } = mockApi(
      sessionApi(admin, {
        'GET /api/admin/task-revisions/3': { body: revision },
        'POST /api/admin/task-revisions/3/acceptance': {
          body: { ...revision, status: 'accepted' },
        },
      }),
    );
    renderRoute('/admin/tasks/revisions/3');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ревизия: Как растут растения' }),
    ).toBeVisible();
    expect(screen.getByText(/Новое видео загружено — заменит текущее/)).toBeInTheDocument();
    expect(screen.getByText(/Конфликтов: 1/)).toBeInTheDocument();
    const updated = screen.getByRole('article', { name: 'Вопрос «q1»' });
    expect(within(updated).getByText('Изменён')).toBeInTheDocument();
    expect(within(updated).getByText('Что нужно растению для роста?')).toBeInTheDocument();
    expect(
      within(screen.getByRole('article', { name: 'Вопрос «q2»' })).getByText('Конфликт'),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Принять' }));
    await waitFor(() => expect(calls.some((call) => call.path.endsWith('/acceptance'))).toBe(true));
  });
});

describe('/admin/subjects', () => {
  it('adds a subject with a built-in icon; a used one is only archived', async () => {
    const { calls } = mockApi(
      sessionApi(admin, {
        'GET /api/admin/subjects': { body: subjects },
        'POST /api/admin/subjects': (body) => ({
          status: 201,
          body: { id: 3, sort: 30, archived: false, key: 'music', ...(body as object) },
        }),
        'DELETE /api/admin/subjects/1': errorReply(409, 'has_history', 'Есть задания', {
          archive: true,
        }),
      }),
    );
    renderRoute('/admin/subjects');
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить предмет' }));
    const dialog = await screen.findByRole('dialog', { name: 'Новый предмет' });
    await userEvent.type(within(dialog).getByLabelText(/Название/), 'Музыка');
    await userEvent.type(within(dialog).getByLabelText('Ключ'), 'music');
    await userEvent.selectOptions(within(dialog).getByLabelText('Значок'), 'art');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      name: 'Музыка',
      key: 'music',
      icon: 'game/subjects-pixel/art',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Изменить: Математика' }));
    const edit = await screen.findByRole('dialog', { name: 'Предмет «Математика»' });
    await userEvent.click(within(edit).getByRole('button', { name: 'Удалить' }));
    expect(await within(edit).findByText(/можно только убрать в архив/)).toBeInTheDocument();
  });
});

describe('test files', () => {
  it('takes TXT, MD and JSON up to 500 KB, drops the BOM and refuses binary files', async () => {
    const { readTestFile } = await import('../src/features/questions/QuestionImport');
    expect(await readTestFile(new File(['﻿1. Вопрос'], 'test.txt'))).toEqual({
      text: '1. Вопрос',
    });
    expect(await readTestFile(new File(['x'], 'test.pdf'))).toEqual({
      error: 'Нужен файл .txt, .md или .json',
    });
    expect(await readTestFile(new File(['a\0b'], 'test.md'))).toEqual({
      error: 'Сохраните файл в кодировке UTF-8',
    });
    expect(await readTestFile(new File(['x'.repeat(500 * 1024 + 1)], 'big.json'))).toEqual({
      error: 'Файл больше 500 КБ',
    });
  });
});
