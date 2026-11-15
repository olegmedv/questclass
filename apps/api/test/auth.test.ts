import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { DB_FILENAME } from '../src/db/client';
import { sha256Hex } from '../src/modules/auth/crypto';
import { ACTIVITY_COOKIE, DEVICE_COOKIE, SESSION_COOKIE } from '../src/modules/auth/routes';
import { issueSetupToken, setupTokenPath } from '../src/modules/auth/setupToken';
import { closeAll, startup } from '../src/startup';
import {
  ADMIN,
  createClient,
  createLearner,
  errorCode,
  loginAdmin,
  seedAdmin,
  trustDevice,
  type TestClient,
} from './helpers/client';
import { createTempDir, createTestRuntime, removeDir, type TestRuntime } from './helpers/db';

const MINUTE = 60_000;
const T0 = Date.parse('2026-11-14T09:00:00Z');

let runtime: TestRuntime;

beforeEach(async () => {
  runtime = await createTestRuntime();
});

afterEach(async () => {
  vi.useRealTimers();
  await runtime.close();
});

const app = () => createApp(runtime.ctx).app;

function databaseText(): string {
  runtime.ctx.db.$client.pragma('wal_checkpoint(TRUNCATE)');
  return readFileSync(path.join(runtime.dataDir, DB_FILENAME)).toString('latin1');
}

function totalChanges(): number {
  const row = runtime.ctx.db.$client.prepare('SELECT total_changes() AS n').get() as { n: number };
  return row.n;
}

async function me(client: TestClient): Promise<{ status: number; role?: string }> {
  const res = await client.get('/api/auth/me');
  if (res.status !== 200) {
    return { status: res.status };
  }
  return { status: 200, role: ((await res.json()) as { role: string }).role };
}

function useClock(start: number): (ms: number) => void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(start);
  let now = start;
  return (ms) => {
    now += ms;
    vi.setSystemTime(now);
  };
}

describe('first run', () => {
  it('writes only the hash of the setup token to DATA_DIR and the token to the log', async () => {
    const dir = createTempDir();
    const logged: string[] = [];
    const spy = vi.spyOn(console, 'info').mockImplementation((line: unknown) => {
      logged.push(String(line));
    });
    try {
      const fresh = await startup(loadConfig({ NODE_ENV: 'test', DATA_DIR: dir }));
      await closeAll(fresh.closers);
    } finally {
      spy.mockRestore();
    }
    const token = logged.join('\n').match(/setup token: (\S+)/)?.[1] ?? '';
    const stored = readFileSync(setupTokenPath(dir), 'utf8').trim();
    expect(token).not.toBe('');
    expect(stored).toBe(sha256Hex(token));
    expect(stored).not.toContain(token);
    removeDir(dir);
  });

  it('creates the first admin only with the setup token, and only once', async () => {
    const token = issueSetupToken(runtime.dataDir);
    const client = createClient(app());
    expect(await (await client.get('/api/setup')).json()).toEqual({ needed: true });

    const body = { login: 'mama', password: 'correct-horse-battery', name: 'Мама' };
    const wrong = await client.post('/api/setup', { ...body, token: 'guess' });
    expect(wrong.status).toBe(403);
    expect(await errorCode(wrong)).toBe('invalid_setup_token');

    const created = await client.post('/api/setup', { ...body, token });
    expect(created.status).toBe(201);
    expect(await me(client)).toEqual({ status: 200, role: 'admin' });
    expect(existsSync(setupTokenPath(runtime.dataDir))).toBe(false);
    expect(await (await client.get('/api/setup')).json()).toEqual({ needed: false });

    const again = await createClient(app()).post('/api/setup', { ...body, token });
    expect(again.status).toBe(409);
    expect(runtime.ctx.users.list({ role: 'admin' })).toHaveLength(1);
  });

  it('issues no setup token once an admin exists', async () => {
    await seedAdmin(runtime.ctx);
    expect(runtime.ctx.auth.ensureSetupToken()).toBeNull();
    expect(existsSync(setupTokenPath(runtime.dataDir))).toBe(false);
  });
});

