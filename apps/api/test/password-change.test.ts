// FEAT-056: the admin changes their own password. The current password must match (throttled
// like the login: 403 when wrong, 429 after too many tries); the admin's other sessions end and
// this one stays; the audit records the fact, never a password or a hash.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createThrottle, throttleKeys } from '../src/modules/auth/throttle';
import { ADMIN, createClient, errorCode, loginAdmin, seedAdmin } from './helpers/client';
import { createTestRuntime, type TestRuntime } from './helpers/db';

let runtime: TestRuntime;
let adminId: number;

beforeEach(async () => {
  runtime = await createTestRuntime();
  adminId = await seedAdmin(runtime.ctx);
});

afterEach(async () => {
  await runtime.close();
});

const app = () => createApp(runtime.ctx).app;
const NEXT = 'brand-new-password-1';

async function change(client: ReturnType<typeof createClient>, current: string, next = NEXT) {
  return client.request('PUT', '/api/me/password', { json: { current, next } });
}

describe('PUT /api/me/password', () => {
  it('needs the current password; then only the new one opens the cabinet', async () => {
    const phone = createClient(app());
    await loginAdmin(phone);
    const wrong = await change(phone, 'not-my-password');
    expect(wrong.status).toBe(403);
    expect(await errorCode(wrong)).toBe('invalid_password');

    const ok = await change(phone, ADMIN.password);
    expect(ok.status).toBe(204);

    const old = await createClient(app()).post('/api/auth/login', {
      login: ADMIN.login,
      password: ADMIN.password,
    });
    expect(old.status).toBe(401);
    await loginAdmin(createClient(app()), { ...ADMIN, password: NEXT });
  });

  it('ends the admin’s other sessions and keeps this one', async () => {
    const laptop = createClient(app());
    const phone = createClient(app());
    await loginAdmin(laptop);
    await loginAdmin(phone);
    expect((await change(phone, ADMIN.password)).status).toBe(204);
    expect((await phone.get('/api/auth/me')).status).toBe(200);
    expect((await laptop.get('/api/auth/me')).status).toBe(401);
  });

  it('checks the new password and refuses the same one', async () => {
    const client = createClient(app());
    await loginAdmin(client);
    const short = await change(client, ADMIN.password, 'short');
    expect(short.status).toBe(400);
    expect(await errorCode(short)).toBe('validation_failed');
    const same = await change(client, ADMIN.password, ADMIN.password);
    expect(same.status).toBe(400);
    expect(await errorCode(same)).toBe('same_password');
  });

  it('is throttled like the login: guessing gets 429 with Retry-After', async () => {
    const client = createClient(app());
    await loginAdmin(client);
    for (let i = 0; i < 3; i++) {
      expect((await change(client, `guess-${i}-password`)).status).toBe(403);
    }
    // The fourth failure starts the delay; the next try is refused before checking.
    expect((await change(client, 'guess-3-password')).status).toBe(403);
    const locked = await change(client, ADMIN.password);
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0);
    const throttle = createThrottle(runtime.ctx.db);
    expect(throttle.retryAfter(throttleKeys(`admin:${ADMIN.login}`, '127.0.0.1'))).toBeGreaterThan(
      0,
    );
  });

  it('records the change in the audit without any secret', async () => {
    const client = createClient(app());
    await loginAdmin(client);
    await loginAdmin(createClient(app()));
    expect((await change(client, ADMIN.password)).status).toBe(204);
    const records = runtime.ctx.audit.list({ action: 'user.password_changed' }).items;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      actorId: adminId,
      entity: 'user',
      entityId: String(adminId),
      payload: { login: ADMIN.login, otherSessionsClosed: 1 },
    });
    const text = JSON.stringify(runtime.ctx.audit.list().items);
    expect(text).not.toContain(NEXT);
    expect(text).not.toContain(ADMIN.password);
  });

  it('is for admins only', async () => {
    const anonymous = await change(createClient(app()), ADMIN.password);
    expect(anonymous.status).toBe(401);
  });
});
