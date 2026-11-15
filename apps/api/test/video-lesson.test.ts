import type {
  VideoLessonConfig,
  WatchMode,
} from '@questclass/shared/task-types/video_lesson/contract';
import type {
  WatchProgressDto,
  WatchSessionDto,
} from '@questclass/shared/task-types/video_lesson/dto';
import type { QuestionContent } from '@questclass/shared/questions/schema';
import type { TaskDto } from '@questclass/shared/tasks/dto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { createApp } from '../src/app';
import { DEVICE_COOKIE } from '../src/modules/auth/routes';
import { videoLessonTaskType } from '../src/task-types/video_lesson';
import {
  capToBudget,
  clipToDuration,
  mergeSpans,
  percentOf,
  totalLength,
} from '../src/task-types/video_lesson/intervals';
import {
  createClient,
  errorCode,
  loginAdmin,
  trustDevice,
  type TestClient,
} from './helpers/client';
import { createTestRuntime, type TestRuntime } from './helpers/db';
import { quickAdmin, quickLearner } from './helpers/fastUsers';

describe('interval arithmetic', () => {
  it('merges overlapping and touching spans into sorted disjoint ones', () => {
    expect(
      mergeSpans([
        [30, 40],
        [0, 10],
        [5, 12],
        [12, 20],
        [50, 50.5],
      ]),
    ).toEqual([
      [0, 20],
      [30, 40],
      [50, 50.5],
    ]);
  });

  it('clips to the video and drops empty spans', () => {
    expect(
      clipToDuration(
        [
          [90, 200],
          [120, 130],
          [5, 5],
        ],
        100,
      ),
    ).toEqual([[90, 100]]);
  });

  it('keeps no more than the budget, in the reported order', () => {
    expect(
      capToBudget(
        [
          [0, 10],
          [20, 30],
          [40, 50],
        ],
        15,
      ),
    ).toEqual([
      [0, 10],
      [20, 25],
    ]);
    expect(capToBudget([[0, 10]], 0)).toEqual([]);
  });

  it('counts length and percent (floored, at most 100)', () => {
    expect(
      totalLength([
        [0, 10.5],
        [20, 21],
      ]),
    ).toBe(11.5);
    expect(percentOf(69.99, 100)).toBe(69);
    expect(percentOf(70, 100)).toBe(70);
    expect(percentOf(150, 100)).toBe(100);
    expect(percentOf(10, 0)).toBe(0);
  });
});

describe('fromImport', () => {
  it('builds a percent-mode config around the imported video', () => {
    expect(videoLessonTaskType.fromImport?.({ externalId: 'x', mediaId: 7 })).toEqual({
      mediaId: 7,
      watchMode: 'percent',
      shutter: { enabled: true, heightPct: 9 },
    });
  });

  it('keeps the admin’s watch settings on a re-import and swaps the video', () => {
    const current: VideoLessonConfig = {
      mediaId: 3,
      watchMode: 'manual',
      minWatchPercent: 50,
      shutter: { enabled: false, heightPct: 12 },
    };
    expect(videoLessonTaskType.fromImport?.({ mediaId: 8, current })).toEqual({
      ...current,
      mediaId: 8,
    });
  });

  it('refuses input without a media id', () => {
    expect(() => videoLessonTaskType.fromImport?.({ externalId: 'x' })).toThrow();
  });
});

const T0 = Date.UTC(2026, 10, 14, 9, 0, 0);
const SECOND = 1000;

let runtime: TestRuntime;
let adminId: number;
let anya: number;
let admin: TestClient;
let a: TestClient;
let b: TestClient;
let mathId: number;
let now = T0;

const app = () => createApp(runtime.ctx).app;

/** Moves the server clock forward (Date only; timers stay real). */
function advance(ms: number): void {
  now += ms;
  vi.setSystemTime(now);
}

/**
 * Signs learners in on one trusted tablet (one admin login for the whole file keeps the scrypt
 * work small).
 */
