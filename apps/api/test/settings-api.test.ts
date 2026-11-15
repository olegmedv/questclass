import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SECRETS, SETTINGS, SETTING_KEYS } from '@questclass/shared/settings/registry';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AppContext } from '../src/app';
import { DB_FILENAME } from '../src/db/client';
import { createSettingsService } from '../src/modules/settings/service';
import { createClient, errorCode, loginAdmin, seedAdmin, type TestClient } from './helpers/client';
import { createTestRuntime, type TestRuntime } from './helpers/db';

interface Entry {
  key: string;
  value: unknown;
  isDefault: boolean;
  updatedAt: string | null;
}

let runtime: TestRuntime;
let admin: TestClient;
let adminId: number;

async function adminFor(ctx: AppContext): Promise<TestClient> {
  const client = createClient(createApp(ctx).app);
  await loginAdmin(client);
  return client;
}

beforeEach(async () => {
  runtime = await createTestRuntime();
  adminId = await seedAdmin(runtime.ctx);
  admin = await adminFor(runtime.ctx);
});

afterEach(async () => {
  await runtime.close();
});

async function entries(client: TestClient = admin): Promise<Map<string, Entry>> {
  const list = (await (await client.get('/api/admin/settings')).json()) as Entry[];
  return new Map(list.map((e) => [e.key, e]));
}

describe('GET /api/admin/settings', () => {
  it('lists every registry key with its default', async () => {
    const map = await entries();
    expect([...map.keys()].sort()).toEqual([...SETTING_KEYS].sort());
    expect(map.get('timezone')).toMatchObject({
      value: 'Europe/Kaliningrad',
      isDefault: true,
      updatedAt: null,
    });
    for (const key of SETTING_KEYS) {
      expect(map.get(key)?.value, key).toEqual(SETTINGS[key].default);
    }
  });
});

describe('PUT /api/admin/settings', () => {
  it('saves the given keys, audits each change and skips unchanged ones', async () => {
    const res = await admin.request('PUT', '/api/admin/settings', {
      json: {
        timezone: 'Europe/Moscow',
        'session.learnerDays': 90,
        'session.adminIdleMinutes': 30, // unchanged default
      },
    });
    expect(res.status).toBe(200);
    const map = new Map(((await res.json()) as Entry[]).map((e) => [e.key, e]));
    expect(map.get('timezone')).toMatchObject({ value: 'Europe/Moscow', isDefault: false });
    expect(map.get('session.learnerDays')?.value).toBe(90);
    expect(map.get('session.adminIdleMinutes')?.isDefault).toBe(true);
    expect(runtime.ctx.settings.get('timezone')).toBe('Europe/Moscow');

    const audited = runtime.ctx.audit.list({ action: 'setting.updated' }).items;
    expect(audited.map((r) => r.entityId).sort()).toEqual(['session.learnerDays', 'timezone']);
    expect(audited.every((r) => r.actorId === adminId)).toBe(true);
  });

  it('is all-or-nothing: one invalid value changes nothing', async () => {
    const res = await admin.request('PUT', '/api/admin/settings', {
      json: { timezone: 'Europe/Moscow', 'session.adminMaxHours': 0 },
    });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('validation_failed');
    expect((await entries()).get('timezone')?.value).toBe('Europe/Kaliningrad');
    expect(runtime.ctx.settings.get('timezone')).toBe('Europe/Kaliningrad');
    expect(runtime.ctx.audit.list({ action: 'setting.updated' }).items).toEqual([]);
  });

  it('rejects unknown keys and empty bodies', async () => {
    const unknown = await admin.request('PUT', '/api/admin/settings', {
      json: { timezone: 'Europe/Moscow', 'no.such.key': 1 },
    });
    expect(unknown.status).toBe(404);
    expect(await errorCode(unknown)).toBe('unknown_setting');
    expect(runtime.ctx.settings.get('timezone')).toBe('Europe/Kaliningrad');

    const empty = await admin.request('PUT', '/api/admin/settings', { json: {} });
    expect(empty.status).toBe(400);
    const notObject = await admin.request('PUT', '/api/admin/settings', { json: [1, 2] });
    expect(notObject.status).toBe(400);
  });
});

describe('secrets API', () => {
  const PLAINTEXT = 'sk-test-HTTP-ONLY-WRITE-77';
  let secretsAdmin: TestClient;

  beforeEach(async () => {
    // The core registry has no secrets yet; register one for these tests.
    const settings = createSettingsService(runtime.ctx.db, {
      audit: runtime.ctx.audit,
      keyring: runtime.ctx.keyring,
      registry: { settings: SETTINGS, secrets: { ...SECRETS, 'test.apiKey': { label: 'Ключ' } } },
    });
    secretsAdmin = await adminFor({ ...runtime.ctx, settings });
  });

  it('lists secrets as {key, isSet, updatedAt}', async () => {
    expect(await (await admin.get('/api/admin/secrets')).json()).toEqual([]);
    expect(await (await secretsAdmin.get('/api/admin/secrets')).json()).toEqual([
      { key: 'test.apiKey', isSet: false, updatedAt: null },
    ]);
  });

  it('accepts a value but never returns it', async () => {
    const res = await secretsAdmin.request('PUT', '/api/admin/secrets/test.apiKey', {
      json: { value: PLAINTEXT },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(PLAINTEXT);
    expect(JSON.parse(text)).toMatchObject({ key: 'test.apiKey', isSet: true });

    const listed = await (await secretsAdmin.get('/api/admin/secrets')).text();
    expect(listed).not.toContain(PLAINTEXT);
    expect(JSON.parse(listed)).toMatchObject([{ key: 'test.apiKey', isSet: true }]);
    // There is no endpoint that reads a secret back.
    expect((await secretsAdmin.get('/api/admin/secrets/test.apiKey')).status).toBe(404);

    const [record] = runtime.ctx.audit.list({ action: 'secret.updated' }).items;
    expect(record).toMatchObject({
      actorId: adminId,
      payload: { key: 'test.apiKey', isSet: true },
    });
    runtime.ctx.db.$client.pragma('wal_checkpoint(TRUNCATE)');
    const db = readFileSync(path.join(runtime.dataDir, DB_FILENAME)).toString('latin1');
    expect(db).not.toContain(PLAINTEXT);
  });

  it('can be cleared', async () => {
    await secretsAdmin.request('PUT', '/api/admin/secrets/test.apiKey', {
      json: { value: PLAINTEXT },
    });
    const res = await secretsAdmin.delete('/api/admin/secrets/test.apiKey');
    expect(await res.json()).toMatchObject({ key: 'test.apiKey', isSet: false });
    const audited = runtime.ctx.audit.list({ action: 'secret.updated' }).items;
    expect(audited.map((r) => r.payload['isSet'])).toEqual([false, true]);
  });

  it('rejects unknown keys and empty values', async () => {
    const unknown = await secretsAdmin.request('PUT', '/api/admin/secrets/openai.key', {
      json: { value: 'x' },
    });
    expect(unknown.status).toBe(404);
    expect(await errorCode(unknown)).toBe('unknown_secret');
    const empty = await secretsAdmin.request('PUT', '/api/admin/secrets/test.apiKey', {
      json: { value: '' },
    });
    expect(empty.status).toBe(400);
  });
});
