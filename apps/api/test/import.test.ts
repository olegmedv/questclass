import type {
  ImportLessonResultDto,
  ImportMediaDto,
  IssuedImportTokenDto,
  RevisionDetailDto,
  RevisionSummaryDto,
  UploadResultDto,
} from '@questclass/shared/import/manifest';
import type { QuestionContent } from '@questclass/shared/questions/schema';
import type { VideoLessonConfig } from '@questclass/shared/task-types/video_lesson/contract';
import type { TaskDto } from '@questclass/shared/tasks/dto';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type AppContext } from '../src/app';
import type { AppEnv } from '../src/http/route';
import { createImportService } from '../src/modules/import/service';
import { createClient, errorCode, loginAdmin, type TestClient } from './helpers/client';
import { createTestRuntime, type TestRuntime } from './helpers/db';
import { quickAdmin, quickLearner } from './helpers/fastUsers';

let runtime: TestRuntime;
let adminId: number;
let learnerId: number;
let admin: TestClient;
let token: string;

const ENV = {
  incoming: { socket: { remoteAddress: '127.0.0.1' } },
} as unknown as AppEnv['Bindings'];

const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');

/** A lesson-prep package: files on the "admin's PC" and the manifest describing them. */
interface Package {
  readonly files: Record<string, Buffer>;
  readonly images: Record<string, Buffer>;
  readonly manifest: Record<string, unknown>;
}

const question = (n: number, extra: Partial<QuestionContent> = {}) => ({
  key: `q${n}`,
  text: `Вопрос ${n}`,
  options: [
    { id: 'a', text: `${n}-А` },
    { id: 'b', text: `${n}-Б` },
    { id: 'c', text: `${n}-В` },
    { id: 'd', text: `${n}-Г` },
  ],
  correct: 'b',
  evidence: { start: n * 10, end: n * 10 + 5, quote: `цитата ${n}` },
  ...extra,
});

function lessonPackage(
  externalId: string,
  options: { seed?: string; questions?: number; title?: string } = {},
): Package {
  const seed = options.seed ?? 'v1';
  const files: Record<string, Buffer> = {
    'master.m3u8': Buffer.from(`#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\n480p/index.m3u8\n`),
    '480p/index.m3u8': Buffer.from(`#EXTM3U\n#EXTINF:4.0,\nseg_00000.ts\n# ${seed}\n`),
    '480p/seg_00000.ts': randomBytes(20_000),
  };
  const images: Record<string, Buffer> = { 'q1.webp': randomBytes(500) };
  const describe = (set: Record<string, Buffer>) =>
    Object.entries(set).map(([p, data]) => ({ path: p, size: data.length, sha256: sha256(data) }));
  const count = options.questions ?? 3;
  return {
    files,
    images,
    manifest: {
      externalId,
      subjectKey: 'math',
      title: options.title ?? 'Логические задачи',
      lessonDate: '2026-09-01',
      xp: 120,
      coins: 300,
      questions: Array.from({ length: count }, (_, i) =>
        question(i + 1, i === 0 ? { image: 'q1.webp' } : {}),
      ),
      transcript: {
        lang: 'ru',
        source: 'youtube',
        segments: [{ start: 0, end: 4, text: 'Привет' }],
      },
      media: { kind: 'hls', files: describe(files) },
      images: { files: describe(images) },
    },
  };
}

const app = (ctx: AppContext = runtime.ctx) => createApp(ctx).app;

/** What the tests send as a request body. */
type Body = string | Uint8Array | ReadableStream<Uint8Array>;

function importRequest(
  method: string,
  url: string,
  body?: Body | null,
  headers: Record<string, string> = {},
  ctx?: AppContext,
): Promise<Response> {
  // Node needs `duplex` to send a stream body.
  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers: { authorization: `Bearer ${token}`, ...headers },
    ...(body !== undefined && body !== null && { body }),
    ...(body instanceof ReadableStream && { duplex: 'half' }),
  };
  return Promise.resolve(app(ctx).request(url, init, ENV));
}