async function learnerClients(...learners: [number, string][]): Promise<TestClient[]> {
  const tablet = createClient(app());
  await loginAdmin(tablet);
  await trustDevice(tablet);
  const device = tablet.cookies.get(DEVICE_COOKIE) ?? '';
  const out: TestClient[] = [];
  for (const [userId, pin] of learners) {
    const browser = createClient(app());
    browser.cookies.set(DEVICE_COOKIE, device);
    const res = await browser.post('/api/auth/learner-login', { userId, pin });
    expect(res.status).toBe(200);
    out.push(browser);
  }
  return out;
}

const question = (n: number): QuestionContent => ({
  text: `Вопрос ${n}`,
  options: [
    { id: 'a', text: `${n}-А` },
    { id: 'b', text: `${n}-Б` },
    { id: 'c', text: `${n}-В` },
    { id: 'd', text: `${n}-Г` },
  ],
  correct: 'b',
  evidence: { start: n, end: n + 5, quote: null },
});

/** A ready HLS media of the task with a playlist on disk. */
function readyVideo(taskId: number, durationSec = 100): number {
  const { media } = runtime.ctx;
  const row = media.create({ taskId, role: 'video', kind: 'hls' });
  writeFileSync(path.join(media.dirOf(row), 'master.m3u8'), '#EXTM3U\n');
  return media.markReady(row.id, { sizeBytes: 8, durationSec }).id;
}

interface LessonOptions {
  readonly mode?: WatchMode;
  readonly minWatchPercent?: number;
  readonly durationSec?: number;
  readonly assign?: boolean;
  readonly bank?: number;
}

/** A published video lesson (math) with a ready video and a bank of questions. */
function lesson(options: LessonOptions = {}): { taskId: number; mediaId: number } {
  const { ctx } = runtime;
  const taskId = ctx.tasks.create(
    { type: 'video_lesson', title: 'Видеоурок', subjectId: mathId },
    adminId,
  ).id;
  const mediaId = readyVideo(taskId, options.durationSec ?? 100);
  const config: VideoLessonConfig = {
    mediaId,
    watchMode: options.mode ?? 'percent',
    shutter: { enabled: true, heightPct: 9 },
    ...(options.minWatchPercent !== undefined && { minWatchPercent: options.minWatchPercent }),
  };
  ctx.tasks.update(taskId, { config }, adminId);
  for (let n = 1; n <= (options.bank ?? 3); n += 1) {
    ctx.questions.create(taskId, { key: `q${n}`, ...question(n) }, adminId);
  }
  ctx.tasks.update(taskId, { status: 'published' }, adminId);
  if (options.assign ?? true) {
    ctx.tasks.assign(taskId, anya, adminId);
  }
  return { taskId, mediaId };
}

async function openSession(taskId: number, client = a): Promise<WatchSessionDto> {
  const res = await client.post(`/api/watch/${taskId}/sessions`);
  expect(res.status, await res.clone().text()).toBe(201);
  return (await res.json()) as WatchSessionDto;
}

type Played = { start: number; end: number; kind?: 'main' | 'help' };

function sendBatch(
  taskId: number,
  sessionId: number,
  intervals: Played[],
  position?: number,
  client = a,
): Promise<Response> {
  return client.post(`/api/watch/${taskId}/sessions/${sessionId}/intervals`, {
    intervals,
    ...(position !== undefined && { position }),
  });
}

async function batch(
  taskId: number,
  sessionId: number,
  intervals: Played[],
  position?: number,
): Promise<WatchProgressDto> {
  const res = await sendBatch(taskId, sessionId, intervals, position);
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as WatchProgressDto;
}

const startAttempt = (taskId: number, client = a) => client.post(`/api/tasks/${taskId}/attempts`);

