import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_TRUSTED_PROXIES } from '@questclass/shared/net';
import { SECRETS, SETTINGS, type SettingKey } from '@questclass/shared/settings/registry';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { DB_FILENAME } from '../src/db/client';
import { HttpError } from '../src/http/errors';
import { clientIp } from '../src/http/clientIp';
import { route, type AppEnv } from '../src/http/route';
import { createKeyring, decrypt, encrypt } from '../src/modules/settings/crypto';
import { MASTER_KEY_FILENAME, loadOrCreateMasterKey } from '../src/modules/settings/masterKey';
import { createSettingsService, type SettingsService } from '../src/modules/settings/service';
import { closeAll, startup } from '../src/startup';
import { createTempDir, createTestRuntime, removeDir, type TestRuntime } from './helpers/db';

let runtime: TestRuntime;

beforeEach(async () => {
  runtime = await createTestRuntime();
});

afterEach(async () => {
  await runtime.close();
});

/** Settings service with an extra test secret (the core registry has no secrets yet). */
function serviceWithTestSecret(): SettingsService {
  return createSettingsService(runtime.ctx.db, {
    audit: runtime.ctx.audit,
    keyring: runtime.ctx.keyring,
    registry: {
      settings: SETTINGS,
      secrets: { ...SECRETS, 'test.apiKey': { label: 'Тестовый ключ' } },
    },
  });
}

function totalChanges(): unknown {
  return runtime.ctx.db.$client.prepare('SELECT total_changes() AS n').get();
}

function databaseText(): string {
  runtime.ctx.db.$client.pragma('wal_checkpoint(TRUNCATE)');
  return readFileSync(path.join(runtime.dataDir, DB_FILENAME)).toString('latin1');
}

function httpError(fn: () => unknown): HttpError {
  try {
    fn();
  } catch (err) {
    if (err instanceof HttpError) {
      return err;
    }
    throw err;
  }
  throw new Error('Expected an HttpError');
}

describe('settings registry', () => {
  it('has the core keys with their defaults', () => {
    const { settings } = runtime.ctx;
    expect(settings.get('timezone')).toBe('Europe/Kaliningrad');
    expect(settings.get('session.adminIdleMinutes')).toBe(30);
    expect(settings.get('session.adminMaxHours')).toBe(12);
    expect(settings.get('session.learnerDays')).toBe(180);
    expect(settings.get('http.trustedProxies')).toEqual([...DEFAULT_TRUSTED_PROXIES]);
  });

  it('reading a key without a row returns the default and writes nothing', () => {
    const before = totalChanges();
    const entries = runtime.ctx.settings.list();
    runtime.ctx.settings.get('timezone');
    expect(totalChanges()).toEqual(before);
    expect(entries.every((e) => e.isDefault && e.updatedAt === null)).toBe(true);
    const rows = runtime.ctx.db.$client.prepare('SELECT count(*) AS n FROM settings').get();
    expect(rows).toEqual({ n: 0 });
  });

  it('rejects unknown keys', () => {
    const { settings } = runtime.ctx;
    expect(httpError(() => settings.get('no.such.key' as SettingKey)).code).toBe('unknown_setting');
    expect(httpError(() => settings.set('no.such.key', 1, null)).status).toBe(404);
  });

  it('validates values with the registry schema', () => {
    const { settings } = runtime.ctx;
    const cases: [string, unknown][] = [
      ['timezone', 'Mars/Olympus_Mons'],
      ['session.adminIdleMinutes', -5],
      ['session.adminIdleMinutes', '30'],
      ['session.learnerDays', 1.5],
      ['http.trustedProxies', ['not-an-ip']],
      ['http.trustedProxies', '10.0.0.0/8'],
    ];
    for (const [key, value] of cases) {
      const error = httpError(() => settings.set(key, value, 1));
      expect(error.status, `${key}=${JSON.stringify(value)}`).toBe(400);
    }
    expect(settings.list().every((e) => e.isDefault)).toBe(true);
  });

  it('stores a valid value, audits the change and keeps it across instances', () => {
    const entry = runtime.ctx.settings.set('session.adminIdleMinutes', 45, 7);
    expect(entry).toMatchObject({ value: 45, isDefault: false });
    expect(runtime.ctx.settings.get('session.adminIdleMinutes')).toBe(45);

    const fresh = createSettingsService(runtime.ctx.db, {
      audit: runtime.ctx.audit,
      keyring: runtime.ctx.keyring,
    });
    expect(fresh.get('session.adminIdleMinutes')).toBe(45);

    const [record] = runtime.ctx.audit.list({ action: 'setting.updated' }).items;
    expect(record).toMatchObject({
      actorId: 7,
      entity: 'setting',
      entityId: 'session.adminIdleMinutes',
      payload: { key: 'session.adminIdleMinutes', before: 30, after: 45 },
    });
  });

  it('falls back to the default if a stored value no longer validates, without rewriting', () => {
    runtime.ctx.db.$client
      .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('session.learnerDays', JSON.stringify('forever'), Date.now());
    const before = totalChanges();
    const fresh = createSettingsService(runtime.ctx.db, {
      audit: runtime.ctx.audit,
      keyring: runtime.ctx.keyring,
    });
    expect(fresh.get('session.learnerDays')).toBe(180);
    expect(totalChanges()).toEqual(before);
  });
});