const postJson = (url: string, json: unknown, ctx?: AppContext) =>
  importRequest('POST', url, JSON.stringify(json), { 'content-type': 'application/json' }, ctx);

async function importLesson(pkg: Package, expected = 201): Promise<ImportLessonResultDto> {
  const res = await postJson('/api/import/lessons', pkg.manifest);
  expect(res.status, await res.clone().text()).toBe(expected);
  return (await res.json()) as ImportLessonResultDto;
}

const putChunk = (mediaId: number, file: string, offset: number, body: Body | null) =>
  importRequest('PUT', `/api/import/media/${mediaId}/files/${file}?offset=${offset}`, body);

/** Uploads every file of a media in chunks of `chunk` bytes and completes it. */
async function uploadAll(
  media: ImportMediaDto,
  files: Record<string, Buffer>,
  chunk = 7_000,
): Promise<ImportMediaDto> {
  for (const file of media.files) {
    const data = files[file.path] ?? Buffer.alloc(0);
    for (let offset = file.received; offset < data.length; offset += chunk) {
      const res = await putChunk(
        media.id,
        file.path,
        offset,
        data.subarray(offset, offset + chunk),
      );
      expect(res.status, await res.clone().text()).toBe(200);
    }
  }
  const res = await postJson(
    `/api/import/media/${media.id}/completion`,
    media.role === 'video' ? { durationSec: 600 } : {},
  );
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as ImportMediaDto;
}

/** Imports and uploads a lesson; returns the import result. */
async function importAndUpload(pkg: Package, expected = 201): Promise<ImportLessonResultDto> {
  const result = await importLesson(pkg, expected);
  for (const media of result.media) {
    if (media.status !== 'ready') {
      await uploadAll(media, media.role === 'video' ? pkg.files : pkg.images);
    }
  }
  return result;
}

const videoOf = (result: ImportLessonResultDto) =>
  result.media.find((m) => m.role === 'video') ?? result.media[0];
const imagesOf = (result: ImportLessonResultDto) =>
  result.media.find((m) => m.role === 'question_image');

/** A lesson imported, uploaded and published by the admin. */
async function publishedLesson(externalId: string): Promise<{ pkg: Package; taskId: number }> {
  const pkg = lessonPackage(externalId);
  const result = await importAndUpload(pkg);
  const res = await admin.patch(`/api/admin/tasks/${result.taskId}`, { status: 'published' });
  expect(res.status, await res.clone().text()).toBe(200);
  return { pkg, taskId: result.taskId };
}

const taskOf = (taskId: number): TaskDto => runtime.ctx.tasks.get(taskId);
const configOf = (taskId: number) => taskOf(taskId).config as VideoLessonConfig;

beforeAll(async () => {
  runtime = await createTestRuntime();
  adminId = await quickAdmin(runtime.ctx);
  learnerId = await quickLearner(runtime.ctx, 'Аня', '1111');
  admin = createClient(app());
  await loginAdmin(admin);
  const res = await admin.post('/api/admin/import-tokens', { name: 'Ноутбук' });
  expect(res.status).toBe(201);
  token = ((await res.json()) as IssuedImportTokenDto).token;
}, 30_000);

afterAll(async () => {
  await runtime.close();
});

