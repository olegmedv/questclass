/**
 * `lesson-prep import` against a test instance of the API (in process: requests go straight to
 * the Hono app instead of a socket). ffmpeg is mocked.
 */
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../apps/api/src/app';
import type { AppEnv } from '../../../apps/api/src/http/route';
import { createTestRuntime, type TestRuntime } from '../../../apps/api/test/helpers/db';
import { quickAdmin } from '../../../apps/api/test/helpers/fastUsers';
import { importLesson, LessonError } from '../src/commands/import';
import type { Client, Fetch } from '../src/upload';
import { fakeFfmpeg } from './fakeFfmpeg';

const SERVER = 'http://questclass.test';
const ENV = {
  incoming: { socket: { remoteAddress: '127.0.0.1' } },
} as unknown as AppEnv['Bindings'];

let runtime: TestRuntime;
let token: string;
let work: string;

/** Requests seen by the API, as `METHOD path`. */
let seen: string[] = [];

const apiFetch: Fetch = async (url, init) => {
  const { pathname, search } = new URL(url);
  seen.push(`${init.method ?? 'GET'} ${pathname}`);
  return createApp(runtime.ctx).app.request(`${pathname}${search}`, init, ENV);
};

const client = (fetch: Fetch = apiFetch): Client => ({
  server: SERVER,
  token,
  fetch,
  sleep: () => Promise.resolve(),
});

const question = (n: number, image?: string) => ({
  key: `q${n}`,
  text: `Вопрос ${n}`,
  options: [
    { id: 'a', text: `${n}-А` },
    { id: 'b', text: `${n}-Б` },
    { id: 'c', text: `${n}-В` },
    { id: 'd', text: `${n}-Г` },
  ],
  correct: 'c',
  ...(image !== undefined && { image }),
  evidence: { start: n * 10, end: n * 10 + 6, quote: `цитата ${n}` },
});

/** A lesson package folder with lesson.json, a (fake) source video and one picture. */
function lessonFolder(name: string, lesson: Record<string, unknown> = {}): string {
  const folder = path.join(work, name);
  mkdirSync(path.join(folder, 'images'), { recursive: true });
  writeFileSync(path.join(folder, 'video.mp4'), 'source video bytes');
  writeFileSync(path.join(folder, 'images', 'q1.webp'), 'RIFF....WEBPVP8 ');
  writeFileSync(
    path.join(folder, 'lesson.json'),
    JSON.stringify({
      externalId: `yt-${name}`,
      subjectKey: 'math',
      title: 'Логические задачи',
      lessonDate: '2025-09-03',
      questions: [question(1, 'images/q1.webp'), question(2), question(3)],
      transcript: {
        lang: 'ru',
        source: 'youtube',
        segments: [{ start: 0, end: 2, text: 'Начнём' }],
      },
      ...lesson,
    }),
  );
  return folder;
}

beforeAll(async () => {
  work = mkdtempSync(path.join(os.tmpdir(), 'qc-lesson-prep-import-'));
  runtime = await createTestRuntime();
  const admin = await quickAdmin(runtime.ctx);
  token = runtime.ctx.imports.createToken('test', admin).token;
}, 30_000);

afterAll(async () => {
  await runtime.close();
  rmSync(work, { recursive: true, force: true });
});

