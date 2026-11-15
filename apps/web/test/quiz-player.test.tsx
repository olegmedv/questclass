// @vitest-environment jsdom
// FEAT-030: the quiz Player on top of the attempts engine — start, answers saved one by one,
// result with the celebration, free retry, «Попросить пересдачу», resume, «Послушать вопрос».
import type { AttemptDto, AttemptQuestionDto } from '@questclass/shared/attempts/dto';
import type { LearnerProgressDto, TaskProgressDto } from '@questclass/shared/progress/dto';
import type { LearnerTaskDto } from '@questclass/shared/tasks/dto';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickRussianVoice, questionSpeech } from '../src/features/attempts/speech';
import {
  errorReply,
  learner,
  mockApi,
  noRetryClient,
  renderRoute,
  sessionApi,
  type ApiTable,
} from './helpers';

const task: LearnerTaskDto = {
  id: 5,
  type: 'quiz',
  subjectId: 2,
  title: 'Сложение в пределах 100',
  description: '',
  config: {},
  xp: 100,
  coins: 350,
  releaseAt: null,
  lessonDate: null,
  sort: 0,
  assigned: true,
};

function progress(patch: Partial<TaskProgressDto> = {}): LearnerProgressDto {
  return {
    mode: 'rotation',
    nextTaskId: 5,
    assignedTotal: 1,
    assignedDone: 0,
    tasks: [
      {
        taskId: 5,
        title: task.title,
        type: 'quiz',
        subjectId: 2,
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

function question(id: number, answer: AttemptQuestionDto['answer'] = null): AttemptQuestionDto {
  return {
    id,
    position: id - 100,
    text: `Сколько будет ${id - 100} + ${id - 100}?`,
    image: null,
    options: [
      { id: 'b', text: `Не ${id}`, image: null },
      { id: 'a', text: `Верно ${id}`, image: null },
      { id: 'c', text: `Мимо ${id}`, image: null },
      { id: 'd', text: `Тоже мимо ${id}`, image: null },
    ],
    answer,
  };
}

function attempt(patch: Partial<AttemptDto> = {}): AttemptDto {
  return {
    id: 11,
    taskId: 5,
    epoch: 0,
    status: 'in_progress',
    startedAt: '2026-11-14T10:00:00.000Z',
    finishedAt: null,
    questions: [question(101), question(102), question(103)],
    result: null,
    retry: null,
    ...patch,
  };
}

/** The finished attempt: `wrong` question ids were answered `b`, the others `a` (correct). */
function finished(wrong: number[], retry: AttemptDto['retry'], paid = true): AttemptDto {
  const questions = [101, 102, 103].map((id) => {
    const answer = wrong.includes(id) ? 'b' : 'a';
    return {
      ...question(id, answer),
      correct: 'a' as const,
      isCorrect: answer === 'a',
      evidence: null,
    };
  });
  const correct = 3 - wrong.length;
  const passed = correct >= 2;
  return attempt({
    status: 'finished',
    finishedAt: '2026-11-14T10:05:00.000Z',
    questions,
    result: {
      correct,
      total: 3,
      passed,
      reward:
        passed && paid
          ? { xp: Math.floor((100 * correct) / 3), coins: Math.floor((350 * correct) / 3) }
          : { xp: 0, coins: 0 },
      streakReward: { xp: 0, coins: 0 },
    },
    retry,
  });
}

const noRetry = { canRetry: false, canRequest: false, requestOpen: false };

function quizApi(extra: ApiTable = {}, progressPatch: Partial<TaskProgressDto> = {}): ApiTable {
  return sessionApi(learner, {
    'GET /api/tasks/5': { body: task },
    'GET /api/subjects': {
      body: [{ id: 2, key: 'math', name: 'Математика', icon: null, sort: 1, archived: false }],
    },
    'GET /api/me/progress': { body: progress(progressPatch) },
    'GET /api/me/wallet': { body: { xp: 0, coins: 0, level: 1, levelXp: 0, xpToNext: 300 } },
    ...extra,
  });
}

const answers = {
  'PUT /api/attempts/11/answers/101': (body: unknown) => ({
    body: { questionId: 101, ...(body as object) },
  }),
  'PUT /api/attempts/11/answers/102': (body: unknown) => ({
    body: { questionId: 102, ...(body as object) },
  }),
  'PUT /api/attempts/11/answers/103': (body: unknown) => ({
    body: { questionId: 103, ...(body as object) },
  }),
};

async function answer(optionText: RegExp) {
  await userEvent.click(await screen.findByRole('button', { name: optionText }));
  await userEvent.click(screen.getByRole('button', { name: /^Ответить/ }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('quiz player', () => {
  it('starts, saves each answer at once, finishes and celebrates a pass', async () => {
    const { calls } = mockApi(
      quizApi({
        'POST /api/tasks/5/attempts': { status: 201, body: attempt() },
        ...answers,
        'POST /api/attempts/11/completion': { body: finished([], noRetry) },
      }),
    );
    renderRoute('/tasks/5');
    expect(await screen.findByRole('heading', { level: 1, name: task.title })).toBeInTheDocument();
    expect(screen.getByText('Награда за пройденный тест')).toBeInTheDocument();
    expect(screen.getByText('+100 XP')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Начать тест' }));

    expect(await screen.findByText('Вопрос 1 из 3')).toBeInTheDocument();
    const options = screen.getByRole('group', { name: 'Сколько будет 1 + 1?' });
    expect(
      within(options)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['АНе 101', 'БВерно 101', 'ВМимо 101', 'ГТоже мимо 101']);
    expect(screen.getByRole('button', { name: 'Ответить' })).toBeDisabled();
    // The choice can change until «Ответить».
    await userEvent.click(within(options).getByRole('button', { name: /Мимо 101/ }));
    await answer(/Верно 101/);
    expect(await screen.findByText('Вопрос 2 из 3')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/api/attempts/11/answers/101')?.body).toEqual({
      optionId: 'a',
    });
    await answer(/Верно 102/);
    expect(await screen.findByRole('button', { name: 'Ответить и завершить' })).toBeDisabled();
    await answer(/Верно 103/);

    const dialog = await screen.findByRole('dialog', { name: 'Миссия выполнена!' });
    expect(within(dialog).getByText('+100 XP')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /Отлично/ }));
    expect(screen.getByRole('heading', { name: 'Миссия выполнена!' })).toBeInTheDocument();
    expect(screen.getByText('Верных ответов: 3 из 3.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'К урокам' })).toHaveAttribute('href', '/');
    expect(
      calls.filter((c) => c.method === 'POST' && c.path === '/api/attempts/11/completion'),
    ).toHaveLength(1);
  });

  it('after a fail with a free retry offers «Пересдать» and starts a new attempt', async () => {
    let starts = 0;
    mockApi(
      quizApi({
        'POST /api/tasks/5/attempts': () => {
          starts += 1;
          return { status: 201, body: starts === 1 ? attempt() : attempt({ id: 12 }) };
        },
        ...answers,
        'POST /api/attempts/11/completion': {
          body: finished([101, 102], { canRetry: true, canRequest: false, requestOpen: false }),
        },
      }),
    );
    renderRoute('/tasks/5');
    await userEvent.click(await screen.findByRole('button', { name: 'Начать тест' }));
    await answer(/Не 101/);
    await answer(/Не 102/);
    await answer(/Верно 103/);
    expect(await screen.findByRole('heading', { name: 'Попробуем ещё раз' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Верных ответов: 1 из 3.')).toBeInTheDocument();
    expect(screen.getByText('Можно пройти тест ещё раз.')).toBeInTheDocument();
    // «Давай разберём»: the learner's answer and the right one.
    const review = screen.getByRole('region', { name: 'Давай разберём' });
    const first = within(review).getAllByRole('listitem')[0]!;
    expect(first).toHaveTextContent('Твой ответНе 101');
    expect(first).toHaveTextContent('Верный ответВерно 101');
    expect(screen.queryByRole('button', { name: 'Попросить пересдачу' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Пересдать' }));
    expect(await screen.findByText('Вопрос 1 из 3')).toBeInTheDocument();
    expect(starts).toBe(2);
  });

  it('when the free retries are used up the learner asks the parent', async () => {
    const { calls } = mockApi(
      quizApi({
        'POST /api/tasks/5/attempts': { body: attempt() },
        ...answers,
        'POST /api/attempts/11/completion': {
          body: finished([101, 102, 103], {
            canRetry: false,
            canRequest: true,
            requestOpen: false,
          }),
        },
        'POST /api/tasks/5/retry-requests': {
          status: 201,
          body: { id: 1, learnerId: 2, taskId: 5, status: 'open' },
        },
      }),
    );
    renderRoute('/tasks/5');
    await userEvent.click(await screen.findByRole('button', { name: 'Начать тест' }));
    await answer(/Не 101/);
    await answer(/Не 102/);
    await answer(/Не 103/);
    expect(await screen.findByText('Новую попытку откроет родитель.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Пересдать' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Попросить пересдачу' }));
    expect(
      await screen.findByText('Просьба отправлена. Новую попытку откроет родитель.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Попросить пересдачу' })).toBeNull();
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/tasks/5/retry-requests')).toBe(
      true,
    );
  });

  it('a start refused with «retry_needed» shows the request (or that it is waiting)', async () => {
    mockApi(
      quizApi(
        {
          'POST /api/tasks/5/attempts': errorReply(
            409,
            'retry_needed',
            'Новую попытку откроет родитель',
            { requestOpen: true },
          ),
        },
        { state: 'started' },
      ),
    );
    renderRoute('/tasks/5', { client: noRetryClient() });
    await userEvent.click(await screen.findByRole('button', { name: 'Продолжить тест' }));
    expect(
      await screen.findByRole('heading', { name: 'Новую попытку откроет родитель' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Просьба отправлена. Ждём родителя.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Попросить пересдачу' })).toBeNull();
  });

  it('resumes an open attempt at the first unanswered question', async () => {
    mockApi(
      quizApi(
        {
          'POST /api/tasks/5/attempts': {
            body: attempt({ questions: [question(101, 'a'), question(102), question(103)] }),
          },
        },
        { state: 'started' },
      ),
    );
    renderRoute('/tasks/5');
    await userEvent.click(await screen.findByRole('button', { name: 'Продолжить тест' }));
    expect(await screen.findByText('Вопрос 2 из 3')).toBeInTheDocument();
  });

  it('a passed quiz opens as its result without starting anything', async () => {
    const { calls } = mockApi(
      quizApi({}, { state: 'passed', completed: true, score: 2, total: 3 }),
    );
    renderRoute('/tasks/5');
    expect(await screen.findByRole('heading', { name: 'Тест пройден!' })).toBeInTheDocument();
    expect(screen.getByText('Верных ответов: 2 из 3.')).toBeInTheDocument();
    expect(screen.getByText('Награда за этот тест уже получена.')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('an unknown task says so', async () => {
    mockApi(quizApi({ 'GET /api/tasks/5': errorReply(404, 'not_found', 'Задание не найдено') }));
    renderRoute('/tasks/5', { client: noRetryClient() });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Задание не найдено' }),
    ).toBeInTheDocument();
  });
});

describe('«Послушать вопрос»', () => {
  function stubSpeech(voices: { lang: string; name: string; localService: boolean }[]) {
    const speak = vi.fn();
    const synth = {
      getVoices: () => voices,
      speak,
      cancel: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('speechSynthesis', synth);
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        voice: unknown = null;
        lang = '';
        rate = 1;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(readonly text: string) {}
      },
    );
    return speak;
  }

  it('reads the question and the options with a Russian voice', async () => {
    const speak = stubSpeech([
      { lang: 'en-US', name: 'Samantha', localService: true },
      { lang: 'ru-RU', name: 'Milena', localService: true },
    ]);
    mockApi(quizApi({ 'POST /api/tasks/5/attempts': { body: attempt() } }));
    renderRoute('/tasks/5');
    await userEvent.click(await screen.findByRole('button', { name: 'Начать тест' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Послушать вопрос' }));
    const utterance = speak.mock.calls[0]?.[0] as { text: string; voice: { name: string } };
    expect(utterance.voice.name).toBe('Milena');
    expect(utterance.text).toBe(
      'Вопрос 1 из 3. Сколько будет 1 + 1? Вариант А: Не 101. Вариант Б: Верно 101. Вариант В: Мимо 101. Вариант Г: Тоже мимо 101.',
    );
    expect(screen.getByRole('button', { name: 'Остановить' })).toBeInTheDocument();
  });

  it('is hidden when the device has no Russian voice', async () => {
    stubSpeech([{ lang: 'en-US', name: 'Samantha', localService: true }]);
    mockApi(quizApi({ 'POST /api/tasks/5/attempts': { body: attempt() } }));
    renderRoute('/tasks/5');
    await userEvent.click(await screen.findByRole('button', { name: 'Начать тест' }));
    expect(await screen.findByText('Вопрос 1 из 3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Послушать вопрос' })).toBeNull();
  });

  it('prefers a local Russian voice and builds the phrase', () => {
    const voices = [
      { lang: 'ru_RU', name: 'Online', localService: false },
      { lang: 'ru-RU', name: 'Local', localService: true },
    ] as SpeechSynthesisVoice[];
    expect(pickRussianVoice(voices)?.name).toBe('Local');
    expect(pickRussianVoice([])).toBeNull();
    expect(questionSpeech(2, 3, 'Что это', [{ letter: 'А', text: 'кот' }])).toBe(
      'Вопрос 2 из 3. Что это. Вариант А: кот.',
    );
  });
});
