import { parseQuestionImport, QuestionImportError } from '@questclass/shared/questions/importText';
import type {
  QuestionContent,
  QuestionDto,
  TranscriptDto,
} from '@questclass/shared/questions/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { ImportedQuestion } from '../src/modules/questions/service';
import { NOTE_TYPE, READY_NOTE, noteTaskType } from './fixtures/noteTaskType';
import { createClient, errorCode, loginAdmin, seedAdmin, type TestClient } from './helpers/client';
import { createTestRuntime, type TestRuntime } from './helpers/db';

/** The plain-text sample of the original (README «Test import format», `testTemplate`). */
const README_TEXT = `1. В числе 47 сколько десятков?
А) 4
Б) 7
В) 47
Г) 3
Ответ: А

2. Сколько будет 8 + 5?
А) 12
Б) 13
В) 14
Г) 15
Ответ: Б

3. Было 30 монет. Потратили 10. Сколько осталось?
А) 40
Б) 10
В) 20
Г) 30
Ответ: В`;

/** The JSON sample of the README: `correct` as a letter or a zero-based index. */
interface JsonQuestion {
  question: string;
  options: string[];
  correct: string | number;
  image?: string;
}
const README_QUESTIONS: JsonQuestion[] = [
  { question: 'Сколько ног у кошки?', options: ['2', '4', '6', '8'], correct: 'Б' },
  {
    question: 'Какого цвета небо?',
    options: ['Зелёное', 'Синее', 'Красное', 'Чёрное'],
    correct: 1,
  },
  { question: 'Сколько дней в неделе?', options: ['5', '6', '7', '8'], correct: 2 },
];
const README_JSON = JSON.stringify({ questions: README_QUESTIONS });

function importError(input: string): string {
  try {
    parseQuestionImport(input);
  } catch (err) {
    expect(err).toBeInstanceOf(QuestionImportError);
    return (err as Error).message;
  }
  throw new Error('Expected the import to fail');
}

const question = (text: string, correct: 'a' | 'b' | 'c' | 'd' = 'a'): QuestionContent => ({
  text,
  options: [
    { id: 'a', text: 'Один' },
    { id: 'b', text: 'Два' },
    { id: 'c', text: 'Три' },
    { id: 'd', text: 'Четыре' },
  ],
  correct,
  evidence: { start: 10, end: 20, quote: 'цитата' },
});

