// The icon of a subject: a built-in picture or the admin's own upload, never both; learners get
// the uploaded file like any other admin picture.
import type { SubjectDto } from '@questclass/shared/tasks/dto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { CreatedUploadDto } from '../src/modules/uploads/service';
import { frames, png, webpAnimation } from './fixtures/images';
import {
  createClient,
  errorCode,
  loginAdmin,
  trustDevice,
  type TestClient,
} from './helpers/client';
import { quickAdmin, quickLearner } from './helpers/fastUsers';
import { createTestRuntime, type TestRuntime } from './helpers/db';

let runtime: TestRuntime;
let admin: TestClient;
let anya: number;

const app = () => createApp(runtime.ctx).app;

beforeEach(async () => {
  runtime = await createTestRuntime();
  await quickAdmin(runtime.ctx);
  anya = await quickLearner(runtime.ctx, 'Аня', '1111');
  admin = createClient(app());
  await loginAdmin(admin);
});

afterEach(async () => {
  await runtime.close();
});

async function upload(bytes: Uint8Array): Promise<CreatedUploadDto> {
  const res = await admin.request('POST', '/api/admin/uploads', { bytes });
  expect(res.status, await res.clone().text()).toBe(201);
  return (await res.json()) as CreatedUploadDto;
}

async function json<T>(res: Response, status: number): Promise<T> {
  expect(res.status, await res.clone().text()).toBe(status);
  return (await res.json()) as T;
}

const mathId = (): number => {
  const row = runtime.ctx.subjects.findByKey('math');
  if (!row) throw new Error('No subject math');
  return row.id;
};

describe('subject icons', () => {
  it('a new subject takes an uploaded picture as its icon', async () => {
    const picture = await upload(png(256, 256));
    const music = await json<SubjectDto>(
      await admin.post('/api/admin/subjects', { name: 'Музыка', iconUploadId: picture.id }),
      201,
    );
    expect(music).toMatchObject({ icon: null, iconUploadId: picture.id });
    const listed = await json<SubjectDto[]>(await admin.get('/api/admin/subjects'), 200);
    expect(listed.find((s) => s.id === music.id)?.iconUploadId).toBe(picture.id);
  });

  it('switching between a built-in and an uploaded icon keeps only one of them', async () => {
    const math = mathId();
    const picture = await upload(png(128, 128));

    const own = await json<SubjectDto>(
      await admin.patch(`/api/admin/subjects/${math}`, { iconUploadId: picture.id }),
      200,
    );
    expect(own).toMatchObject({ icon: null, iconUploadId: picture.id });

    const builtIn = await json<SubjectDto>(
      await admin.patch(`/api/admin/subjects/${math}`, { icon: 'game/subjects-pixel/world' }),
      200,
    );
    expect(builtIn).toMatchObject({ icon: 'game/subjects-pixel/world', iconUploadId: null });

    const none = await json<SubjectDto>(
      await admin.patch(`/api/admin/subjects/${math}`, { icon: null }),
      200,
    );
    expect(none).toMatchObject({ icon: null, iconUploadId: null });

    const changes = runtime.ctx.audit
      .list({ action: 'subject.updated' })
      .items.filter((entry) => entry.entityId === String(math))
      .map((entry) => (entry.payload as { changed: string[] }).changed);
    expect(changes).toHaveLength(3);
    expect(changes).toEqual(
      expect.arrayContaining([['icon', 'iconUploadId'], ['icon', 'iconUploadId'], ['icon']]),
    );
  });

  it('refuses both icons at once, an animation and a missing upload', async () => {
    const math = mathId();
    const picture = await upload(png(64, 64));
    const both = await admin.patch(`/api/admin/subjects/${math}`, {
      icon: 'game/subjects-pixel/art',
      iconUploadId: picture.id,
    });
    expect(both.status).toBe(400);

    const animation = await upload(webpAnimation(64, 64, frames(4)));
    const animated = await admin.patch(`/api/admin/subjects/${math}`, {
      iconUploadId: animation.id,
    });
    expect(animated.status).toBe(400);
    expect(await errorCode(animated)).toBe('invalid_icon');

    const missing = await admin.post('/api/admin/subjects', { name: 'Пение', iconUploadId: 9999 });
    expect(missing.status).toBe(400);
    expect(await errorCode(missing)).toBe('invalid_icon');
    expect(runtime.ctx.subjects.findByKey('math')?.icon).toBe('game/subjects-pixel/math');
  });

  it('the learner sees the uploaded icon and can load its file', async () => {
    const picture = await upload(png(96, 96));
    await json(
      await admin.patch(`/api/admin/subjects/${mathId()}`, { iconUploadId: picture.id }),
      200,
    );
    const tablet = createClient(app());
    await loginAdmin(tablet);
    await trustDevice(tablet);
    expect(
      (await tablet.post('/api/auth/learner-login', { userId: anya, pin: '1111' })).status,
    ).toBe(200);
    const subjects = await json<SubjectDto[]>(await tablet.get('/api/subjects'), 200);
    expect(subjects.find((s) => s.key === 'math')?.iconUploadId).toBe(picture.id);
    const file = await tablet.get(`/api/uploads/${picture.id}`);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toContain('image/png');
  });
});