describe('import tokens', () => {
  it('shows the token once and keeps only its hash', async () => {
    const res = await admin.post('/api/admin/import-tokens', { name: 'Второй ПК' });
    expect(res.status).toBe(201);
    const issued = (await res.json()) as IssuedImportTokenDto;
    expect(issued.token).toMatch(/^qci_/);
    const list = (await (await admin.get('/api/admin/import-tokens')).json()) as object[];
    expect(JSON.stringify(list)).not.toContain(issued.token);
    expect(list).toContainEqual(expect.objectContaining({ id: issued.id, name: 'Второй ПК' }));
    const dbFile = readFileSync(path.join(runtime.dataDir, 'questclass.db'));
    const wal = path.join(runtime.dataDir, 'questclass.db-wal');
    const text = dbFile.toString('latin1') + (existsSync(wal) ? readFileSync(wal, 'latin1') : '');
    expect(text).not.toContain(issued.token);
    expect(text).toContain(sha256(issued.token));
  });

  it('a revoked token no longer works; the token works only on /api/import', async () => {
    const res = await admin.post('/api/admin/import-tokens', { name: 'Старый' });
    const issued = (await res.json()) as IssuedImportTokenDto;
    const call = (url: string) =>
      app().request(url, { headers: { authorization: `Bearer ${issued.token}` } }, ENV);
    const anyMedia = videoOf(await importLesson(lessonPackage('token-check')));
    expect((await call(`/api/import/media/${anyMedia?.id}`)).status).toBe(200);
    expect((await call('/api/tasks')).status).toBe(403);
    expect((await call('/api/admin/tasks')).status).toBe(403);
    expect((await admin.delete(`/api/admin/import-tokens/${issued.id}`)).status).toBe(204);
    expect((await call(`/api/import/media/${anyMedia?.id}`)).status).toBe(401);
    const list = (await (await admin.get('/api/admin/import-tokens')).json()) as {
      id: number;
      revokedAt: string | null;
    }[];
    expect(list.find((t) => t.id === issued.id)?.revokedAt).not.toBeNull();
  });
});

