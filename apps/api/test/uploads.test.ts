import manifestJson from '@questclass/shared/assets/manifest.json';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AppEnv } from '../src/http/route';
import { media } from '../src/db/schema/media';
import {
  UPLOAD_LIMITS,
  type CreatedUploadDto,
  type UploadDto,
} from '../src/modules/uploads/service';
import { inspectImage } from '../src/modules/uploads/webp';
import {
  createClient,
  errorCode,
  loginAdmin,
  trustDevice,
  type TestClient,
} from './helpers/client';
import { quickAdmin, quickLearner } from './helpers/fastUsers';
import { createTestRuntime, type TestRuntime } from './helpers/db';

const ASSETS = fileURLToPath(new URL('../../web/public/assets/', import.meta.url));
const manifest = manifestJson as Record<
  string,
  { kind: string; w?: number; h?: number; animated?: boolean; frames?: number; durationMs?: number }
>;

// ---- fixtures: headers of real formats, built byte by byte ---------------------------------

const bytes = (...parts: (number[] | Uint8Array | string)[]): Uint8Array => {
  const arrays = parts.map((p) =>
    typeof p === 'string'
      ? new TextEncoder().encode(p)
      : p instanceof Uint8Array
        ? p
        : Uint8Array.from(p),
  );
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of arrays) {
    out.set(a, at);
    at += a.length;
  }
  return out;
};
const le32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const le24 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const be16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];

function png(width: number, height: number, padding = 0): Uint8Array {
  const ihdr = bytes(be32(width), be32(height), [8, 6, 0, 0, 0]);
  return bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    be32(13),
    'IHDR',
    ihdr,
    [0, 0, 0, 0],
    be32(padding),
    'IDAT',
    new Uint8Array(padding),
    [0, 0, 0, 0],
    be32(0),
    'IEND',
    [0xae, 0x42, 0x60, 0x82],
  );
}

