import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { MediaRow } from '../src/db/schema/media';
import { parseMediaPath, safePath, UnsafePathError } from '../src/modules/media/safePath';
import { parseRange } from '../src/modules/media/stream';
import { READY_NOTE, NOTE_TYPE, noteTaskType } from './fixtures/noteTaskType';
import {
  createClient,
  errorCode,
  loginAdmin,
  trustDevice,
  type TestClient,
} from './helpers/client';
import { createTempDir, createTestRuntime, removeDir, type TestRuntime } from './helpers/db';
import { quickAdmin, quickLearner } from './helpers/fastUsers';

/** Rejections happen before the disk is looked at, so the root need not exist. */
const NOWHERE = path.join(os.tmpdir(), 'qc-media-never-created');

describe('parseMediaPath / safePath', () => {
  const accepted = [
    'master.m3u8',
    '480p/index.m3u8',
    '480p/seg_00001.ts',
    'v/init.m4s',
    'lesson.mp4',
    'images/q-1.webp',
    'a.png',
    'b.jpg',
    'subs/ru.vtt',
    'meta.json',
    // Percent-encoding of allowed characters is decoded once.
    '480p%2Fseg_00001.ts',
  ];
  it.each(accepted)('accepts %s', (raw) => {
    expect(parseMediaPath(raw).segments.length).toBeGreaterThan(0);
  });

  const rejected = [
    '',
    '..',
    '../questclass.db',
    '../../master.key',
    'a/../b.ts',
    './a.ts',
    // URL-encoded traversal, in every spelling.
    '%2e%2e/questclass.db',
    '%2E%2E%2Fquestclass.db',
    '..%2fquestclass.db',
    '..%2F..%2Fmaster.key',
    '%2e%2e%5cquestclass.db',
    '..%5cquestclass.db',
    // Double encoding stays encoded after one decode and is refused.
    '%252e%252e%252fquestclass.db',
    // Absolute paths and drive letters.
    '/etc/passwd',
    '%2Fetc%2Fpasswd.json',
    'C:/Windows/win.ts',
    'C%3A%5Cwin.ts',
    '\\\\server\\share\\a.ts',
    'a\\b.ts',
    // Empty segments, hidden files, trailing slash.
    'a//b.ts',
    '.hidden.ts',
    'a.ts/',
    // NUL, bad encoding, whitespace, upper case.
    'a.ts%00.png',
    '%zz.ts',
    'a b.ts',
    'A.ts',
    'a.TS',
    // Extensions outside the whitelist or none at all.
    'master',
    'run.exe',
    'questclass.db',
    'master.key',
    'a.m3u8.sh',
    'page.html',
    'image.svg',
    // Too deep or too long.
    'a/b/c/d/e.ts',
    `${'a'.repeat(65)}.ts`,
  ];
  it.each(rejected)('rejects %j', async (raw) => {
    expect(() => parseMediaPath(raw)).toThrow(UnsafePathError);
    await expect(safePath(NOWHERE, raw)).rejects.toThrow(UnsafePathError);
  });

  describe('on disk', () => {
    let root: string;
    let outside: string;

    beforeAll(() => {
      root = createTempDir('qc-media-root-');
      outside = createTempDir('qc-media-outside-');
      writeFileSync(path.join(outside, 'secret.ts'), 'secret');
      mkdirSync(path.join(root, '480p'));
      writeFileSync(path.join(root, '480p', 'seg_1.ts'), 'segment');
    });

    afterAll(() => {
      removeDir(root);
      removeDir(outside);
    });

    it('resolves inside the root, also for files that do not exist yet', async () => {
      expect(await safePath(root, '480p/seg_1.ts')).toBe(path.join(root, '480p', 'seg_1.ts'));
      expect(await safePath(root, 'new/dir/file.ts')).toBe(
        path.join(root, 'new', 'dir', 'file.ts'),
      );
    });

    it('rejects a linked directory (symlink or junction) pointing outside', async () => {
      symlinkSync(outside, path.join(root, 'linked'), 'junction');
      await expect(safePath(root, 'linked/secret.ts')).rejects.toThrow(UnsafePathError);
    });

    it('rejects a symlinked file', async (test) => {
      try {
        symlinkSync(path.join(outside, 'secret.ts'), path.join(root, 'link.ts'), 'file');
      } catch (err) {
        // Windows without developer mode cannot create file symlinks (CI on Linux can).
        if ((err as NodeJS.ErrnoException).code === 'EPERM') {
          test.skip();
        }
        throw err;
      }
      await expect(safePath(root, 'link.ts')).rejects.toThrow(UnsafePathError);
    });
  });
});