describe('admin session', () => {
  beforeEach(async () => {
    await seedAdmin(runtime.ctx);
  });

  it('logs in with login and password; a wrong password is refused', async () => {
    const client = createClient(app());
    const wrong = await client.post('/api/auth/login', { login: 'mama', password: 'nope-nope' });
    expect(wrong.status).toBe(401);
    expect(await errorCode(wrong)).toBe('invalid_credentials');
    expect(await me(client)).toEqual({ status: 401 });

    await loginAdmin(client);
    expect(await me(client)).toEqual({ status: 200, role: 'admin' });
  });

  it('accepts the login case-insensitively', async () => {
    const res = await createClient(app()).post('/api/auth/login', {
      login: 'MAMA',
      password: ADMIN.password,
    });
    expect(res.status).toBe(200);
  });

  it('sets HttpOnly, SameSite=Lax cookies and keeps only token hashes in the DB', async () => {
    const res = await createClient(app()).post('/api/auth/login', {
      login: ADMIN.login,
      password: ADMIN.password,
    });
    const cookies = res.headers.getSetCookie();
    const session = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`)) ?? '';
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/SameSite=Lax/);
    expect(session).not.toMatch(/Secure/);
    const token = session.split(';')[0]?.split('=')[1] ?? '';
    expect(token.length).toBeGreaterThan(30);
    const text = databaseText();
    expect(text).not.toContain(token);
    expect(text).toContain(sha256Hex(token));
  });

  it('marks cookies Secure in production', async () => {
    const dir = createTempDir();
    const prod = await startup(loadConfig({ NODE_ENV: 'production', DATA_DIR: dir }));
    try {
      await seedAdmin(prod.ctx);
      const res = await createClient(createApp(prod.ctx).app).post('/api/auth/login', {
        login: ADMIN.login,
        password: ADMIN.password,
      });
      expect(res.status).toBe(200);
      expect(res.headers.getSetCookie().every((c) => /;\s*Secure/.test(c))).toBe(true);
    } finally {
      await closeAll(prod.closers);
      removeDir(dir);
    }
  });

  it('never writes to the database while serving GET requests', async () => {
    const client = createClient(app());
    await loginAdmin(client);
    await trustDevice(client);
    const before = totalChanges();
    for (const url of [
      '/api/auth/me',
      '/api/admin/users',
      '/api/admin/audit',
      '/api/auth/devices',
    ]) {
      expect((await client.get(url)).status, url).toBe(200);
    }
    expect((await client.get('/api/auth/profiles')).status).toBe(200);
    expect(totalChanges()).toBe(before);
  });

  it('ends after the idle timeout; activity slides it', async () => {
    const advance = useClock(T0);
    const client = createClient(app());
    await loginAdmin(client);

    advance(20 * MINUTE);
    expect((await me(client)).status).toBe(200); // refreshes the activity stamp
    advance(25 * MINUTE);
    expect((await me(client)).status).toBe(200); // 45 min since login, 25 since last request
    advance(31 * MINUTE);
    expect((await me(client)).status).toBe(401);
  });

  it('ends after the maximum duration even with constant activity', async () => {
    const advance = useClock(T0);
    const client = createClient(app());
    await loginAdmin(client);
    for (let minutes = 0; minutes < 12 * 60 - 20; minutes += 20) {
      advance(20 * MINUTE);
      expect((await me(client)).status).toBe(200);
    }
    advance(25 * MINUTE);
    expect((await me(client)).status).toBe(401);
  });

  it('follows a changed idle setting', async () => {
    const advance = useClock(T0);
    runtime.ctx.settings.set('session.adminIdleMinutes', 10, null);
    const client = createClient(app());
    await loginAdmin(client);
    advance(11 * MINUTE);
    expect((await me(client)).status).toBe(401);
  });

  it('rejects a forged or missing activity cookie', async () => {
    const client = createClient(app());
    await loginAdmin(client);
    const stamp = client.cookies.get(ACTIVITY_COOKIE) ?? '';
    const [, mac] = stamp.split('.');
    client.cookies.set(ACTIVITY_COOKIE, `${Date.now() + 3 * 60 * MINUTE}.${mac}`);
    expect((await me(client)).status).toBe(401);
    client.cookies.delete(ACTIVITY_COOKIE);
    expect((await me(client)).status).toBe(401);
  });

  it('logs out: the session is revoked and cookies are cleared', async () => {
    const client = createClient(app());
    await loginAdmin(client);
    const token = client.cookies.get(SESSION_COOKIE) ?? '';
    const res = await client.post('/api/auth/logout');
    expect(res.status).toBe(204);
    expect(client.cookies.has(SESSION_COOKIE)).toBe(false);

    const replay = createClient(app());
    replay.cookies.set(SESSION_COOKIE, token);
    expect((await me(replay)).status).toBe(401);
    expect((await createClient(app()).post('/api/auth/logout')).status).toBe(401);
  });
});

describe('one session per browser', () => {
  it('a learner login ends the admin session in that browser, and vice versa', async () => {
    await seedAdmin(runtime.ctx);
    const learnerId = await createLearner(runtime.ctx, 'Саша', '1234');
    const browser = createClient(app());
    await loginAdmin(browser);
    await trustDevice(browser);
    const adminToken = browser.cookies.get(SESSION_COOKIE) ?? '';

    const pin = await browser.post('/api/auth/learner-login', { userId: learnerId, pin: '1234' });
    expect(pin.status).toBe(200);
    expect(await me(browser)).toEqual({ status: 200, role: 'learner' });
    expect(browser.cookies.has(ACTIVITY_COOKIE)).toBe(false);
    const oldAdmin = createClient(app());
    oldAdmin.cookies.set(SESSION_COOKIE, adminToken);
    expect((await me(oldAdmin)).status).toBe(401);

    const learnerToken = browser.cookies.get(SESSION_COOKIE) ?? '';
    await loginAdmin(browser);
    expect(await me(browser)).toEqual({ status: 200, role: 'admin' });
    const oldLearner = createClient(app());
    oldLearner.cookies.set(SESSION_COOKIE, learnerToken);
    expect((await me(oldLearner)).status).toBe(401);
  });
});

describe('trusted devices', () => {
  let adminBrowser: TestClient;
  let learnerId: number;

  beforeEach(async () => {
    await seedAdmin(runtime.ctx);
    learnerId = await createLearner(runtime.ctx, 'Саша', '1234');
    adminBrowser = createClient(app());
    await loginAdmin(adminBrowser);
  });

  it('profiles and PIN login need the device cookie, otherwise 403', async () => {
    const stranger = createClient(app());
    const profiles = await stranger.get('/api/auth/profiles');
    expect(profiles.status).toBe(403);
    expect(await errorCode(profiles)).toBe('device_not_trusted');
    const pin = await stranger.post('/api/auth/learner-login', { userId: learnerId, pin: '1234' });
    expect(pin.status).toBe(403);

    await trustDevice(adminBrowser);
    const list = await adminBrowser.get('/api/auth/profiles');
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([{ id: learnerId, name: 'Саша', avatar: null }]);
  });

  it('a wrong PIN is refused', async () => {
    await trustDevice(adminBrowser);
    const res = await adminBrowser.post('/api/auth/learner-login', {
      userId: learnerId,
      pin: '9999',
    });
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe('invalid_pin');
  });

  it('stores only the hash of the device token', async () => {
    await trustDevice(adminBrowser);
    const token = adminBrowser.cookies.get(DEVICE_COOKIE) ?? '';
    expect(token.length).toBeGreaterThan(30);
    expect(databaseText()).not.toContain(token);
  });

  it('revoking a device closes the picker there and ends its learner sessions', async () => {
    const deviceId = await trustDevice(adminBrowser);
    const tablet = createClient(app());
    tablet.cookies.set(DEVICE_COOKIE, adminBrowser.cookies.get(DEVICE_COOKIE) ?? '');
    expect(
      (await tablet.post('/api/auth/learner-login', { userId: learnerId, pin: '1234' })).status,
    ).toBe(200);
    expect((await me(tablet)).role).toBe('learner');

    const revoked = await adminBrowser.delete(`/api/auth/devices/${deviceId}`);
    expect(revoked.status).toBe(200);
    expect(((await revoked.json()) as { revokedAt: string | null }).revokedAt).not.toBeNull();
    expect((await me(tablet)).status).toBe(401);
    expect((await tablet.get('/api/auth/profiles')).status).toBe(403);
    const devices = (await (await adminBrowser.get('/api/auth/devices')).json()) as unknown[];
    expect(devices).toHaveLength(1);
  });

  it('only admins manage devices', async () => {
    const stranger = createClient(app());
    expect((await stranger.post('/api/auth/devices', { name: 'x' })).status).toBe(401);
    expect((await stranger.get('/api/auth/devices')).status).toBe(401);
  });
});
