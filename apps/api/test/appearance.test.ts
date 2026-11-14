// «Оформление» (FEAT-059): any built-in file is replaced with an own upload and answered at its
// own /assets URL; restoring puts the built-in file back; versions are public.
import type { AppearanceDto, AppearanceSlotDto } from '@questclass/shared/assets/appearance';
import { ASSET_SLOTS } from '@questclass/shared/assets/slots';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { CreatedUploadDto } from '../src/modules/uploads/service';
import { frames, mp3, png, webpAnimation } from './fixtures/images';
import { createClient, errorCode, loginAdmin, type TestClient } from './helpers/client';
import { createTempDir, createTestRuntime, removeDir, type TestRuntime } from './helpers/db';
import { quickAdmin } from './helpers/fastUsers';

const LOGO = 'icons/star-v1-32.png';
const MOVIE = 'celebrations/streak-five-v1.webp';
const SOUND = ASSET_SLOTS.find((slot) => slot.group === 'sounds');
const BUILTIN = 'BUILT-IN FILE';

let runtime: TestRuntime;
let tmp: string;
let admin: TestClient;
let app: ReturnType<typeof createApp>['app'];

const put = (file: string, body: string) => {
  const target = path.join(tmp, 'web', 'assets', ...file.split('/'));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, body);
};

beforeEach(async () => {
  runtime = await createTestRuntime();
  tmp = createTempDir('qc-appearance-');
  put('../index.html', '<!doctype html><title>КвестКласс</title>');
  for (const file of [LOGO, MOVIE, ...(SOUND?.files ?? [])]) put(file, BUILTIN);
  app = createApp(runtime.ctx, { webRoot: path.join(tmp, 'web') }).app;
  await quickAdmin(runtime.ctx);
  admin = createClient(app);
  await loginAdmin(admin);
});

afterEach(async () => {
  await runtime.close();
  removeDir(tmp);
});

async function upload(bytes: Uint8Array, forFile: string): Promise<CreatedUploadDto> {
  const res = await admin.request('POST', `/api/admin/uploads?for=${encodeURIComponent(forFile)}`, {
    bytes,
  });
  expect(res.status, await res.clone().text()).toBe(201);
  return (await res.json()) as CreatedUploadDto;
}

const replace = (slot: string, uploadId: number) =>
  admin.request('PUT', `/api/admin/appearance/${slot}`, { json: { uploadId } });

describe('replacing built-in files', () => {
  it('the logo: the replacement is served at the same URL, restoring brings the built-in back', async () => {
    const before = await app.request(`/assets/${LOGO}`);
    expect(await before.text()).toBe(BUILTIN);
    const builtinTag = before.headers.get('etag') ?? '';

    const picture = png(48, 48);
    const own = await upload(picture, LOGO);
    const res = await replace(LOGO, own.id);
    expect(res.status, await res.clone().text()).toBe(200);
    const slot = (await res.json()) as AppearanceSlotDto;
    expect(slot).toMatchObject({ key: LOGO, kind: 'image', group: 'brand' });
    expect(slot.replacement).toMatchObject({ uploadId: own.id, mime: 'image/png' });
    expect(slot.url).toBe(`/assets/${LOGO}?v=${own.id}`);

    // Anyone (the sign-in screen too) gets the replacement; a browser holding the built-in
    // file revalidates with its old ETag and receives the new bytes.
    const after = await app.request(`/assets/${LOGO}`, {
      headers: { 'if-none-match': builtinTag },
    });
    expect(after.status).toBe(200);
    expect(after.headers.get('content-type')).toBe('image/png');
    expect(after.headers.get('etag')).toBe(`"r${own.id}"`);
    expect(new Uint8Array(await after.arrayBuffer())).toEqual(picture);
    // The same file by itself, for the Vite dev and preview servers.
    const direct = await createClient(app).get(`/api/appearance/files/${LOGO}`);
    expect(direct.status).toBe(200);
    expect(new Uint8Array(await direct.arrayBuffer())).toEqual(picture);
    const cached = await app.request(`/assets/${LOGO}`, {
      headers: { 'if-none-match': `"r${own.id}"` },
    });
    expect(cached.status).toBe(304);

    const restored = await admin.delete(`/api/admin/appearance/${LOGO}`);
    expect(restored.status).toBe(200);
    expect(((await restored.json()) as AppearanceSlotDto).replacement).toBeNull();
    const back = await app.request(`/assets/${LOGO}`, {
      headers: { 'if-none-match': `"r${own.id}"` },
    });
    expect(back.status).toBe(200);
    expect(await back.text()).toBe(BUILTIN);
    expect((await admin.get(`/api/appearance/files/${LOGO}`)).status).toBe(404);

    const history = runtime.ctx.audit.list({}).items.map((entry) => entry.action);
    expect(history).toEqual(expect.arrayContaining(['asset.replaced', 'asset.restored']));
  });

  it('a sound: one MP3 answers both the .mp3 and the .ogg address', async () => {
    if (!SOUND) throw new Error('No interface sound in the manifest');
    const sound = await upload(mp3(), SOUND.key);
    expect((await replace(SOUND.key, sound.id)).status).toBe(200);
    for (const file of SOUND.files) {
      const res = await app.request(`/assets/${file}`);
      expect(res.headers.get('content-type'), file).toBe('audio/mpeg');
      expect(new Uint8Array(await res.arrayBuffer()), file).toEqual(mp3());
    }
  });

  it('the streak movie: an animation of its own length, published to every client', async () => {
    const movie = await upload(webpAnimation(64, 64, frames(30, 100)), MOVIE);
    expect((await replace(MOVIE, movie.id)).status).toBe(200);
    const anonymous = createClient(app);
    const res = await anonymous.get('/api/appearance');
    expect(res.status).toBe(200);
    const current = (await res.json()) as AppearanceDto;
    expect(current.files[MOVIE]).toEqual({ version: movie.id, durationMs: 3000 });
    expect(runtime.ctx.appearance.durationOf(MOVIE)).toBe(3000);
  });

  it('refuses a file of another kind, a missing upload and an unknown slot', async () => {
    const still = await upload(png(32, 32), LOGO);
    const wrong = await replace(MOVIE, still.id);
    expect(wrong.status).toBe(400);
    expect(await errorCode(wrong)).toBe('wrong_kind');
    const missing = await replace(LOGO, 9999);
    expect(missing.status).toBe(400);
    expect(await errorCode(missing)).toBe('invalid_upload');
    expect((await replace('game/no-such-file.webp', still.id)).status).toBe(404);
    expect(runtime.ctx.appearance.replacementOf(MOVIE)).toBeUndefined();
  });

  it('lists every replaceable file for the admin, grouped', async () => {
    const res = await admin.get('/api/admin/appearance');
    expect(res.status).toBe(200);
    const slots = (await res.json()) as AppearanceSlotDto[];
    expect(slots).toHaveLength(ASSET_SLOTS.length);
    expect(slots.find((slot) => slot.key === LOGO)).toMatchObject({
      kind: 'image',
      replacement: null,
      url: `/assets/${LOGO}?v=0`,
    });
  });
});