describe('POST /api/import/lessons', () => {
  it('creates a draft with media, questions, pictures and the transcript', async () => {
    const pkg = lessonPackage('lesson-new');
    const result = await importLesson(pkg);
    expect(result.outcome).toBe('created');
    expect(result.questions.created).toEqual(['q1', 'q2', 'q3']);
    const video = videoOf(result);
    const images = imagesOf(result);
    expect(video).toMatchObject({ role: 'video', kind: 'hls', status: 'pending' });
    expect(video?.files.map((f) => [f.path, f.received])).toEqual([
      ['480p/index.m3u8', 0],
      ['480p/seg_00000.ts', 0],
      ['master.m3u8', 0],
    ]);
    expect(images).toMatchObject({ role: 'question_image', kind: 'image' });

    const task = taskOf(result.taskId);
    expect(task).toMatchObject({
      type: 'video_lesson',
      status: 'draft',
      title: 'Логические задачи',
      externalId: 'lesson-new',
      lessonDate: '2026-09-01',
      xp: 120,
      coins: 300,
      subjectId: runtime.ctx.subjects.findByKey('math')?.id,
    });
    // The type built the config from the manifest (fromImport).
    expect(task.config).toEqual({
      mediaId: video?.id,
      watchMode: 'percent',
      shutter: { enabled: true, heightPct: 9 },
    });
    const bank = runtime.ctx.questions.list(result.taskId);
    expect(bank.map((q) => [q.key, q.state, q.source])).toEqual([
      ['q1', 'active', 'import'],
      ['q2', 'active', 'import'],
      ['q3', 'active', 'import'],
    ]);
    expect(bank[0]?.image).toBe(`media/${images?.id}/q1.webp`);
    expect(bank[0]?.evidence).toEqual({ start: 10, end: 15, quote: 'цитата 1' });
    expect(runtime.ctx.questions.transcripts(result.taskId)).toEqual([
      expect.objectContaining({ mediaId: video?.id, lang: 'ru', source: 'youtube' }),
    ]);
  });

  it('re-importing a draft updates it in place and reuses unchanged media', async () => {
    const pkg = lessonPackage('lesson-draft');
    const first = await importLesson(pkg);
    const again = await importLesson(
      { ...pkg, manifest: { ...pkg.manifest, title: 'Логические задачи (новое)' } },
      200,
    );
    expect(again.taskId).toBe(first.taskId);
    expect(again.outcome).toBe('updated');
    expect(again.questions.unchanged).toEqual(['q1', 'q2', 'q3']);
    expect(again.media.map((m) => m.id)).toEqual(first.media.map((m) => m.id));
    expect(taskOf(first.taskId).title).toBe('Логические задачи (новое)');
    expect(runtime.ctx.questions.transcripts(first.taskId)).toHaveLength(1);
    expect(runtime.ctx.tasks.list().filter((t) => t.externalId === 'lesson-draft')).toHaveLength(1);
  });

  it('a new video of a draft replaces the old one, which goes to retention', async () => {
    const first = await importLesson(lessonPackage('lesson-video'));
    const second = await importLesson(lessonPackage('lesson-video', { seed: 'v2' }), 200);
    const oldVideo = videoOf(first);
    const newVideo = videoOf(second);
    expect(newVideo?.id).not.toBe(oldVideo?.id);
    expect(configOf(first.taskId).mediaId).toBe(newVideo?.id);
    expect(runtime.ctx.media.find(oldVideo?.id ?? 0)?.deleteAfter).not.toBeNull();
    expect(runtime.ctx.media.find(newVideo?.id ?? 0)?.deleteAfter).toBeNull();
  });

  it('keeps the admin’s watch settings of a draft on re-import', async () => {
    const first = await importLesson(lessonPackage('lesson-settings'));
    const config = configOf(first.taskId);
    await admin.patch(`/api/admin/tasks/${first.taskId}`, {
      config: { ...config, watchMode: 'manual' },
    });
    await importLesson(lessonPackage('lesson-settings', { seed: 'v3' }), 200);
    expect(configOf(first.taskId).watchMode).toBe('manual');
  });

  it('validates the manifest', async () => {
    const pkg = lessonPackage('lesson-invalid');
    const m = pkg.manifest;
    const media = m['media'] as { kind: string; files: { path: string }[] };
    const cases: [unknown, number, string][] = [
      [{ ...m, media: { ...media, files: media.files.slice(1) } }, 400, 'validation_failed'],
      [{ ...m, images: undefined }, 400, 'validation_failed'],
      [{ ...m, questions: [question(1), question(1)] }, 400, 'validation_failed'],
      [
        { ...m, media: { ...media, files: [{ ...media.files[0], path: '../x.ts' }] } },
        400,
        'validation_failed',
      ],
      [{ ...m, subjectKey: 'music' }, 422, 'unknown_subject'],
      [{ ...m, type: 'quiz' }, 400, 'type_not_importable'],
    ];
    for (const [manifest, status, code] of cases) {
      const res = await postJson('/api/import/lessons', manifest);
      expect(res.status, JSON.stringify(manifest).slice(0, 80)).toBe(status);
      expect(await errorCode(res)).toBe(code);
    }
  });

  it('refuses a lesson that does not fit on the disk (507)', async () => {
    const ctx = runtime.ctx;
    const full: AppContext = {
      ...ctx,
      imports: createImportService(ctx.db, { ...ctx, freeBytes: () => Promise.resolve(1000) }),
    };
    const res = await postJson('/api/import/lessons', lessonPackage('lesson-full').manifest, full);
    expect(res.status).toBe(507);
    expect(await errorCode(res)).toBe('insufficient_storage');
  });

  it('an archived lesson is not updated', async () => {
    const { taskId } = await publishedLesson('lesson-archived');
    await admin.patch(`/api/admin/tasks/${taskId}`, { status: 'archived' });
    const res = await postJson('/api/import/lessons', lessonPackage('lesson-archived').manifest);
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('task_archived');
  });
});