// One runtime for the file: every test makes its own lessons; tests that change a setting
// restore it.
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  runtime = await createTestRuntime();
  adminId = await quickAdmin(runtime.ctx);
  anya = await quickLearner(runtime.ctx, 'Аня', '1111');
  const borya = await quickLearner(runtime.ctx, 'Боря', '2222');
  mathId = runtime.ctx.subjects.findByKey('math')?.id ?? 0;
  admin = createClient(app());
  await loginAdmin(admin);
  const [anyaClient, boryaClient] = await learnerClients([anya, '1111'], [borya, '2222']);
  if (!anyaClient || !boryaClient) {
    throw new Error('Learner sign-in failed');
  }
  a = anyaClient;
  b = boryaClient;
}, 30_000);

afterAll(async () => {
  vi.useRealTimers();
  await runtime.close();
});

/** Applies a setting for one test. */
function withSetting(key: 'progress.unlockMode' | 'watch.minPercent', value: unknown): void {
  const before = runtime.ctx.settings.get(key);
  runtime.ctx.settings.set(key, value, adminId);
  onTestFinished(() => {
    runtime.ctx.settings.set(key, before, adminId);
  });
}

describe('video_lesson config and publishing', () => {
  const create = async (config?: unknown) => {
    const res = await admin.post('/api/admin/tasks', {
      type: 'video_lesson',
      title: 'Урок',
      subjectId: mathId,
      ...(config !== undefined && { config }),
    });
    return res;
  };
  const publish = (id: number) => admin.patch(`/api/admin/tasks/${id}`, { status: 'published' });
  const publishErrors = async (id: number): Promise<string[]> => {
    const res = await publish(id);
    expect(res.status).toBe(422);
    return ((await res.json()) as { error: { details: { errors: string[] } } }).error.details
      .errors;
  };

  it('a new lesson has no video yet and percent mode with the strip on', async () => {
    const res = await create();
    expect(res.status).toBe(201);
    expect(((await res.json()) as TaskDto).config).toEqual({
      mediaId: null,
      watchMode: 'percent',
      shutter: { enabled: true, heightPct: 9 },
    });
  });

  it('validates the config', async () => {
    const base = { mediaId: null, watchMode: 'percent', shutter: { enabled: true, heightPct: 9 } };
    for (const config of [
      { ...base, watchMode: 'strict' },
      { ...base, minWatchPercent: 5 },
      { ...base, minWatchPercent: 96 },
      { ...base, shutter: { enabled: true, heightPct: 41 } },
      { ...base, shutter: { enabled: true, heightPct: 3 } },
      { ...base, mediaId: 0 },
    ]) {
      const res = await create(config);
      expect(res.status, JSON.stringify(config)).toBe(400);
      expect(await errorCode(res)).toBe('invalid_config');
    }
  });

  it('publishing needs a ready video of this lesson and enough questions', async () => {
    const { ctx } = runtime;
    const id = ((await (await create()).json()) as TaskDto).id;
    expect(await publishErrors(id)).toEqual([
      'Нужно видео урока',
      'Нужно не меньше 3 вопросов в банке (сейчас 0)',
    ]);

    const pending = ctx.media.create({ taskId: id, role: 'video', kind: 'hls' });
    const config = (mediaId: number) => ({
      config: { mediaId, watchMode: 'percent', shutter: { enabled: true, heightPct: 9 } },
    });
    await admin.patch(`/api/admin/tasks/${id}`, config(pending.id));
    for (let n = 1; n <= 3; n += 1) {
      ctx.questions.create(id, { key: `q${n}`, ...question(n) }, adminId);
    }
    expect(await publishErrors(id)).toEqual(['Видео ещё не загружено до конца']);

    const other = ctx.tasks.create({ type: 'quiz', title: 'Чужой' }, adminId).id;
    await admin.patch(`/api/admin/tasks/${id}`, config(readyVideo(other)));
    expect(await publishErrors(id)).toEqual(['Видео урока не найдено']);

    await admin.patch(`/api/admin/tasks/${id}`, config(readyVideo(id)));
    expect((await publish(id)).status).toBe(200);
  });

  it('the learner sees the video, the mode and the strip, never the answers', async () => {
    const { taskId, mediaId } = lesson({ minWatchPercent: 50 });
    const res = await a.get(`/api/tasks/${taskId}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { config: unknown }).config).toEqual({
      mediaId,
      watchMode: 'percent',
      shutter: { enabled: true, heightPct: 9 },
    });
  });
});

describe('watch sessions', () => {
  it('opens a session with the media and the resume point', async () => {
    const { taskId, mediaId } = lesson();
    const session = await openSession(taskId);
    expect(session.media).toEqual({
      id: mediaId,
      kind: 'hls',
      durationSec: 100,
      src: `/api/media/${mediaId}/master.m3u8`,
    });
    expect(session.progress).toMatchObject({
      taskId,
      mediaId,
      mode: 'percent',
      percent: 0,
      requiredPercent: 70,
      lastPosition: 0,
      satisfied: false,
    });
    // Opening the video counts as starting the task.
    const me = (await (await a.get('/api/me/progress')).json()) as {
      tasks: { taskId: number; state: string }[];
    };
    expect(me.tasks.find((t) => t.taskId === taskId)?.state).toBe('started');
  });

  it('a new session closes the previous one: the other tab gets 409', async () => {
    const { taskId } = lesson();
    const first = await openSession(taskId);
    const second = await openSession(taskId);
    advance(10 * SECOND);
    const stale = await sendBatch(taskId, first.sessionId, [{ start: 0, end: 10 }]);
    expect(stale.status).toBe(409);
    expect(await errorCode(stale)).toBe('session_closed');
    expect((await batch(taskId, second.sessionId, [{ start: 0, end: 10 }])).percent).toBe(10);

    // Two openings at once: exactly one session stays open.
    const [x, y] = await Promise.all([openSession(taskId), openSession(taskId)]);
    advance(5 * SECOND);
    const results = await Promise.all(
      [x, y].map((s) => sendBatch(taskId, s?.sessionId ?? 0, [{ start: 10, end: 15 }])),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('credits no more than the real time since the last batch × 1.25', async () => {
    const { taskId } = lesson();
    const { sessionId } = await openSession(taskId);
    advance(30 * SECOND);
    expect(await batch(taskId, sessionId, [{ start: 0, end: 30 }])).toMatchObject({
      watchedSec: 30,
      percent: 30,
    });
    // 30 s claimed after 10 s of real time: only 12.5 s count.
    advance(10 * SECOND);
    expect(await batch(taskId, sessionId, [{ start: 30, end: 60 }])).toMatchObject({
      watchedSec: 42.5,
      percent: 42,
    });
  });

  it('one interval over the whole video right away is not credited', async () => {
    const { taskId } = lesson();
    const { sessionId } = await openSession(taskId);
    advance(1 * SECOND);
    const progress = await batch(taskId, sessionId, [{ start: 0, end: 100 }]);
    expect(progress.watchedSec).toBe(1.25);
    expect(progress.satisfied).toBe(false);
    const res = await startAttempt(taskId);
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('watch_required');
  });

  it('clips intervals to the video length', async () => {
    const { taskId } = lesson({ durationSec: 100 });
    const { sessionId } = await openSession(taskId);
    advance(200 * SECOND);
    expect(await batch(taskId, sessionId, [{ start: 90, end: 250 }], 400)).toMatchObject({
      watchedSec: 10,
      percent: 10,
      lastPosition: 100,
    });
  });

  it('does not credit hint fragments, nor the same part twice', async () => {
    const { taskId } = lesson();
    const { sessionId } = await openSession(taskId);
    advance(30 * SECOND);
    expect((await batch(taskId, sessionId, [{ start: 0, end: 30, kind: 'help' }])).watchedSec).toBe(
      0,
    );
    advance(30 * SECOND);
    expect((await batch(taskId, sessionId, [{ start: 0, end: 30 }])).watchedSec).toBe(30);
    advance(30 * SECOND);
    expect((await batch(taskId, sessionId, [{ start: 0, end: 30 }])).watchedSec).toBe(30);
  });

  it('keeps the resume point for the next opening', async () => {
    const { taskId } = lesson();
    const first = await openSession(taskId);
    advance(20 * SECOND);
    await batch(taskId, first.sessionId, [{ start: 40, end: 60 }], 60);
    const second = await openSession(taskId);
    expect(second.progress).toMatchObject({ lastPosition: 60, watchedSec: 20 });
  });

  it('rejects malformed batches', async () => {
    const { taskId } = lesson();
    const { sessionId } = await openSession(taskId);
    for (const intervals of [
      [{ start: 10, end: 5 }],
      [{ start: -1, end: 5 }],
      [{ start: 0, end: 5, kind: 'other' }],
      Array.from({ length: 101 }, (_, i) => ({ start: i, end: i + 1 })),
    ]) {
      const res = await a.post(`/api/watch/${taskId}/sessions/${sessionId}/intervals`, {
        intervals,
      });
      expect(res.status).toBe(400);
    }
  });

  it('another learner cannot open or feed someone else’s lesson', async () => {
    const { taskId } = lesson();
    const { sessionId } = await openSession(taskId);
    expect((await b.post(`/api/watch/${taskId}/sessions`)).status).toBe(404);
    advance(10 * SECOND);
    const res = await sendBatch(taskId, sessionId, [{ start: 0, end: 10 }], 10, b);
    expect(res.status).toBe(404);
    // Nothing was credited by the refused batch.
    advance(10 * SECOND);
    expect((await batch(taskId, sessionId, [])).watchedSec).toBe(0);
  });

  it('a lesson that is not open yet cannot be watched', async () => {
    withSetting('progress.unlockMode', 'sequential');
    lesson({ assign: false });
    const second = lesson({ assign: false });
    const res = await a.post(`/api/watch/${second.taskId}/sessions`);
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('task_locked');
  });

  it('a deleted video cannot be opened (410)', async () => {
    const { taskId, mediaId } = lesson();
    runtime.ctx.media.markDeleted(mediaId);
    const res = await a.post(`/api/watch/${taskId}/sessions`);
    expect(res.status).toBe(410);
    expect(await errorCode(res)).toBe('media_deleted');
  });

  it('a replaced video is counted from scratch; old sessions are refused', async () => {
    const { ctx } = runtime;
    const { taskId, mediaId } = lesson();
    const old = await openSession(taskId);
    advance(80 * SECOND);
    expect((await batch(taskId, old.sessionId, [{ start: 0, end: 80 }])).satisfied).toBe(true);

    const replacement = readyVideo(taskId, 200);
    const config = ctx.tasks.get(taskId).config as VideoLessonConfig;
    ctx.tasks.update(taskId, { config: { ...config, mediaId: replacement } }, adminId);
    advance(10 * SECOND);
    const stale = await sendBatch(taskId, old.sessionId, [{ start: 80, end: 90 }]);
    expect(stale.status).toBe(409);
    expect(await errorCode(stale)).toBe('session_outdated');

    const fresh = await openSession(taskId);
    expect(fresh.progress).toMatchObject({ mediaId: replacement, watchedSec: 0, percent: 0 });
    expect(fresh.progress.mediaId).not.toBe(mediaId);
    expect((await startAttempt(taskId)).status).toBe(409);
  });
});

describe('starting the questions', () => {
  it('percent mode: 409 below the threshold, the attempt starts once it is reached', async () => {
    const { taskId } = lesson();
    const { sessionId } = await openSession(taskId);
    advance(60 * SECOND);
    await batch(taskId, sessionId, [{ start: 0, end: 60 }]);
    const below = await startAttempt(taskId);
    expect(below.status).toBe(409);
    expect(await errorCode(below)).toBe('watch_required');

    advance(10 * SECOND);
    expect((await batch(taskId, sessionId, [{ start: 60, end: 70 }])).satisfied).toBe(true);
    expect((await startAttempt(taskId)).status).toBe(201);
  });

  it('uses the lesson’s own threshold, and a reached threshold is not revoked', async () => {
    const { ctx } = runtime;
    const { taskId } = lesson({ minWatchPercent: 30 });
    const { sessionId } = await openSession(taskId);
    advance(30 * SECOND);
    expect(await batch(taskId, sessionId, [{ start: 0, end: 30 }])).toMatchObject({
      requiredPercent: 30,
      satisfied: true,
    });
    const config = ctx.tasks.get(taskId).config as VideoLessonConfig;
    ctx.tasks.update(taskId, { config: { ...config, minWatchPercent: 90 } }, adminId);
    expect((await startAttempt(taskId)).status).toBe(201);
  });

  it('the installation default applies to lessons without their own threshold', async () => {
    withSetting('watch.minPercent', 20);
    const { taskId } = lesson();
    const { sessionId } = await openSession(taskId);
    advance(20 * SECOND);
    expect(await batch(taskId, sessionId, [{ start: 0, end: 20 }])).toMatchObject({
      requiredPercent: 20,
      satisfied: true,
    });
    expect((await startAttempt(taskId)).status).toBe(201);
  });

  it('none mode: the questions open without watching', async () => {
    const { taskId } = lesson({ mode: 'none' });
    expect((await startAttempt(taskId)).status).toBe(201);
  });

  it('manual mode: only the admin’s confirmation opens the questions', async () => {
    const { ctx } = runtime;
    const { taskId, mediaId } = lesson({ mode: 'manual' });
    const { sessionId } = await openSession(taskId);
    advance(100 * SECOND);
    expect((await batch(taskId, sessionId, [{ start: 0, end: 100 }])).satisfied).toBe(false);
    const before = await startAttempt(taskId);
    expect(before.status).toBe(409);
    expect(await errorCode(before)).toBe('watch_not_confirmed');

    const url = `/api/admin/learners/${anya}/watch/${taskId}/confirmation`;
    const confirmed = await admin.post(url);
    expect(confirmed.status).toBe(201);
    expect((await confirmed.json()) as WatchProgressDto).toMatchObject({
      mediaId,
      confirmed: true,
      satisfied: true,
    });
    expect((await admin.post(url)).status).toBe(200);
    expect((await startAttempt(taskId)).status).toBe(201);

    const audit = ctx.audit.list({ learnerId: anya, action: 'watch.confirmed' });
    expect(audit.items).toHaveLength(1);
    expect(audit.items[0]?.payload).toEqual({ taskId, mediaId });
  });

  it('a confirmation also counts in percent mode (watched outside the app)', async () => {
    const { taskId } = lesson();
    const res = await admin.post(`/api/admin/learners/${anya}/watch/${taskId}/confirmation`);
    expect(res.status).toBe(201);
    expect((await startAttempt(taskId)).status).toBe(201);
  });

  it('confirmation needs a learner and a video lesson with a video', async () => {
    const { ctx } = runtime;
    const { taskId } = lesson();
    const quiz = ctx.tasks.create({ type: 'quiz', title: 'Тест' }, adminId).id;
    const draft = ctx.tasks.create({ type: 'video_lesson', title: 'Без видео' }, adminId).id;
    const confirm = (learner: number, task: number) =>
      admin.post(`/api/admin/learners/${learner}/watch/${task}/confirmation`);
    expect((await confirm(adminId, taskId)).status).toBe(404);
    expect((await confirm(anya, quiz)).status).toBe(404);
    const noVideo = await confirm(anya, draft);
    expect(noVideo.status).toBe(409);
    expect(await errorCode(noVideo)).toBe('no_video');
  });
});