describe('clientIp follows http.trustedProxies', () => {
  async function ipOf(peer: string, xff: string): Promise<string> {
    const probe = route({
      method: 'GET',
      path: '/api/probe/ip',
      roles: ['public'],
      handler: (c) => c.json({ ip: clientIp(c) }),
    });
    const { app } = buildApp(runtime.ctx, [probe]);
    const env = { incoming: { socket: { remoteAddress: peer } } } as unknown as AppEnv['Bindings'];
    const res = await app.request('/api/probe/ip', { headers: { 'x-forwarded-for': xff } }, env);
    return ((await res.json()) as { ip: string }).ip;
  }

  it('honours X-Forwarded-For from 172.18.0.2 with default settings', async () => {
    expect(await ipOf('172.18.0.2', '198.51.100.9')).toBe('198.51.100.9');
  });

  it('stops trusting the Docker range once the admin narrows the list', async () => {
    runtime.ctx.settings.set('http.trustedProxies', ['203.0.113.0/24'], 1);
    expect(await ipOf('172.18.0.2', '198.51.100.9')).toBe('172.18.0.2');
    expect(await ipOf('203.0.113.4', '198.51.100.9')).toBe('198.51.100.9');
  });
});

describe('master key', () => {
  it('is created on first start in DATA_DIR with mode 0600 and reused afterwards', async () => {
    const file = path.join(runtime.dataDir, MASTER_KEY_FILENAME);
    const first = readFileSync(file, 'utf8');
    expect(Buffer.from(first.trim(), 'base64')).toHaveLength(32);
    if (process.platform !== 'win32') {
      expect(statSync(file).mode & 0o777).toBe(0o600);
    }
    // A secret written now is readable after a restart with the same data volume.
    const service = serviceWithTestSecret();
    service.setSecret('test.apiKey', 'sk-restart-check', 1);
    await closeAll(runtime.closers); // stop, but keep the data volume

    runtime = await createTestRuntimeOn(runtime.dataDir);
    expect(readFileSync(file, 'utf8')).toBe(first);
    expect(serviceWithTestSecret().useSecret('test.apiKey')).toBe('sk-restart-check');
  });

  it('refuses to start with a corrupt key file', async () => {
    const dir = createTempDir();
    try {
      writeFileSync(path.join(dir, MASTER_KEY_FILENAME), 'too-short');
      expect(() => loadOrCreateMasterKey(dir)).toThrow(/corrupt/);
      await expect(startup(loadConfig({ NODE_ENV: 'test', DATA_DIR: dir }))).rejects.toThrow(
        /corrupt/,
      );
    } finally {
      removeDir(dir);
    }
  });
});

