import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { runCli, type CliIo } from '../src/cli/index';
import { DB_FILENAME } from '../src/db/client';
import { SESSION_COOKIE } from '../src/modules/auth/routes';
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
import { createTestRuntime, type TestRuntime } from './helpers/db';

let runtime: TestRuntime;
let admin: TestClient;
let adminId: number;

beforeEach(async () => {
  runtime = await createTestRuntime();
  adminId = await seedAdmin(runtime.ctx);
  admin = createClient(createApp(runtime.ctx).app);
  await loginAdmin(admin);
});

afterEach(async () => {
  await runtime.close();
});

const app = () => createApp(runtime.ctx).app;

function databaseText(): string {
  runtime.ctx.db.$client.pragma('wal_checkpoint(TRUNCATE)');
  return readFileSync(path.join(runtime.dataDir, DB_FILENAME)).toString('latin1');
}

async function learnerSession(learnerId: number, pin: string): Promise<TestClient> {
  const tablet = createClient(app());
  await loginAdmin(tablet);
  await trustDevice(tablet);
  const res = await tablet.post('/api/auth/learner-login', { userId: learnerId, pin });
  expect(res.status).toBe(200);
  return tablet;
}

describe('creating users', () => {
  it('creates admins and learners; hashes are never returned', async () => {
    const learner = await admin.post('/api/admin/users', {
      role: 'learner',
      name: 'Саша',
      pin: '1234',
    });
    expect(learner.status).toBe(201);
    const body = (await learner.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ role: 'learner', name: 'Саша', active: true, hasPin: true });
    expect(JSON.stringify(body)).not.toMatch(/hash|1234/i);

    const second = await admin.post('/api/admin/users', {
      role: 'admin',
      name: 'Папа',
      login: 'Papa',
      password: 'another-long-pass',
    });
    expect(second.status).toBe(201);
    expect(((await second.json()) as { login: string }).login).toBe('papa');
  });

  it('rejects duplicate logins and invalid input', async () => {
    const dup = await admin.post('/api/admin/users', {
      role: 'admin',
      name: 'X',
      login: ADMIN.login,
      password: 'another-long-pass',
    });
    expect(dup.status).toBe(409);
    expect(await errorCode(dup)).toBe('login_taken');
    const badPin = await admin.post('/api/admin/users', { role: 'learner', name: 'Y', pin: '12' });
    expect(badPin.status).toBe(400);
    const shortPassword = await admin.post('/api/admin/users', {
      role: 'admin',
      name: 'Z',
      login: 'zed',
      password: 'short',
    });
    expect(shortPassword.status).toBe(400);
  });

  it('lists users with role and active filters', async () => {
    await createLearner(runtime.ctx, 'Саша', '1234');
    const all = (await (await admin.get('/api/admin/users')).json()) as unknown[];
    expect(all).toHaveLength(2);
    const learners = (await (await admin.get('/api/admin/users?role=learner')).json()) as {
      name: string;
    }[];
    expect(learners.map((u) => u.name)).toEqual(['Саша']);
  });
});

describe('deactivation', () => {
  it('ends the learner sessions, blocks login and hides them from active learners', async () => {
    const learnerId = await createLearner(runtime.ctx, 'Саша', '1234');
    await createLearner(runtime.ctx, 'Маша', '5678');
    const tablet = await learnerSession(learnerId, '1234');

    const res = await admin.patch(`/api/admin/users/${learnerId}`, { active: false });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { active: boolean }).active).toBe(false);

    expect((await tablet.get('/api/auth/me')).status).toBe(401);
    const retry = await tablet.post('/api/auth/learner-login', { userId: learnerId, pin: '1234' });
    expect(retry.status).toBe(401);
    expect(runtime.ctx.users.activeLearners().map((l) => l.name)).toEqual(['Маша']);
    const profiles = (await (await tablet.get('/api/auth/profiles')).json()) as { name: string }[];
    expect(profiles.map((p) => p.name)).toEqual(['Маша']);
    const [record] = runtime.ctx.audit.list({ action: 'user.deactivated' }).items;
    expect(record?.learnerId).toBe(learnerId);
  });

  it('keeps the user row (no deletion) and allows reactivation', async () => {
    const learnerId = await createLearner(runtime.ctx, 'Саша', '1234');
    await admin.patch(`/api/admin/users/${learnerId}`, { active: false });
    expect((await admin.get(`/api/admin/users/${learnerId}`)).status).toBe(200);
    const res = await admin.patch(`/api/admin/users/${learnerId}`, { active: true });
    expect(((await res.json()) as { active: boolean }).active).toBe(true);
    expect((await admin.request('DELETE', `/api/admin/users/${learnerId}`)).status).toBe(404);
  });

  it('refuses to deactivate the last active admin', async () => {
    const res = await admin.patch(`/api/admin/users/${adminId}`, { active: false });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('last_admin');
  });

  it('deactivates an admin when another one stays active; that admin can no longer log in', async () => {
    const created = await admin.post('/api/admin/users', {
      role: 'admin',
      name: 'Папа',
      login: 'papa',
      password: 'another-long-pass',
    });
    const papaId = ((await created.json()) as { id: number }).id;
    const papa = createClient(app());
    await loginAdmin(papa, { name: 'Папа', login: 'papa', password: 'another-long-pass' });

    expect((await admin.patch(`/api/admin/users/${papaId}`, { active: false })).status).toBe(200);
    expect((await papa.get('/api/auth/me')).status).toBe(401);
    const relogin = await papa.post('/api/auth/login', {
      login: 'papa',
      password: 'another-long-pass',
    });
    expect(relogin.status).toBe(401);
    // Now mama is the last active admin again.
    expect((await admin.patch(`/api/admin/users/${adminId}`, { active: false })).status).toBe(409);
  });
});