describe('chunked upload', () => {
  it('appends chunks at the received offset, then completes with sha256 → ready', async () => {
    const pkg = lessonPackage('upload-ok');
    const result = await importLesson(pkg);
    const video = videoOf(result);
    if (!video) {
      throw new Error('no video');
    }
    const segment = pkg.files['480p/seg_00000.ts'] ?? Buffer.alloc(0);
    const first = await putChunk(video.id, '480p/seg_00000.ts', 0, segment.subarray(0, 8000));
    expect((await first.json()) as UploadResultDto).toEqual({
      path: '480p/seg_00000.ts',
      received: 8000,
      complete: false,
    });
    expect(runtime.ctx.media.find(video.id)?.status).toBe('uploading');

    // Wrong offset: 409 with the size the server has.
    const wrong = await putChunk(video.id, '480p/seg_00000.ts', 0, segment.subarray(0, 10));
    expect(wrong.status).toBe(409);
    expect(await wrong.json()).toMatchObject({
      error: { code: 'offset_mismatch', details: { received: 8000 } },
    });

    const status = (await (
      await importRequest('GET', `/api/import/media/${video.id}`)
    ).json()) as ImportMediaDto;
    expect(status.files.find((f) => f.path === '480p/seg_00000.ts')?.received).toBe(8000);

    const ready = await uploadAll(status, pkg.files);
    expect(ready.status).toBe('ready');
    const row = runtime.ctx.media.find(video.id);
    if (!row) {
      throw new Error('media row is gone');
    }
    expect(row).toMatchObject({ status: 'ready', durationSec: 600 });
    expect(row.sizeBytes).toBe(Object.values(pkg.files).reduce((n, b) => n + b.length, 0));
    const onDisk = path.join(runtime.ctx.media.dirOf(row), '480p', 'seg_00000.ts');
    expect(readFileSync(onDisk).equals(segment)).toBe(true);
    // Completing again changes nothing.
    const again = await postJson(`/api/import/media/${video.id}/completion`, { durationSec: 1 });
    expect(again.status).toBe(200);
    expect(runtime.ctx.media.find(video.id)?.durationSec).toBe(600);
    // A ready media takes no more chunks.
    expect((await putChunk(video.id, 'master.m3u8', 0, 'x')).status).toBe(409);
  });

  it('continues after a broken connection from what arrived', async () => {
    const pkg = lessonPackage('upload-resume');
    const video = videoOf(await importLesson(pkg));
    const segment = pkg.files['480p/seg_00000.ts'] ?? Buffer.alloc(0);
    // The connection breaks after 5000 bytes of a 12000-byte chunk.
    let pulls = 0;
    const broken = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) {
          controller.enqueue(new Uint8Array(segment.subarray(0, 5000)));
        } else {
          controller.error(new Error('connection reset'));
        }
      },
    });
    // Content-Length as a real client sends it: the body is streamed straight to disk.
    const res = await importRequest(
      'PUT',
      `/api/import/media/${video?.id}/files/480p/seg_00000.ts?offset=0`,
      broken,
      { 'content-length': '12000' },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: 'upload_interrupted', details: { received: 5000 } },
    });
    const status = (await (
      await importRequest('GET', `/api/import/media/${video?.id}`)
    ).json()) as ImportMediaDto;
    const received = status.files.find((f) => f.path === '480p/seg_00000.ts')?.received ?? -1;
    expect(received).toBe(5000);
    const rest = await putChunk(
      video?.id ?? 0,
      '480p/seg_00000.ts',
      received,
      segment.subarray(received),
    );
    expect(((await rest.json()) as UploadResultDto).complete).toBe(true);
    const now = (await (
      await importRequest('GET', `/api/import/media/${video?.id}`)
    ).json()) as ImportMediaDto;
    expect((await uploadAll(now, pkg.files)).status).toBe('ready');
  });

  it('accepts only declared files and never more than declared', async () => {
    const pkg = lessonPackage('upload-limits');
    const video = videoOf(await importLesson(pkg));
    const id = video?.id ?? 0;
    const master = pkg.files['master.m3u8'] ?? Buffer.alloc(0);
    const undeclared = await putChunk(id, 'other.ts', 0, 'x');
    expect(undeclared.status).toBe(404);

    const tooBig = await putChunk(id, 'master.m3u8', 0, Buffer.concat([master, Buffer.from('!')]));
    expect(tooBig.status).toBe(413);
    expect(await errorCode(tooBig)).toBe('exceeds_declared_size');
    const status = (await (
      await importRequest('GET', `/api/import/media/${id}`)
    ).json()) as ImportMediaDto;
    expect(status.files.find((f) => f.path === 'master.m3u8')?.received).toBe(0);

    // A chunk over 8 MB is refused before it is read.
    const huge = await importRequest(
      'PUT',
      `/api/import/media/${id}/files/480p/seg_00000.ts?offset=0`,
      Buffer.alloc(8 * 1024 * 1024 + 1),
    );
    expect(huge.status).toBe(413);
  });

  it('decodes the path once and refuses traversal', async () => {
    const pkg = lessonPackage('upload-traversal');
    const video = videoOf(await importLesson(pkg));
    const id = video?.id ?? 0;
    for (const file of [
      '..%2f..%2fquestclass.db',
      '%2e%2e%2f%2e%2e%2fmaster.key',
      '480p%2f..%2f..%2f..%2fquestclass.db',
      '..%5cmaster.key',
      '%252e%252e%252fmaster.key',
      'C%3A%5Cwin.ts',
    ]) {
      const res = await putChunk(id, file, 0, 'evil');
      expect(res.status, file).toBe(400);
      expect(await errorCode(res)).toBe('invalid_path');
    }
    // `/%2e%2e/` as a whole segment is resolved by the URL parser itself: the request leaves
    // the upload route altogether.
    expect((await putChunk(id, '%2e%2e/%2e%2e/master.key', 0, 'evil')).status).toBe(404);
    // Percent-encoding of an ordinary path is fine (decoded exactly once).
    const ok = await putChunk(id, '480p%2Findex.m3u8', 0, pkg.files['480p/index.m3u8'] ?? '');
    expect(ok.status).toBe(200);
    const db = statSync(path.join(runtime.dataDir, 'questclass.db'));
    expect(db.size).toBeGreaterThan(4);
  });

  it('refuses a chunk when the disk would fill up (507)', async () => {
    const pkg = lessonPackage('upload-disk');
    const video = videoOf(await importLesson(pkg));
    const ctx = runtime.ctx;
    const full: AppContext = {
      ...ctx,
      imports: createImportService(ctx.db, { ...ctx, freeBytes: () => Promise.resolve(1000) }),
    };
    const res = await importRequest(
      'PUT',
      `/api/import/media/${video?.id}/files/master.m3u8?offset=0`,
      pkg.files['master.m3u8'] ?? '',
      {},
      full,
    );
    expect(res.status).toBe(507);
  });

  it('completion checks sizes and sha256; a corrupted file must be sent again', async () => {
    const pkg = lessonPackage('upload-verify');
    const video = videoOf(await importLesson(pkg));
    const id = video?.id ?? 0;
    const noDuration = await postJson(`/api/import/media/${id}/completion`, {});
    expect(noDuration.status).toBe(400);
    expect(await errorCode(noDuration)).toBe('duration_required');

    const segment = pkg.files['480p/seg_00000.ts'] ?? Buffer.alloc(0);
    const corrupted = Buffer.from(segment);
    corrupted[0] = (corrupted[0] ?? 0) ^ 0xff;
    await putChunk(id, '480p/seg_00000.ts', 0, corrupted);
    await putChunk(id, 'master.m3u8', 0, pkg.files['master.m3u8'] ?? '');
    const res = await postJson(`/api/import/media/${id}/completion`, { durationSec: 600 });
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: { code: string; details: { files: { path: string; problem: string }[] } };
    };
    expect(body.error.code).toBe('verification_failed');
    expect(body.error.details.files).toEqual([
      { path: '480p/index.m3u8', problem: 'incomplete', received: 0 },
      { path: '480p/seg_00000.ts', problem: 'sha256', received: 0 },
    ]);
    expect(runtime.ctx.media.find(id)?.status).toBe('uploading');
    const status = (await (
      await importRequest('GET', `/api/import/media/${id}`)
    ).json()) as ImportMediaDto;
    expect((await uploadAll(status, pkg.files)).status).toBe('ready');
  });
});