/** Like createTestRuntime, but on an existing DATA_DIR (simulates a restart). */
async function createTestRuntimeOn(dataDir: string): Promise<TestRuntime> {
  const restarted = await startup(loadConfig({ NODE_ENV: 'test', DATA_DIR: dataDir }));
  return {
    ...restarted,
    dataDir,
    close: async () => {
      for (const close of [...restarted.closers].reverse()) {
        await close();
      }
      removeDir(dataDir);
    },
  };
}

describe('AES-256-GCM', () => {
  const key = createKeyring(Buffer.alloc(32, 7)).derive('test');

  it('round-trips and uses a fresh IV every time', () => {
    const a = encrypt(key, 'привет, секрет', 'k1');
    const b = encrypt(key, 'привет, секрет', 'k1');
    expect(a).not.toBe(b);
    expect(decrypt(key, a, 'k1')).toBe('привет, секрет');
  });

  it('detects tampering, a wrong key and a ciphertext moved to another key', () => {
    const token = encrypt(key, 'value', 'k1');
    const [version, iv, tag, data = ''] = token.split('.');
    const flipped = `${version}.${iv}.${tag}.${data.startsWith('A') ? 'B' : 'A'}${data.slice(1)}`;
    expect(() => decrypt(key, flipped, 'k1')).toThrow();
    expect(() => decrypt(key, token, 'k2')).toThrow();
    const otherKey = createKeyring(Buffer.alloc(32, 8)).derive('test');
    expect(() => decrypt(otherKey, token, 'k1')).toThrow();
  });

  it('derives different keys for different purposes', () => {
    const keyring = createKeyring(Buffer.alloc(32, 1));
    expect(keyring.derive('a').equals(keyring.derive('b'))).toBe(false);
    expect(keyring.derive('a')).toHaveLength(32);
  });
});

describe('secrets', () => {
  const PLAINTEXT = 'sk-live-VERY-SECRET-0042';

  it('exposes only {key, isSet, updatedAt}, never the value', () => {
    const service = serviceWithTestSecret();
    expect(service.secretStatus('test.apiKey')).toEqual({
      key: 'test.apiKey',
      isSet: false,
      updatedAt: null,
    });

    const status = service.setSecret('test.apiKey', PLAINTEXT, 1);
    expect(Object.keys(status).sort()).toEqual(['isSet', 'key', 'updatedAt']);
    expect(status.isSet).toBe(true);
    const listed = service.listSecrets();
    expect(listed.find((s) => s.key === 'test.apiKey')?.isSet).toBe(true);
    expect(JSON.stringify([status, listed])).not.toContain('VERY-SECRET');
  });

  it('stores the value encrypted and audits only {key, isSet}', () => {
    const service = serviceWithTestSecret();
    service.setSecret('test.apiKey', PLAINTEXT, 1);

    expect(databaseText()).not.toContain('VERY-SECRET');
    expect(service.useSecret('test.apiKey')).toBe(PLAINTEXT);
    const [record] = runtime.ctx.audit.list({ action: 'secret.updated' }).items;
    expect(record?.payload).toEqual({ key: 'test.apiKey', isSet: true });
  });

  it('can be cleared', () => {
    const service = serviceWithTestSecret();
    service.setSecret('test.apiKey', PLAINTEXT, 1);
    expect(service.clearSecret('test.apiKey', 1).isSet).toBe(false);
    expect(service.useSecret('test.apiKey')).toBeNull();
  });

  it('rejects unknown keys and empty values', () => {
    const service = serviceWithTestSecret();
    expect(httpError(() => service.setSecret('nope', 'x', 1)).code).toBe('unknown_secret');
    expect(httpError(() => service.setSecret('test.apiKey', '', 1)).status).toBe(400);
  });
});
