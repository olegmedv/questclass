// Learning content for the learner-screen specs, made through the real API: a learner of its
// own per test (so specs running in parallel never see each other's tasks), quizzes and video
// lessons assigned to that learner only, and helpers to sign the learner in on the trusted device.
import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from '@playwright/test';
import { VIDEO_SECONDS } from './video';

async function ok<T>(res: APIResponse): Promise<T> {
  if (!res.ok()) {
    throw new Error(`${res.url()} → ${res.status()}: ${await res.text()}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export interface TestLearner {
  readonly id: number;
  readonly name: string;
  readonly pin: string;
}

/** A learner of this test only (names need not be unique). */
export async function createLearner(admin: APIRequestContext, name = 'Саша'): Promise<TestLearner> {
  const pin = '1357';
  const user = await ok<{ id: number }>(
    await admin.post('/api/admin/users', { data: { role: 'learner', name, pin } }),
  );
  return { id: user.id, name, pin };
}

/** Signs the learner in inside this page's browser (the page must be on the trusted device). */
export async function signIn(page: Page, learner: TestLearner): Promise<void> {
  const res = await page.request.post('/api/auth/learner-login', {
    data: { userId: learner.id, pin: learner.pin },
  });
  expect(res.status(), await res.text()).toBe(200);
}

export interface QuestionSpec {
  readonly text: string;
  /** Four options; the first one is the correct answer unless `correct` says otherwise. */
  readonly options: readonly [string, string, string, string];
  readonly correct?: 'a' | 'b' | 'c' | 'd';
  readonly evidence?: { readonly start: number; readonly end: number };
}

/** Three questions whose right answer is always «Верно …». */
export function sampleQuestions(prefix = 'Вопрос'): QuestionSpec[] {
  return [1, 2, 3].map((n) => ({
    text: `${prefix} ${n}: где правильный ответ?`,
    options: [`Верно ${n}`, `Мимо ${n}А`, `Мимо ${n}Б`, `Мимо ${n}В`],
    evidence: { start: 1, end: 3 },
  }));
}

const IDS = ['a', 'b', 'c', 'd'] as const;

function questionBody(question: QuestionSpec, key: string) {
  return {
    key,
    text: question.text,
    options: question.options.map((text, index) => ({ id: IDS[index], text })),
    correct: question.correct ?? 'a',
    evidence: question.evidence ? { ...question.evidence, quote: null } : null,
  };
}

async function subjectId(admin: APIRequestContext, key: string): Promise<number> {
  const subjects = await ok<{ id: number; key: string }[]>(await admin.get('/api/admin/subjects'));
  const subject = subjects.find((s) => s.key === key);
  if (!subject) throw new Error(`No subject ${key}`);
  return subject.id;
}

async function assignAndPublish(admin: APIRequestContext, taskId: number, learnerId: number) {
  await ok(await admin.post(`/api/admin/tasks/${taskId}/assignments`, { data: { learnerId } }));
  await ok(await admin.patch(`/api/admin/tasks/${taskId}`, { data: { status: 'published' } }));
}

export interface TaskSpec {
  readonly title: string;
  readonly subjectKey?: string;
  readonly learnerId: number;
  readonly questions?: readonly QuestionSpec[];
  readonly xp?: number;
  readonly coins?: number;
  readonly lessonDate?: string;
}

/** A published quiz assigned to one learner. */
export async function createQuiz(admin: APIRequestContext, spec: TaskSpec): Promise<number> {
  const task = await ok<{ id: number }>(
    await admin.post('/api/admin/tasks', {
      data: {
        type: 'quiz',
        subjectId: await subjectId(admin, spec.subjectKey ?? 'math'),
        title: spec.title,
        xp: spec.xp ?? 100,
        coins: spec.coins ?? 350,
        ...(spec.lessonDate && { lessonDate: spec.lessonDate }),
      },
    }),
  );
  const questions = spec.questions ?? sampleQuestions();
  for (const [index, question] of questions.entries()) {
    await ok(
      await admin.post(`/api/admin/tasks/${task.id}/questions`, {
        data: questionBody(question, `q${index + 1}`),
      }),
    );
  }
  await assignAndPublish(admin, task.id, spec.learnerId);
  return task.id;
}

interface LocalFile {
  readonly path: string;
  readonly bytes: Buffer;
}

/** The e2e video fixture as the files of a lesson package (HLS entry renamed to master.m3u8). */
function videoFiles(kind: 'hls' | 'mp4', video: { mp4: string; hls: string }): LocalFile[] {
  if (kind === 'mp4') {
    return [{ path: 'video.mp4', bytes: readFileSync(video.mp4) }];
  }
  const dir = dirname(video.hls);
  return readdirSync(dir).map((name) => ({
    path: name === 'index.m3u8' ? 'master.m3u8' : name,
    bytes: readFileSync(join(dir, name)),
  }));
}

/**
 * A video lesson uploaded like `lesson-prep import` does — an import token, the manifest, the
 * files, the completion with the duration — and left a draft, as an import leaves it.
 */
export async function importVideoLesson(
  admin: APIRequestContext,
  baseURL: string,
  video: { mp4: string; hls: string },
  spec: Omit<TaskSpec, 'learnerId'> & {
    readonly kind?: 'hls' | 'mp4';
    readonly watchMinPercent?: number;
  },
): Promise<number> {
  const kind = spec.kind ?? 'hls';
  const token = await ok<{ token: string }>(
    await admin.post('/api/admin/import-tokens', { data: { name: `e2e ${spec.title}` } }),
  );
  // Import endpoints take the token only from a client without a session.
  const importer = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { authorization: `Bearer ${token.token}` },
  });
  try {
    const files = videoFiles(kind, video);
    const questions = spec.questions ?? sampleQuestions();
    const result = await ok<{ taskId: number; media: { id: number; role: string }[] }>(
      await importer.post('/api/import/lessons', {
        data: {
          externalId: `e2e-${randomBytes(6).toString('hex')}`,
          subjectKey: spec.subjectKey ?? 'math',
          title: spec.title,
          xp: spec.xp ?? 100,
          coins: spec.coins ?? 350,
          ...(spec.lessonDate && { lessonDate: spec.lessonDate }),
          questions: questions.map((q, index) => questionBody(q, `q${index + 1}`)),
          media: {
            kind,
            files: files.map((f) => ({
              path: f.path,
              size: f.bytes.length,
              sha256: createHash('sha256').update(f.bytes).digest('hex'),
            })),
          },
        },
      }),
    );
    const media = result.media.find((m) => m.role === 'video');
    if (!media) throw new Error('The import created no video media');
    for (const file of files) {
      await ok(
        await importer.put(`/api/import/media/${media.id}/files/${file.path}?offset=0`, {
          data: file.bytes,
          headers: { 'content-type': 'application/octet-stream' },
        }),
      );
    }
    await ok(
      await importer.post(`/api/import/media/${media.id}/completion`, {
        data: { durationSec: VIDEO_SECONDS },
      }),
    );
    if (spec.watchMinPercent !== undefined) {
      const task = await ok<{ config: Record<string, unknown> }>(
        await admin.get(`/api/admin/tasks/${result.taskId}`),
      );
      await ok(
        await admin.patch(`/api/admin/tasks/${result.taskId}`, {
          data: { config: { ...task.config, minWatchPercent: spec.watchMinPercent } },
        }),
      );
    }
    return result.taskId;
  } finally {
    await importer.dispose();
  }
}

/** A published video lesson assigned to one learner (imported, then assigned and published). */
export async function createVideoLesson(
  admin: APIRequestContext,
  baseURL: string,
  video: { mp4: string; hls: string },
  spec: TaskSpec & { readonly kind?: 'hls' | 'mp4'; readonly watchMinPercent?: number },
): Promise<number> {
  const taskId = await importVideoLesson(admin, baseURL, video, spec);
  await assignAndPublish(admin, taskId, spec.learnerId);
  return taskId;
}

/** The admin allows one more attempt (after the free retries are used up). */
export async function grantRetry(admin: APIRequestContext, learnerId: number, taskId: number) {
  await ok(await admin.post('/api/admin/retry-grants', { data: { learnerId, taskId } }));
}