describe('revisions of published lessons', () => {
  it('a re-import becomes a pending revision; learners keep the current lesson', async () => {
    const { pkg, taskId } = await publishedLesson('rev-accept');
    runtime.ctx.tasks.assign(taskId, learnerId, adminId);
    const oldMedia = configOf(taskId).mediaId;
    const before = runtime.ctx.tasks.visibleTask(learnerId, taskId);

    // The admin edits q3 by hand: the import may not overwrite it.
    await admin.request('PUT', `/api/admin/tasks/${taskId}/questions/q3`, {
      json: { ...question(3), text: 'Вопрос 3 (мама поправила)' },
    });
    const changed = lessonPackage('rev-accept', { seed: 'v2', questions: 4 });
    const m = changed.manifest;
    const questions = (m['questions'] as ReturnType<typeof question>[]).map((q) =>
      q.key === 'q2' ? { ...q, text: 'Вопрос 2 (новый)' } : q,
    );
    const result = await importLesson(
      {
        ...changed,
        images: pkg.images,
        manifest: { ...m, questions, images: pkg.manifest['images'] },
      },
      200,
    );
    expect(result.outcome).toBe('revision');
    expect(result.questions).toMatchObject({
      created: ['q4'],
      updated: ['q2'],
      conflicts: ['q3'],
    });

    // Learners see exactly what they saw; attempts draw from the active bank.
    expect(runtime.ctx.tasks.visibleTask(learnerId, taskId)).toEqual(before);
    expect(runtime.ctx.questions.activeBank(taskId).map((q) => q.text)).toEqual([
      'Вопрос 1',
      'Вопрос 2',
      'Вопрос 3 (мама поправила)',
    ]);

    const list = (await (
      await admin.get('/api/admin/task-revisions?status=pending')
    ).json()) as RevisionSummaryDto[];
    const summary = list.find((r) => r.id === result.revisionId);
    expect(summary).toMatchObject({ taskId, status: 'pending', mediaReady: false });

    const detail = (await (
      await admin.get(`/api/admin/task-revisions/${result.revisionId}`)
    ).json()) as RevisionDetailDto;
    expect(detail.currentMediaId).toBe(oldMedia);
    expect(detail.mediaId).toBe(videoOf(result)?.id);
    const diff = Object.fromEntries(detail.diff.map((d) => [d.key, d]));
    expect(diff['q2']).toMatchObject({
      change: 'updated',
      current: { text: 'Вопрос 2' },
      proposed: { text: 'Вопрос 2 (новый)' },
    });
    expect(diff['q3']).toMatchObject({
      change: 'conflict',
      current: { text: 'Вопрос 3 (мама поправила)' },
      proposed: { text: 'Вопрос 3' },
    });
    expect(diff['q4']).toMatchObject({ change: 'created', current: null });

    // Not before the new video is uploaded.
    const early = await admin.post(`/api/admin/task-revisions/${result.revisionId}/acceptance`);
    expect(early.status).toBe(409);
    expect(await errorCode(early)).toBe('media_not_ready');

    await uploadAll(videoOf(result) as ImportMediaDto, changed.files);
    const accepted = await admin.post(`/api/admin/task-revisions/${result.revisionId}/acceptance`);
    expect(accepted.status, await accepted.clone().text()).toBe(200);
    expect(((await accepted.json()) as RevisionSummaryDto).status).toBe('accepted');

    expect(configOf(taskId).mediaId).toBe(videoOf(result)?.id);
    expect(runtime.ctx.media.find(oldMedia ?? 0)?.deleteAfter).not.toBeNull();
    expect(runtime.ctx.questions.activeBank(taskId).map((q) => q.text)).toEqual([
      'Вопрос 1',
      'Вопрос 2 (новый)',
      'Вопрос 3 (мама поправила)',
      'Вопрос 4',
    ]);
    expect(runtime.ctx.questions.list(taskId).every((q) => q.state === 'active')).toBe(true);
    expect(taskOf(taskId).status).toBe('published');

    const twice = await admin.post(`/api/admin/task-revisions/${result.revisionId}/acceptance`);
    expect(twice.status).toBe(409);
    expect(await errorCode(twice)).toBe('revision_closed');
  });

  it('rejection archives the proposal and deletes the new media', async () => {
    const { taskId } = await publishedLesson('rev-reject');
    const oldMedia = configOf(taskId).mediaId;
    const changed = lessonPackage('rev-reject', { seed: 'v2', questions: 4 });
    const result = await importLesson(changed, 200);
    const proposed = videoOf(result)?.id ?? 0;
    const proposedRow = runtime.ctx.media.find(proposed);
    if (!proposedRow) {
      throw new Error('no proposed media');
    }
    const dir = runtime.ctx.media.dirOf(proposedRow);

    const res = await admin.post(`/api/admin/task-revisions/${result.revisionId}/rejection`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as RevisionSummaryDto).status).toBe('rejected');
    expect(runtime.ctx.media.find(proposed)?.status).toBe('deleted');
    expect(existsSync(dir)).toBe(false);
    expect(configOf(taskId).mediaId).toBe(oldMedia);
    expect(runtime.ctx.questions.list(taskId).map((q) => [q.key, q.state])).toEqual([
      ['q1', 'active'],
      ['q2', 'active'],
      ['q3', 'active'],
    ]);
    expect(
      (await admin.post(`/api/admin/task-revisions/${result.revisionId}/rejection`)).status,
    ).toBe(409);
  });

  it('a newer import supersedes the pending revision', async () => {
    const { taskId } = await publishedLesson('rev-supersede');
    const first = await importLesson(lessonPackage('rev-supersede', { seed: 'v2' }), 200);
    const second = await importLesson(lessonPackage('rev-supersede', { seed: 'v3' }), 200);
    expect(second.revisionId).not.toBe(first.revisionId);
    const all = (await (
      await admin.get('/api/admin/task-revisions')
    ).json()) as RevisionSummaryDto[];
    const mine = all.filter((r) => r.taskId === taskId);
    expect(mine.map((r) => r.status).sort()).toEqual(['pending', 'superseded']);
    expect(runtime.ctx.media.find(videoOf(first)?.id ?? 0)?.status).toBe('deleted');
  });

  it('re-importing the same package changes nothing', async () => {
    const { pkg, taskId } = await publishedLesson('rev-same');
    const result = await importLesson(pkg, 200);
    expect(result).toMatchObject({ taskId, outcome: 'unchanged', revisionId: null });
    expect(result.media.every((m) => m.status === 'ready')).toBe(true);
  });

  it('acceptance is atomic: a revision that would leave too few questions changes nothing', async () => {
    const { pkg, taskId } = await publishedLesson('rev-atomic');
    const smaller = lessonPackage('rev-atomic', { questions: 2 });
    const result = await importLesson(
      {
        ...smaller,
        images: pkg.images,
        manifest: {
          ...smaller.manifest,
          media: pkg.manifest['media'],
          images: pkg.manifest['images'],
        },
      },
      200,
    );
    expect(result.questions.removed).toEqual(['q3']);
    const res = await admin.post(`/api/admin/task-revisions/${result.revisionId}/acceptance`);
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe('cannot_publish');
    expect(runtime.ctx.questions.activeBank(taskId)).toHaveLength(3);
    const detail = (await (
      await admin.get(`/api/admin/task-revisions/${result.revisionId}`)
    ).json()) as RevisionDetailDto;
    expect(detail.status).toBe('pending');
  });
});