function jpeg(width: number, height: number): Uint8Array {
  const app0 = bytes([0xff, 0xe0], be16(16), 'JFIF', [0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const sof = bytes(
    [0xff, 0xc0],
    be16(17),
    [8],
    be16(height),
    be16(width),
    [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1],
  );
  return bytes([0xff, 0xd8], app0, sof, [0xff, 0xd9]);
}

const chunk = (fourcc: string, payload: Uint8Array): Uint8Array =>
  bytes(fourcc, le32(payload.length), payload, payload.length % 2 ? [0] : []);
const riff = (...chunks: Uint8Array[]): Uint8Array => {
  const body = bytes('WEBP', ...chunks);
  return bytes('RIFF', le32(body.length), body);
};
const vp8l = (width: number, height: number) => {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  return chunk('VP8L', bytes([0x2f], le32(bits), [0, 0, 0]));
};

function webpStill(width: number, height: number): Uint8Array {
  return riff(vp8l(width, height));
}

function webpAnimation(width: number, height: number, frameMs: readonly number[], padding = 0) {
  const vp8x = chunk('VP8X', bytes([0x12, 0, 0, 0], le24(width - 1), le24(height - 1)));
  const anim = chunk('ANIM', bytes([0, 0, 0, 0], [0, 0]));
  const frames = frameMs.map((ms) =>
    chunk(
      'ANMF',
      bytes(
        le24(0),
        le24(0),
        le24(width - 1),
        le24(height - 1),
        le24(ms),
        [0],
        vp8l(width, height),
      ),
    ),
  );
  return riff(
    vp8x,
    anim,
    ...frames,
    ...(padding > 0 ? [chunk('XPAD', new Uint8Array(padding))] : []),
  );
}

const frames = (n: number, ms = 100) => Array.from({ length: n }, () => ms);
const MIB = 1024 * 1024;

// ---- runtime -------------------------------------------------------------------------------

let runtime: TestRuntime;
let adminId: number;
let anya: number;
let admin: TestClient;

beforeEach(async () => {
  runtime = await createTestRuntime();
  adminId = await quickAdmin(runtime.ctx);
  anya = await quickLearner(runtime.ctx, 'Аня', '1111');
  admin = createClient(createApp(runtime.ctx).app);
  await loginAdmin(admin);
});

afterEach(async () => {
  await runtime.close();
});

const ENV = {
  incoming: { socket: { remoteAddress: '127.0.0.1' } },
} as unknown as AppEnv['Bindings'];
const cookieHeader = (client: TestClient) =>
  [...client.cookies].map(([k, v]) => `${k}=${v}`).join('; ');

async function post(body: Uint8Array, client: TestClient = admin): Promise<Response> {
  return await createApp(runtime.ctx).app.request(
    '/api/admin/uploads',
    {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', cookie: cookieHeader(client) },
      body,
    },
    ENV,
  );
}

async function uploaded(body: Uint8Array): Promise<CreatedUploadDto> {
  const res = await post(body);
  expect(res.status, await res.clone().text()).toBe(201);
  return (await res.json()) as CreatedUploadDto;
}

describe('reading headers', () => {
  it('agrees with the asset manifest on every bundled picture', () => {
    let checked = 0;
    for (const [key, entry] of Object.entries(manifest)) {
      if (!/\.(webp|png)$/.test(key)) continue;
      const info = inspectImage(readFileSync(path.join(ASSETS, key)));
      expect({ w: info.width, h: info.height, animated: info.animated }, key).toEqual({
        w: entry.w,
        h: entry.h,
        animated: entry.animated ?? false,
      });
      if (entry.animated) {
        expect({ frames: info.frames, durationMs: info.durationMs }, key).toEqual({
          frames: entry.frames,
          durationMs: entry.durationMs,
        });
      }
      checked += 1;
    }
    expect(checked).toBeGreaterThan(150);
  });

  it('recognises PNG, JPEG and WebP by signature, not by name or type', () => {
    expect(inspectImage(png(300, 200))).toMatchObject({ type: 'png', width: 300, height: 200 });
    expect(inspectImage(jpeg(640, 480))).toMatchObject({ type: 'jpeg', width: 640, height: 480 });
    expect(inspectImage(webpStill(512, 256))).toMatchObject({
      type: 'webp',
      width: 512,
      height: 256,
      animated: false,
    });
    expect(inspectImage(webpAnimation(64, 32, [100, 60]))).toMatchObject({
      animated: true,
      frames: 2,
      durationMs: 160,
      minFrameMs: 60,
    });
    expect(() => inspectImage(new TextEncoder().encode('GIF89a......'))).toThrow(/PNG, JPG и WebP/);
    expect(() => inspectImage(webpStill(10, 10).subarray(0, 18))).toThrow();
  });
});

describe('POST /api/admin/uploads', () => {
  it('stores pictures as media role=upload and answers their facts', async () => {
    const still = await uploaded(png(512, 512));
    expect(still).toMatchObject({
      mime: 'image/png',
      width: 512,
      height: 512,
      animated: false,
      url: `/api/uploads/${still.id}`,
    });
    const animation = await uploaded(webpAnimation(512, 512, frames(30)));
    expect(animation).toMatchObject({
      mime: 'image/webp',
      animated: true,
      frames: 30,
      durationMs: 3000,
    });
    const photo = await uploaded(jpeg(800, 600));
    expect(photo.mime).toBe('image/jpeg');
    const row = runtime.ctx.media.find(still.id);
    expect(row).toMatchObject({ role: 'upload', kind: 'image', status: 'ready', taskId: null });

    const list = (await (await admin.get('/api/admin/uploads')).json()) as UploadDto[];
    expect(list.map((u) => u.id)).toEqual([photo.id, animation.id, still.id]);
    expect(runtime.ctx.audit.list({ action: 'upload.created' }).items).toHaveLength(3);
  });

  it('enforces the limits of the original', async () => {
    const cases: [Uint8Array, number, string][] = [
      [png(512, 512, 2 * MIB), 413, 'file_too_large'],
      [webpAnimation(512, 512, frames(10), 5 * MIB), 413, 'file_too_large'],
      [png(1025, 100), 422, 'invalid_image'],
      [webpAnimation(1024, 1025, frames(2)), 422, 'invalid_image'],
      [webpAnimation(64, 64, frames(121, 50)), 422, 'invalid_image'],
      [webpAnimation(64, 64, frames(101, 100)), 422, 'invalid_image'], // 10.1 s
      [webpAnimation(64, 64, [100, 39]), 422, 'invalid_image'],
      [webpAnimation(64, 64, [100]), 422, 'invalid_image'],
      [
        new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        415,
        'unsupported_type',
      ],
      [webpStill(64, 64).subarray(0, 22), 422, 'invalid_image'],
    ];
    for (const [body, status, code] of cases) {
      const res = await post(body);
      expect(res.status, `${body.length} bytes → ${code}`).toBe(status);
      expect(await errorCode(res)).toBe(code);
    }
    // Just inside the limits.
    expect((await post(png(1024, 1024, 2 * MIB - 200))).status).toBe(201);
    expect((await post(webpAnimation(64, 64, frames(120, 80)))).status).toBe(201);
    expect((await post(webpAnimation(64, 64, frames(100, 100)))).status).toBe(201);
    // The request body itself is capped at 6 MB.
    const huge = await post(new Uint8Array(UPLOAD_LIMITS.bodyBytes + 1));
    expect(huge.status).toBe(413);
    expect(await errorCode(huge)).toBe('payload_too_large');
    expect(runtime.ctx.uploads.list()).toHaveLength(3);
  });

  it('keeps at most 300 uploads', async () => {
    const now = Date.now();
    runtime.ctx.db
      .insert(media)
      .values(
        Array.from({ length: 299 }, (_, i) => ({
          role: 'upload' as const,
          kind: 'image' as const,
          dir: `filler-${i}`,
          status: 'ready' as const,
          createdAt: now,
        })),
      )
      .run();
    expect((await post(png(10, 10))).status).toBe(201);
    const full = await post(png(10, 10));
    expect(full.status).toBe(409);
    expect(await errorCode(full)).toBe('uploads_full');
  });
});

describe('GET /api/uploads/:id', () => {
  it('serves the file to learners and admins, with its type and nosniff', async () => {
    const body = webpStill(40, 30);
    const { id } = await uploaded(body);
    const tablet = createClient(createApp(runtime.ctx).app);
    await loginAdmin(tablet);
    await trustDevice(tablet);
    expect(
      (await tablet.post('/api/auth/learner-login', { userId: anya, pin: '1111' })).status,
    ).toBe(200);
    for (const client of [tablet, admin]) {
      const res = await client.get(`/api/uploads/${id}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/webp');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(body);
    }
    // Media that are not uploads are not served here.
    const lesson = runtime.ctx.media.create({
      taskId: null,
      role: 'question_image',
      kind: 'image',
    });
    expect((await tablet.get(`/api/uploads/${lesson.id}`)).status).toBe(404);
    expect((await tablet.get('/api/uploads/99999')).status).toBe(404);
    expect((await createClient(createApp(runtime.ctx).app).get(`/api/uploads/${id}`)).status).toBe(
      401,
    );
  });
});

describe('uploads in the catalog', () => {
  it('a shop item can use an uploaded picture and animation', async () => {
    const hero = await uploaded(png(512, 512));
    const live = await uploaded(webpAnimation(512, 512, frames(20)));
    const scene = await uploaded(webpAnimation(768, 512, frames(20)));
    const room = await uploaded(webpStill(768, 512));
    const item = runtime.ctx.catalog.create(
      {
        kind: 'outfit',
        title: 'Мой герой',
        price: 50,
        imageUploadId: hero.id,
        animationUploadId: live.id,
      },
      adminId,
    );
    expect(item).toMatchObject({
      animated: true,
      hero: { image: hero.url },
      animation: { src: live.url },
    });
    const res = await admin.post('/api/admin/catalog/items', {
      kind: 'room',
      title: 'Моя комната',
      price: 100,
      imageUploadId: room.id,
      roomCategory: 'day',
      animationUploadId: scene.id,
    });
    expect(res.status).toBe(201);
    // A still in the animation slot, an animation in the picture slot: refused.
    const wrong = await admin.post('/api/admin/catalog/items', {
      kind: 'outfit',
      title: 'Наоборот',
      price: 1,
      imageUploadId: live.id,
      animationUploadId: hero.id,
    });
    expect(wrong.status).toBe(400);
    expect(await errorCode(wrong)).toBe('invalid_item');
  });
});