describe('credential changes', () => {
  it('are audited without their values and end existing sessions', async () => {
    const learnerId = await createLearner(runtime.ctx, 'Саша', '1234');
    const tablet = await learnerSession(learnerId, '1234');

    const pin = await admin.patch(`/api/admin/users/${learnerId}`, { pin: '86429753' });
    expect(pin.status).toBe(200);
    expect((await tablet.get('/api/auth/me')).status).toBe(401);
    const password = await admin.patch(`/api/admin/users/${adminId}`, {
      password: 'Brand-New-Secret-Pass',
    });
    expect(password.status).toBe(200);
    expect((await admin.get('/api/auth/me')).status).toBe(401);

    const updates = runtime.ctx.audit.list({ action: 'user.updated' }).items;
    expect(updates.map((u) => u.payload)).toEqual([
      { changed: ['password'], passwordChanged: true },
      { changed: ['pin'], pinChanged: true },
    ]);
    const text = databaseText();
    expect(text).not.toContain('Brand-New-Secret-Pass');
    expect(text).not.toContain('86429753');
  });

  it('rejects fields that do not belong to the role', async () => {
    const learnerId = await createLearner(runtime.ctx, 'Саша', '1234');
    expect(
      (await admin.patch(`/api/admin/users/${learnerId}`, { password: 'long-enough-1' })).status,
    ).toBe(400);
    expect((await admin.patch(`/api/admin/users/${adminId}`, { pin: '1234' })).status).toBe(400);
  });
});

describe('CLI reset-password', () => {
  function io(stdin: string | null) {
    const out: string[] = [];
    const err: string[] = [];
    const cli: CliIo = {
      env: { NODE_ENV: 'test', DATA_DIR: runtime.dataDir },
      stdout: (line) => out.push(line),
      stderr: (line) => err.push(line),
      readStdin: () => Promise.resolve(stdin),
    };
    return { cli, out, err };
  }

  it('sets a new password from stdin and ends the admin sessions', async () => {
    const before = admin.cookies.get(SESSION_COOKIE);
    const { cli, out } = io('Recovered-Pass-2026\n');
    expect(await runCli(['reset-password', 'mama'], cli)).toBe(0);
    expect(out.join('\n')).not.toContain('Recovered-Pass-2026');

    expect(before).toBeDefined();
    expect((await admin.get('/api/auth/me')).status).toBe(401);
    const old = await createClient(app()).post('/api/auth/login', {
      login: 'mama',
      password: ADMIN.password,
    });
    expect(old.status).toBe(401);
    await loginAdmin(createClient(app()), { ...ADMIN, password: 'Recovered-Pass-2026' });
    expect(runtime.ctx.audit.list({ action: 'user.password_reset' }).items).toHaveLength(1);
  });

  it('generates and prints a password when stdin is a terminal', async () => {
    const { cli, out } = io(null);
    expect(await runCli(['reset-password', 'mama'], cli)).toBe(0);
    const generated = out.join('\n').match(/New password: (\S+)/)?.[1] ?? '';
    expect(generated.length).toBeGreaterThanOrEqual(16);
    await loginAdmin(createClient(app()), { ...ADMIN, password: generated });
  });

  it('fails for an unknown login or missing arguments', async () => {
    const unknown = io('Whatever-Pass-1');
    expect(await runCli(['reset-password', 'nobody'], unknown.cli)).toBe(1);
    expect(unknown.err.join('\n')).toContain('nobody');
    expect(await runCli(['reset-password'], io(null).cli)).toBe(2);
    expect(await runCli(['no-such-command'], io(null).cli)).toBe(2);
  });
});