describe('parseQuestionImport (shared)', () => {
  it('reads the README plain-text sample', () => {
    const parsed = parseQuestionImport(README_TEXT);
    expect(parsed.map((q) => q.text)).toEqual([
      'В числе 47 сколько десятков?',
      'Сколько будет 8 + 5?',
      'Было 30 монет. Потратили 10. Сколько осталось?',
    ]);
    expect(parsed.map((q) => q.correct)).toEqual(['a', 'b', 'c']);
    expect(parsed[1]?.options.map((o) => `${o.id}:${o.text}`)).toEqual([
      'a:12',
      'b:13',
      'c:14',
      'd:15',
    ]);
  });

  it('reads the README JSON sample (letter or zero-based index)', () => {
    const parsed = parseQuestionImport(README_JSON);
    expect(parsed.map((q) => q.correct)).toEqual(['b', 'b', 'c']);
    // A bare array and an AI answer wrapped in a ```json fence work too.
    const bare = JSON.stringify(README_QUESTIONS);
    expect(parseQuestionImport('```json\n' + bare + '\n```')).toEqual(parsed);
  });

  it('accepts the variants an AI chat produces', () => {
    const text = [
      '# Тест по математике',
      'Тема: сложение',
      '**Вопрос 1:** Сколько будет',
      '2 + 2?',
      'A) 3',
      'B) 4',
      'C) 5',
      'D) 6',
      'Правильный ответ: B.',
      '2) Сколько будет 3 + 3?',
      'а) 5',
      'б) 6',
      'в) 7',
      'г) 8',
      'Ответ: 2',
      'Вопрос 3. Сколько будет 1 + 1?',
      'А: 1',
      'Б: 2',
      'В: 3',
      'Г: 4',
      'Correct answer: 2',
    ].join('\n');
    const parsed = parseQuestionImport(text);
    expect(parsed[0]?.text).toBe('Сколько будет 2 + 2?');
    // «2» is an option letter number (1–4) before it is an option text.
    expect(parsed.map((q) => q.correct)).toEqual(['b', 'b', 'b']);
  });

  it('takes evidence and pictures from JSON', () => {
    const parsed = parseQuestionImport(
      JSON.stringify([
        {
          text: 'Что на картинке?',
          image: { src: '/quiz/visual/cat.webp', alt: 'кот' },
          options: [{ text: 'Кот' }, { text: 'Пёс' }, { label: 'Лис' }, { text: 'Ёж' }],
          answer: 'Кот',
          helpVideo: { startSeconds: 200, endSeconds: 295, quote: 'Это кот' },
        },
        { ...README_QUESTIONS[0], evidence: { start: 1, end: 2, quote: null } },
        README_QUESTIONS[1],
      ]),
    );
    expect(parsed[0]).toMatchObject({
      image: 'quiz/visual/cat.webp',
      correct: 'a',
      evidence: { start: 200, end: 295, quote: 'Это кот' },
    });
    expect(parsed[1]?.evidence).toEqual({ start: 1, end: 2, quote: null });
  });

  it('explains what is wrong', () => {
    expect(importError('')).toMatch(/Вставьте текст/);
    expect(importError(README_TEXT.split('\n\n')[0] ?? '')).toMatch(/от 3 до 30/);
    expect(importError(`${README_TEXT}\nПояснение: потому что`)).toMatch(/Не распознана строка/);
    expect(importError(README_TEXT.replace('Ответ: А', 'Ответ: А\nОтвет: Б'))).toMatch(
      /несколько строк ответа/,
    );
    expect(importError(README_TEXT.replace('Б) 7', 'А) 7'))).toMatch(/повторяется буква/);
    expect(importError(README_TEXT.replace('Г) 3\n', ''))).toMatch(/четыре варианта/);
    expect(importError(README_TEXT.replace('Б) 7', 'Б) 4'))).toMatch(/различаться/);
    expect(importError(README_TEXT.replace('Ответ: А', 'Ответ: Е'))).toMatch(/правильный ответ/);
    expect(importError('{"questions": [1, 2,]}')).toMatch(/JSON не читается/);
    expect(importError('{"items": []}')).toMatch(/массив questions/);
    const external = README_QUESTIONS.map((q, i) =>
      i === 0 ? { ...q, image: 'https://cdn.example.com/a.png' } : q,
    );
    expect(importError(JSON.stringify(external))).toMatch(/путь картинки/);
    const many = Array.from({ length: 31 }, (_, i) => ({
      question: `Вопрос ${i}`,
      options: ['1', '2', '3', '4'],
      correct: 0,
    }));
    expect(importError(JSON.stringify(many))).toMatch(/от 3 до 30/);
  });
});