describe('lesson-prep import', () => {
  it('makes HLS with NVENC, uploads everything and leaves a draft with ready media', async () => {
    const folder = lessonFolder('first');
    const fake = fakeFfmpeg({ nvenc: true });
    const summary = await importLesson(folder, {
      client: client(),
      tools: fake.tools,
      encoder: 'auto',
    });
    expect(fake.transcodes).toHaveLength(1);
    expect(fake.transcodes[0]).toContain('h264_nvenc');
    expect(summary.prepared.hls).toMatchObject({ made: true, encoder: 'nvenc' });
    expect(summary.result.outcome).toBe('created');
    expect(summary.media.every((m) => m.status === 'ready')).toBe(true);

    const { ctx } = runtime;
    const task = ctx.tasks.get(summary.result.taskId);
    expect(task).toMatchObject({ status: 'draft', externalId: 'yt-first', type: 'video_lesson' });
    const videoId = (task.config as { mediaId: number }).mediaId;
    const video = ctx.media.find(videoId);
    expect(video).toMatchObject({ status: 'ready', kind: 'hls', durationSec: 10.5 });
    expect(ctx.media.files(videoId).map((f) => f.path)).toEqual([
      '360p/index.m3u8',
      '360p/seg_00000.ts',
      '360p/seg_00001.ts',
      '360p/seg_00002.ts',
      '480p/index.m3u8',
      '480p/seg_00000.ts',
      '480p/seg_00001.ts',
      '480p/seg_00002.ts',
      'master.m3u8',
    ]);
    const images = summary.media.find((m) => m.role === 'question_image');
    const bank = ctx.questions.list(summary.result.taskId);
    expect(bank.map((q) => q.key)).toEqual(['q1', 'q2', 'q3']);
    expect(bank[0]?.image).toBe(`media/${images?.id}/q1.webp`);
    expect(ctx.questions.transcripts(summary.result.taskId)).toHaveLength(1);
  });

  it('a second run transcodes nothing and sends no file again', async () => {
    const folder = lessonFolder('again');
    const fake = fakeFfmpeg();
    await importLesson(folder, { client: client(), tools: fake.tools, encoder: 'auto' });
    seen = [];
    const second = await importLesson(folder, {
      client: client(),
      tools: fake.tools,
      encoder: 'auto',
    });
    expect(fake.transcodes).toHaveLength(1);
    expect(second.prepared.hls.made).toBe(false);
    expect(second.result.outcome).toBe('updated');
    expect(second.stats.bytes).toBe(0);
    expect(seen.filter((r) => r.startsWith('PUT'))).toEqual([]);
  });

  it('re-encodes when the source video is newer than the HLS', async () => {
    const folder = lessonFolder('newer');
    const fake = fakeFfmpeg();
    await importLesson(folder, { client: client(), tools: fake.tools, encoder: 'auto' });
    const later = new Date(Date.now() + 60_000);
    utimesSync(path.join(folder, 'video.mp4'), later, later);
    const second = await importLesson(folder, {
      client: client(),
      tools: fake.tools,
      encoder: 'auto',
    });
    expect(fake.transcodes).toHaveLength(2);
    expect(second.result.outcome).toBe('updated');
    expect(second.stats.bytes).toBeGreaterThan(0);
  });

  it('falls back to libx264 without NVENC', async () => {
    const folder = lessonFolder('x264');
    const fake = fakeFfmpeg({ nvenc: false });
    const summary = await importLesson(folder, {
      client: client(),
      tools: fake.tools,
      encoder: 'auto',
    });
    expect(fake.transcodes[0]).toContain('libx264');
    expect(summary.prepared.hls.encoder).toBe('x264');
  });

  it('resumes after a broken connection from the offset the server has', async () => {
    const folder = lessonFolder('flaky');
    const fake = fakeFfmpeg({ segmentBytes: 3 * 1024 * 1024 });
    let broken = false;
    // The first segment upload: half of the body reaches the server, then the line drops.
    const flaky: Fetch = async (url, init) => {
      if (!broken && init.method === 'PUT' && url.includes('480p/seg_00001.ts')) {
        broken = true;
        const body = init.body as Buffer;
        await apiFetch(url, { ...init, body: body.subarray(0, Math.floor(body.length / 2)) });
        throw new TypeError('fetch failed: socket hang up');
      }
      return apiFetch(url, init);
    };
    seen = [];
    const summary = await importLesson(folder, {
      client: client(flaky),
      tools: fake.tools,
      encoder: 'auto',
    });
    expect(broken).toBe(true);
    expect(summary.media.every((m) => m.status === 'ready')).toBe(true);
    // After the break it asked where the server stands, then sent only the rest.
    expect(seen).toContain(`GET /api/import/media/${summary.media[0]?.id}`);
    const segmentPuts = seen.filter((r) => r.includes('480p/seg_00001.ts'));
    expect(segmentPuts).toHaveLength(2);
    const files = [
      ...summary.prepared.manifest.media.files,
      ...(summary.prepared.manifest.images?.files ?? []),
    ];
    const total = files.reduce((n, f) => n + f.size, 0);
    const lost = Math.floor((3 * 1024 * 1024 + 1) / 2);
    expect(summary.stats.bytes).toBe(total - lost);
  });

  it('uses ready HLS from the package without ffmpeg', async () => {
    const source = lessonFolder('made-elsewhere');
    const fake = fakeFfmpeg();
    await importLesson(source, { client: client(), tools: fake.tools, encoder: 'auto' });
    const folder = lessonFolder('hls-only', { externalId: 'yt-hls-only' });
    rmSync(path.join(folder, 'video.mp4'));
    mkdirSync(path.join(folder, 'hls', '480p'), { recursive: true });
    mkdirSync(path.join(folder, 'hls', '360p'), { recursive: true });
    for (const rel of [
      'master.m3u8',
      '360p/index.m3u8',
      '360p/seg_00000.ts',
      '360p/seg_00001.ts',
      '360p/seg_00002.ts',
      '480p/index.m3u8',
      '480p/seg_00000.ts',
      '480p/seg_00001.ts',
      '480p/seg_00002.ts',
    ]) {
      copyFileSync(
        path.join(source, 'hls', ...rel.split('/')),
        path.join(folder, 'hls', ...rel.split('/')),
      );
    }
    const never = fakeFfmpeg({ fail: true });
    const summary = await importLesson(folder, {
      client: client(),
      tools: never.tools,
      encoder: 'auto',
    });
    expect(never.transcodes).toHaveLength(0);
    expect(summary.result.outcome).toBe('created');
  });

  it('checks lesson.json before any work and sends nothing when it is wrong', async () => {
    const folder = lessonFolder('invalid', {
      subjectKey: 'Математика',
      questions: [question(1, 'images/missing.webp'), { ...question(2), correct: 'z' }],
    });
    const fake = fakeFfmpeg();
    seen = [];
    const error = await importLesson(folder, {
      client: client(),
      tools: fake.tools,
      encoder: 'auto',
    }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(LessonError);
    const problems = (error as LessonError).problems.join('\n');
    expect(problems).toContain('images/missing.webp');
    expect(problems).toContain('subjectKey');
    expect(problems).toContain('questions.1');
    expect(fake.transcodes).toHaveLength(0);
    expect(seen).toEqual([]);
  });

  it('a picture outside images/ is refused', async () => {
    const folder = lessonFolder('outside', { questions: [question(1, 'q1.webp')] });
    await expect(
      importLesson(folder, { client: client(), tools: fakeFfmpeg().tools, encoder: 'auto' }),
    ).rejects.toThrow('images/');
  });

  it('a wrong token is reported by the server', async () => {
    const folder = lessonFolder('bad-token');
    const wrong = { ...client(), token: 'qci_not_a_token' };
    await expect(
      importLesson(folder, { client: wrong, tools: fakeFfmpeg().tools, encoder: 'auto' }),
    ).rejects.toThrow('unauthenticated');
  });
});
