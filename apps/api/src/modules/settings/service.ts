import {
  SECRETS,
  SETTINGS,
  type SecretDef,
  type SettingDef,
  type SettingKey,
  type SettingValue,
} from '@questclass/shared/settings/registry';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { secrets } from '../../db/schema/secrets';
import { settings } from '../../db/schema/settings';
import { HttpError, badRequest, zodDetails } from '../../http/errors';
import { auditPayload, defineAuditAction, type AuditService } from '../audit/service';
import { decrypt, encrypt, type Keyring } from './crypto';

export const settingUpdated = defineAuditAction(
  'setting.updated',
  z.object({ key: z.string(), before: z.unknown(), after: z.unknown() }),
);
/** Only the fact that a secret changed is recorded, never its value. */
export const secretUpdated = defineAuditAction(
  'secret.updated',
  z.object({ key: z.string(), isSet: z.boolean() }),
);

const SECRETS_KEY_PURPOSE = 'secrets/v1';
const MAX_SECRET_LENGTH = 8192;

export interface SettingEntry {
  readonly key: string;
  readonly value: unknown;
  readonly default: unknown;
  readonly isDefault: boolean;
  /** ISO 8601, null while the default is in effect. */
  readonly updatedAt: string | null;
}

/** What the outside world may know about a secret. Its value is never part of it. */
export interface SecretStatus {
  readonly key: string;
  readonly isSet: boolean;
  /** ISO 8601 */
  readonly updatedAt: string | null;
}

export interface SettingsRegistryInput {
  readonly settings: Readonly<Record<string, SettingDef>>;
  readonly secrets: Readonly<Record<string, SecretDef>>;
}

export interface SettingsServiceOptions {
  readonly audit: AuditService;
  readonly keyring: Keyring;
  /** Defaults to the shared registry; tests may pass their own. */
  readonly registry?: SettingsRegistryInput;
  readonly clock?: () => number;
}

export interface SettingsService {
  /** Current value or the registry default. Read-only. */
  get<K extends SettingKey>(key: K): SettingValue<K>;
  list(): SettingEntry[];
  /** Validates against the registry, stores, audits. */
  set(key: string, value: unknown, actorId: number | null): SettingEntry;
  listSecrets(): SecretStatus[];
  secretStatus(key: string): SecretStatus;
  setSecret(key: string, plaintext: string, actorId: number | null): SecretStatus;
  clearSecret(key: string, actorId: number | null): SecretStatus;
  /** Decrypted value for server-side use only; must never be sent to a client. */
  useSecret(key: string): string | null;
}

const unknownSetting = (key: string) =>
  new HttpError(404, 'unknown_setting', `Нет такой настройки: ${key}`);
const unknownSecret = (key: string) =>
  new HttpError(404, 'unknown_secret', `Нет такого секрета: ${key}`);
const iso = (ms: number | null | undefined) =>
  ms === null || ms === undefined ? null : new Date(ms).toISOString();

export function createSettingsService(db: Db, options: SettingsServiceOptions): SettingsService {
  const { audit, keyring, clock = Date.now } = options;
  const registry: SettingsRegistryInput = options.registry ?? {
    settings: SETTINGS,
    secrets: SECRETS,
  };
  const secretsKey = keyring.derive(SECRETS_KEY_PURPOSE);
  const cache = new Map<string, unknown>();

  const settingDef = (key: string): SettingDef => {
    const def = Object.hasOwn(registry.settings, key) ? registry.settings[key] : undefined;
    if (!def) {
      throw unknownSetting(key);
    }
    return def;
  };

  const assertSecret = (key: string): void => {
    if (!Object.hasOwn(registry.secrets, key)) {
      throw unknownSecret(key);
    }
  };

  const readRow = (key: string) => db.select().from(settings).where(eq(settings.key, key)).get();

  /** Stored value if valid, otherwise the default (a stale value is ignored, not rewritten). */
  const effective = (key: string, def: SettingDef, stored: unknown): unknown => {
    if (stored === undefined) {
      return def.default;
    }
    const parsed = def.schema.safeParse(stored);
    if (!parsed.success) {
      console.warn(`Stored value of setting ${key} is invalid; using the default`);
      return def.default;
    }
    return parsed.data;
  };

  const entry = (key: string): SettingEntry => {
    const def = settingDef(key);
    const row = readRow(key);
    const value = effective(key, def, row?.value);
    return {
      key,
      value,
      default: def.default,
      isDefault: row === undefined,
      updatedAt: iso(row?.updatedAt),
    };
  };

  const secretStatus = (key: string): SecretStatus => {
    assertSecret(key);
    const row = db
      .select({ updatedAt: secrets.updatedAt })
      .from(secrets)
      .where(eq(secrets.key, key))
      .get();
    return { key, isSet: row !== undefined, updatedAt: iso(row?.updatedAt) };
  };

  return {
    get<K extends SettingKey>(key: K): SettingValue<K> {
      if (cache.has(key)) {
        return cache.get(key) as SettingValue<K>;
      }
      const def = settingDef(key);
      const value = effective(key, def, readRow(key)?.value);
      cache.set(key, value);
      return value as SettingValue<K>;
    },

    list() {
      return Object.keys(registry.settings).map(entry);
    },

    set(key, value, actorId) {
      const def = settingDef(key);
      const parsed = def.schema.safeParse(value);
      if (!parsed.success) {
        throw badRequest('validation_failed', 'Некорректное значение', zodDetails(parsed.error));
      }
      const before = entry(key).value;
      const now = clock();
      db.transaction(() => {
        db.insert(settings)
          .values({ key, value: parsed.data, updatedAt: now, updatedBy: actorId })
          .onConflictDoUpdate({
            target: settings.key,
            set: { value: parsed.data, updatedAt: now, updatedBy: actorId },
          })
          .run();
        const payload = auditPayload(settingUpdated, { key, before, after: parsed.data });
        audit.record(actorId, settingUpdated, 'setting', key, payload);
      });
      cache.delete(key);
      return entry(key);
    },

    listSecrets() {
      return Object.keys(registry.secrets).map(secretStatus);
    },

    secretStatus,

    setSecret(key, plaintext, actorId) {
      assertSecret(key);
      if (plaintext.length === 0 || plaintext.length > MAX_SECRET_LENGTH) {
        throw badRequest('validation_failed', 'Секрет должен быть непустым и не длиннее 8 КБ');
      }
      const ciphertext = encrypt(secretsKey, plaintext, key);
      const now = clock();
      db.transaction(() => {
        db.insert(secrets)
          .values({ key, ciphertext, updatedAt: now, updatedBy: actorId })
          .onConflictDoUpdate({
            target: secrets.key,
            set: { ciphertext, updatedAt: now, updatedBy: actorId },
          })
          .run();
        const payload = auditPayload(secretUpdated, { key, isSet: true });
        audit.record(actorId, secretUpdated, 'secret', key, payload);
      });
      return secretStatus(key);
    },

    clearSecret(key, actorId) {
      assertSecret(key);
      db.transaction(() => {
        db.delete(secrets).where(eq(secrets.key, key)).run();
        const payload = auditPayload(secretUpdated, { key, isSet: false });
        audit.record(actorId, secretUpdated, 'secret', key, payload);
      });
      return secretStatus(key);
    },

    useSecret(key) {
      assertSecret(key);
      const row = db.select().from(secrets).where(eq(secrets.key, key)).get();
      return row ? decrypt(secretsKey, row.ciphertext, key) : null;
    },
  };
}