describe('questions service and API', () => {
  let runtime: TestRuntime;
  let admin: TestClient;
  let adminId: number;
  let taskId: number;

  beforeEach(async () => {
    runtime = await createTestRuntime();
    runtime.ctx.taskTypes.register(noteTaskType);
    adminId = await seedAdmin(runtime.ctx);
    admin = createClient(createApp(runtime.ctx).app);
    await loginAdmin(admin);
    taskId = runtime.ctx.tasks.create(
      { type: NOTE_TYPE, title: 'Урок', config: READY_NOTE },
      adminId,
    ).id;
  });

  afterEach(async () => {
    await runtime.close();
  });

  const base = () => `/api/admin/tasks/${taskId}/questions`;
  const list = async (query = ''): Promise<QuestionDto[]> =>
    (await (await admin.get(`${base()}${query}`)).json()) as QuestionDto[];
  const imported = (key: string, text: string): ImportedQuestion => ({ key, ...question(text) });

  it('an edit adds a version and archives the previous one', async () => {
    const created = await admin.post(base(), { key: 'q1', ...question('Сколько?') });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      key: 'q1',
      version: 1,
      state: 'active',
      source: 'admin',
      evidence: { start: 10, end: 20, quote: 'цитата' },
    });

    const edited = await admin.request('PUT', `${base()}/q1`, {
      json: question('Сколько всего?', 'b'),
    });
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({ key: 'q1', version: 2, correct: 'b' });

    expect((await list()).map((q) => `${q.key}@${q.version}`)).toEqual(['q1@2']);
    const versions = (await (await admin.get(`${base()}/q1/versions`)).json()) as QuestionDto[];
    expect(versions.map((q) => [q.version, q.archivedAt !== null])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(await list('?archived=true')).toHaveLength(2);
    expect(runtime.ctx.audit.list({ action: 'question.updated' }).items).toHaveLength(1);
  });

  it('deleting archives; the archived question leaves the bank', async () => {
    await admin.post(base(), { key: 'q1', ...question('Первый') });
    await admin.post(base(), { key: 'q2', ...question('Второй') });
    expect(runtime.ctx.questions.countActive(taskId)).toBe(2);
    expect((await admin.delete(`${base()}/q1`)).status).toBe(204);
    expect((await admin.delete(`${base()}/q1`)).status).toBe(404);
    expect(runtime.ctx.questions.activeBank(taskId).map((q) => q.key)).toEqual(['q2']);
    expect((await list('?archived=true')).find((q) => q.key === 'q1')?.archivedAt).not.toBeNull();
    // The row is still there: history is kept.
    expect((await admin.get(`${base()}/q1/versions`)).status).toBe(200);
  });

  it('validates content and keeps (task, key, version) unique', async () => {
    const bad = await admin.post(base(), { ...question('X'), correct: 'e' });
    expect(bad.status).toBe(400);
    const sameTexts = await admin.post(base(), {
      ...question('X'),
      options: question('X').options.map((o) => ({ ...o, text: 'одно' })),
    });
    expect(sameTexts.status).toBe(400);
    await admin.post(base(), { key: 'q1', ...question('Первый') });
    const dup = await admin.post(base(), { key: 'q1', ...question('Ещё') });
    expect(dup.status).toBe(409);
    expect(await errorCode(dup)).toBe('question_key_taken');
    expect(() =>
      runtime.ctx.db.$client
        .prepare(
          `INSERT INTO questions (task_id, key, version, text, options, correct, source, position, created_at)
           VALUES (?, 'q1', 1, 't', '[]', 'a', 'admin', 1, 0)`,
        )
        .run(taskId),
    ).toThrow(/UNIQUE/);
    expect((await admin.get(`/api/admin/tasks/9999/questions`)).status).toBe(404);
  });

  it('import adds and updates by key, but never overwrites the admin’s version', () => {
    const svc = runtime.ctx.questions;
    const first = svc.importVersions(
      taskId,
      [imported('q1', 'Один'), imported('q2', 'Два'), imported('q3', 'Три')],
      { state: 'active' },
    );
    expect(first.created).toEqual(['q1', 'q2', 'q3']);

    svc.update(taskId, 'q2', question('Два (правка мамы)'), adminId);
    svc.archive(taskId, 'q3', adminId);
    const second = svc.importVersions(
      taskId,
      [imported('q1', 'Один'), imported('q2', 'Два v2'), imported('q3', 'Три v2')],
      { state: 'active' },
    );
    expect(second).toMatchObject({ unchanged: ['q1'], conflicts: ['q2', 'q3'], updated: [] });
    expect(svc.activeBank(taskId).map((q) => `${q.key}:${q.text}:${q.source}`)).toEqual([
      'q1:Один:import',
      'q2:Два (правка мамы):admin',
    ]);

    const third = svc.importVersions(taskId, [imported('q1', 'Один v2')], { state: 'active' });
    expect(third.updated).toEqual(['q1']);
    expect(svc.versions(taskId, 'q1').map((q) => [q.version, q.archivedAt !== null])).toEqual([
      [1, true],
      [2, false],
    ]);
    // q2 belongs to the admin now, so it is not reported as removed by lesson-prep.
    expect(third.removed).toEqual([]);
  });

  it('imported questions missing from a new import are archived', () => {
    const svc = runtime.ctx.questions;
    svc.importVersions(taskId, [imported('q1', 'Один'), imported('q2', 'Два')], {
      state: 'active',
    });
    const outcome = svc.importVersions(taskId, [imported('q1', 'Один')], { state: 'active' });
    expect(outcome.removed).toEqual(['q2']);
    expect(svc.activeBank(taskId).map((q) => q.key)).toEqual(['q1']);
  });

  it('pending versions wait outside the bank', () => {
    const svc = runtime.ctx.questions;
    svc.importVersions(taskId, [imported('q1', 'Один')], { state: 'active' });
    const outcome = svc.importVersions(
      taskId,
      [imported('q1', 'Один v2'), imported('q9', 'Новый')],
      {
        state: 'pending',
      },
    );
    expect(outcome).toMatchObject({ updated: ['q1'], created: ['q9'] });
    expect(svc.activeBank(taskId).map((q) => `${q.key}:${q.text}`)).toEqual(['q1:Один']);
    expect(svc.countActive(taskId)).toBe(1);
    const live = svc.list(taskId).map((q) => `${q.key}@${q.version}:${q.state}`);
    expect(live).toEqual(['q1@1:active', 'q1@2:pending', 'q9@1:pending']);
    // A newer pending import replaces the older pending version.
    svc.importVersions(taskId, [imported('q1', 'Один v3')], { state: 'pending' });
    expect(
      svc
        .list(taskId)
        .filter((q) => q.key === 'q1')
        .map((q) => q.version),
    ).toEqual([1, 3]);
  });

  it('POST question-imports replaces the bank, or appends', async () => {
    await admin.post(base(), { key: 'old', ...question('Старый') });
    const replaced = await admin.post(`/api/admin/tasks/${taskId}/question-imports`, {
      content: README_TEXT,
    });
    expect(replaced.status).toBe(201);
    expect(((await replaced.json()) as QuestionDto[]).every((q) => q.source === 'admin')).toBe(
      true,
    );
    expect((await list()).map((q) => q.text)).toEqual([
      'В числе 47 сколько десятков?',
      'Сколько будет 8 + 5?',
      'Было 30 монет. Потратили 10. Сколько осталось?',
    ]);
    const appended = await admin.post(`/api/admin/tasks/${taskId}/question-imports`, {
      content: README_JSON,
      append: true,
    });
    expect(appended.status).toBe(201);
    expect(await list()).toHaveLength(6);

    const broken = await admin.post(`/api/admin/tasks/${taskId}/question-imports`, {
      content: 'просто текст',
    });
    expect(broken.status).toBe(400);
    const body = (await broken.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('import_failed');
    expect(body.error.message).toMatch(/Не распознана строка/);
    expect(await list()).toHaveLength(6);
  });

  it('stores transcripts and gives them to the admin', async () => {
    const segments = [
      { start: 0, end: 4.5, text: 'Здравствуйте, ребята!' },
      { start: 4.5, end: 9, text: 'Сегодня мы повторим сложение.' },
    ];
    const res = await admin.post(`/api/admin/tasks/${taskId}/transcripts`, {
      lang: 'ru',
      source: 'youtube',
      segments,
    });
    expect(res.status).toBe(201);
    const listed = (await (
      await admin.get(`/api/admin/tasks/${taskId}/transcripts`)
    ).json()) as TranscriptDto[];
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ lang: 'ru', source: 'youtube', mediaId: null, segments });

    const bad = await admin.post(`/api/admin/tasks/${taskId}/transcripts`, {
      lang: 'ru',
      source: 'youtube',
      segments: [{ start: 5, end: 1, text: 'x' }],
    });
    expect(bad.status).toBe(400);
    const unknownTask = await admin.post(`/api/admin/tasks/9999/transcripts`, {
      lang: 'ru',
      source: 'manual',
      segments,
    });
    expect(unknownTask.status).toBe(404);
  });

  it('a draft deleted without history takes its questions and transcripts along', async () => {
    await admin.post(base(), { key: 'q1', ...question('Первый') });
    await admin.post(`/api/admin/tasks/${taskId}/transcripts`, {
      lang: 'ru',
      source: 'manual',
      segments: [],
    });
    expect((await admin.delete(`/api/admin/tasks/${taskId}`)).status).toBe(204);
    const left = runtime.ctx.db.$client
      .prepare('SELECT (SELECT count(*) FROM questions) + (SELECT count(*) FROM transcripts) AS n')
      .get() as { n: number };
    expect(left.n).toBe(0);
  });
});