describe('parseRange', () => {
  it.each([
    ['bytes=0-9', 100, { kind: 'partial', range: { start: 0, end: 9 } }],
    ['bytes=90-', 100, { kind: 'partial', range: { start: 90, end: 99 } }],
    ['bytes=-10', 100, { kind: 'partial', range: { start: 90, end: 99 } }],
    ['bytes=-500', 100, { kind: 'partial', range: { start: 0, end: 99 } }],
    ['bytes=50-1000', 100, { kind: 'partial', range: { start: 50, end: 99 } }],
    ['bytes=100-', 100, { kind: 'unsatisfiable' }],
    ['bytes=-0', 100, { kind: 'unsatisfiable' }],
    ['bytes=0-', 0, { kind: 'unsatisfiable' }],
    ['bytes=9-0', 100, { kind: 'full' }],
    ['bytes=0-1,5-6', 100, { kind: 'full' }],
    ['items=0-1', 100, { kind: 'full' }],
    ['bytes=-', 100, { kind: 'full' }],
  ] as const)('%s of %i bytes', (header, size, expected) => {
    expect(parseRange(header, size)).toEqual(expected);
  });

  it('no header means the whole file', () => {
    expect(parseRange(undefined, 10)).toEqual({ kind: 'full' });
  });
});

describe('GET /api/media/:id/*', () => {
  let runtime: TestRuntime;
  let adminId: number;
  let anya: number;
  let admin: TestClient;
  let a: TestClient;
  let b: TestClient;
  /** Published and assigned to Anya only. */
  let taskA: number;
  let draft: number;
  let subjectId: number | null;
  const segment = randomBytes(300_000);

  const app = () => createApp(runtime.ctx).app;

  async function learnerClient(userId: number, pin: string): Promise<TestClient> {
    const tablet = createClient(app());
    await loginAdmin(tablet);
    await trustDevice(tablet);
    const res = await tablet.post('/api/auth/learner-login', { userId, pin });
    expect(res.status).toBe(200);
    return tablet;
  }

  /** A ready HLS media of `taskId` with a playlist and one segment on disk. */
  function readyMedia(taskId: number | null): MediaRow {
    const { media } = runtime.ctx;
    const row = media.create({ taskId, role: 'video', kind: 'hls' });
    const dir = media.dirOf(row);
    mkdirSync(path.join(dir, '480p'), { recursive: true });
    writeFileSync(path.join(dir, 'master.m3u8'), '#EXTM3U\n');
    writeFileSync(path.join(dir, '480p', 'seg_00001.ts'), segment);
    return media.markReady(row.id, { sizeBytes: segment.length + 8, durationSec: 4 });
  }

  const url = (row: MediaRow, file = '480p/seg_00001.ts') => `/api/media/${row.id}/${file}`;

  beforeAll(async () => {
    runtime = await createTestRuntime();
    const { ctx } = runtime;
    ctx.taskTypes.register(noteTaskType);
    adminId = await quickAdmin(ctx);
    anya = await quickLearner(ctx, 'Аня', '1111');
    const borya = await quickLearner(ctx, 'Боря', '2222');
    subjectId = ctx.subjects.findByKey('math')?.id ?? null;
    const task = (title: string) =>
      ctx.tasks.create({ type: NOTE_TYPE, title, subjectId, config: READY_NOTE }, adminId).id;
    taskA = task('Урок для Ани');
    ctx.tasks.update(taskA, { status: 'published' }, adminId);
    ctx.tasks.assign(taskA, anya, adminId);
    draft = task('Черновик');
    ctx.tasks.assign(draft, anya, adminId);
    admin = createClient(app());
    await loginAdmin(admin);
    a = await learnerClient(anya, '1111');
    b = await learnerClient(borya, '2222');
  }, 30_000);

  afterAll(async () => {
    await runtime.close();
  });

  it('serves the whole file with Accept-Ranges and the content type', async () => {
    const row = readyMedia(taskA);
    const res = await a.get(url(row));
    expect(res.status).toBe(200);
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-type')).toBe('video/mp2t');
    expect(res.headers.get('content-length')).toBe(String(segment.length));
    expect(res.headers.get('cache-control')).toMatch(/^private/);
    expect(Buffer.from(await res.arrayBuffer()).equals(segment)).toBe(true);

    const playlist = await a.get(url(row, 'master.m3u8'));
    expect(playlist.headers.get('content-type')).toBe('application/vnd.apple.mpegurl');
    expect(playlist.headers.get('cache-control')).toBe('private, no-cache');
    expect(await playlist.text()).toBe('#EXTM3U\n');
  });

  it('answers a Range request with 206 and exactly those bytes', async () => {
    const row = readyMedia(taskA);
    const range = (header: string) => a.request('GET', url(row), { headers: { range: header } });

    const first = await range('bytes=0-99');
    expect(first.status).toBe(206);
    expect(first.headers.get('content-range')).toBe(`bytes 0-99/${segment.length}`);
    expect(first.headers.get('content-length')).toBe('100');
    expect(Buffer.from(await first.arrayBuffer()).equals(segment.subarray(0, 100))).toBe(true);

    const middle = await range('bytes=1000-');
    expect(middle.status).toBe(206);
    const middleBytes = Buffer.from(await middle.arrayBuffer());
    expect(middleBytes.equals(segment.subarray(1000))).toBe(true);

    const tail = await range('bytes=-16');
    expect(tail.status).toBe(206);
    expect(Buffer.from(await tail.arrayBuffer()).equals(segment.subarray(-16))).toBe(true);

    const beyond = await range(`bytes=${segment.length}-`);
    expect(beyond.status).toBe(416);
    expect(beyond.headers.get('content-range')).toBe(`bytes */${segment.length}`);
  });

  it('HEAD returns the headers without a body', async () => {
    const row = readyMedia(taskA);
    const res = await a.request('HEAD', url(row));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe(String(segment.length));
    expect((await res.arrayBuffer()).byteLength).toBe(0);
  });

  it('a learner gets only media of a published task they can see; the admin gets any', async () => {
    const visible = readyMedia(taskA);
    const ofDraft = readyMedia(draft);
    const loose = readyMedia(null);

    expect((await a.get(url(visible))).status).toBe(200);
    // Borya is not in the task's audience: the media does not exist for him.
    const other = await b.get(url(visible));
    expect(other.status).toBe(404);
    expect(await errorCode(other)).toBe('not_found');
    expect((await a.get(url(ofDraft))).status).toBe(404);
    expect((await a.get(url(loose))).status).toBe(404);
    expect((await a.get('/api/media/999999/master.m3u8')).status).toBe(404);

    for (const row of [visible, ofDraft, loose]) {
      const res = await admin.get(url(row));
      expect(res.status).toBe(200);
      await res.arrayBuffer();
    }
    expect((await createClient(app()).get(url(visible))).status).toBe(401);
  });

  it('media of an archived task disappears for the learner', async () => {
    const { ctx } = runtime;
    const task = ctx.tasks.create(
      { type: NOTE_TYPE, title: 'Старый урок', subjectId, config: READY_NOTE },
      adminId,
    ).id;
    ctx.tasks.assign(task, anya, adminId);
    ctx.tasks.update(task, { status: 'published' }, adminId);
    const row = readyMedia(task);
    expect((await a.get(url(row, 'master.m3u8'))).status).toBe(200);
    ctx.tasks.update(task, { status: 'archived' }, adminId);
    expect((await a.get(url(row, 'master.m3u8'))).status).toBe(404);
  });

  it('deleted media → 410, its files are gone, the row stays', async () => {
    const row = readyMedia(taskA);
    const dir = runtime.ctx.media.dirOf(row);
    const deleted = runtime.ctx.media.markDeleted(row.id);
    expect(deleted.status).toBe('deleted');
    expect(deleted.deletedAt).not.toBeNull();
    expect(existsSync(dir)).toBe(false);
    for (const client of [a, admin]) {
      const res = await client.get(url(row));
      expect(res.status).toBe(410);
      expect(await errorCode(res)).toBe('media_deleted');
    }
    // Not visible to Borya at all, deleted or not.
    expect((await b.get(url(row))).status).toBe(404);
  });

  it('media that is not ready yet is not served', async () => {
    const { media } = runtime.ctx;
    const row = media.create({
      taskId: taskA,
      role: 'video',
      kind: 'hls',
      files: [{ path: 'master.m3u8', sizeBytes: 8, sha256: 'AB'.repeat(32) }],
    });
    writeFileSync(path.join(media.dirOf(row), 'master.m3u8'), '#EXTM3U\n');
    expect(media.files(row.id)).toEqual([
      expect.objectContaining({ path: 'master.m3u8', sizeBytes: 8, sha256: 'ab'.repeat(32) }),
    ]);
    for (const step of [() => row, () => media.markUploading(row.id)]) {
      expect(step().status).not.toBe('ready');
      const res = await admin.get(url(row, 'master.m3u8'));
      expect(res.status).toBe(404);
      expect(await errorCode(res)).toBe('media_not_ready');
    }
  });

  it('refuses traversal and unlisted files over HTTP without touching other files', async () => {
    const row = readyMedia(taskA);
    for (const file of [
      '..%2f..%2fquestclass.db',
      '..%2F..%2Fmaster.key',
      '%2e%2e%2f%2e%2e%2fmaster.key',
      '480p%2f..%2f..%2f..%2fquestclass.db',
      '..%5c..%5cquestclass.db',
      '%252e%252e%252fmaster.key',
      'C%3A%5CWindows%5Cwin.ini',
      'master.key',
      '480p',
      '480p/missing.ts',
    ]) {
      for (const client of [a, admin]) {
        const res = await client.get(url(row, file));
        expect(res.status, file).toBe(404);
        expect(res.headers.get('content-type'), file).toMatch(/application\/json/);
      }
    }
  });

  it('serves a large file as a stream, byte for byte', async () => {
    const { media } = runtime.ctx;
    const big = randomBytes(5 * 1024 * 1024 + 17);
    const row = media.create({ taskId: taskA, role: 'video', kind: 'mp4' });
    writeFileSync(path.join(media.dirOf(row), 'lesson.mp4'), big);
    media.markReady(row.id, { sizeBytes: big.length, durationSec: 60 });
    const res = await a.get(url(row, 'lesson.mp4'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(Buffer.from(await res.arrayBuffer()).equals(big)).toBe(true);
    const part = await a.request('GET', url(row, 'lesson.mp4'), {
      headers: { range: 'bytes=4194304-4194403' },
    });
    expect(part.status).toBe(206);
    expect(Buffer.from(await part.arrayBuffer()).equals(big.subarray(4194304, 4194404))).toBe(true);
  });

  it('never writes to the database while serving media', async () => {
    const row = readyMedia(taskA);
    const changes = () =>
      (runtime.ctx.db.$client.prepare('SELECT total_changes() AS n').get() as { n: number }).n;
    const before = changes();
    for (const client of [a, admin]) {
      const res = await client.request('GET', url(row), { headers: { range: 'bytes=0-9' } });
      expect(res.status).toBe(206);
      await res.arrayBuffer();
    }
    expect((await b.get(url(row))).status).toBe(404);
    expect(changes()).toBe(before);
  });
});
