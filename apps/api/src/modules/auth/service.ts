import type { DeviceDto, MeDto, ProfileDto } from '@questclass/shared/auth/dto';
import type { SetupRequest } from '@questclass/shared/auth/schemas';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { Config } from '../../config';
import type { Db } from '../../db/client';
import { sessions, type SessionRow } from '../../db/schema/sessions';
import { trustedDevices, type TrustedDeviceRow } from '../../db/schema/trustedDevices';
import { users, type UserRow } from '../../db/schema/users';
import { HttpError, badRequest, conflict, forbidden, notFound } from '../../http/errors';
import { auditPayload, defineAuditAction, type AuditService } from '../audit/service';
import type { Keyring } from '../settings/crypto';
import type { SettingsService } from '../settings/service';
import type { UsersService } from '../users/service';
import { dummySecretHash, hashSecret, randomToken, sha256Hex, verifySecret } from './crypto';
import { clearSetupToken, issueSetupToken, verifySetupToken } from './setupToken';
import { createThrottle, throttleKeys, type ThrottleKeys } from './throttle';

export const setupCompleted = defineAuditAction(
  'auth.setup_completed',
  z.object({ login: z.string() }),
);
export const deviceTrusted = defineAuditAction('device.trusted', z.object({ name: z.string() }));
export const deviceRevoked = defineAuditAction('device.revoked', z.object({ name: z.string() }));
/** Only the fact of the change: never a password or its hash. */
export const passwordChanged = defineAuditAction(
  'user.password_changed',
  z.object({ login: z.string(), otherSessionsClosed: z.number() }),
);

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** A login was refused because of too many failures; tells the client when to retry. */
export class ThrottledError extends HttpError {
  constructor(readonly retryAfterSec: number) {
    super(429, 'too_many_attempts', 'Слишком много попыток. Попробуйте позже', { retryAfterSec });
  }
}

export const deviceNotTrusted = () =>
  forbidden('Попросите родителя включить это устройство', 'device_not_trusted');

/** Marks every open session of a user as revoked (deactivation, new password, …). */
export function revokeSessionsOfUser(db: Db, userId: number, reason: string): void {
  db.update(sessions)
    .set({ revokedAt: Date.now(), revokedReason: reason })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .run();
}

export interface ResolvedSession {
  readonly session: SessionRow;
  readonly user: UserRow;
  readonly tokenHash: string;
}

export interface NewSession {
  readonly token: string;
  readonly tokenHash: string;
  readonly role: 'admin' | 'learner';
  readonly expiresAt: number;
  readonly user: MeDto;
}

export interface AuthService {
  setupNeeded(): boolean;
  /** Startup: issues a setup token while no admin exists (returns it), else clears it. */
  ensureSetupToken(): string | null;
  completeSetup(input: SetupRequest, ip: string, previousToken?: string): Promise<NewSession>;
  loginAdmin(
    login: string,
    password: string,
    ip: string,
    previousToken?: string,
  ): Promise<NewSession>;
  loginLearner(
    userId: number,
    pin: string,
    deviceToken: string | undefined,
    ip: string,
    previousToken?: string,
  ): Promise<NewSession>;
  /** Valid, unrevoked, unexpired session of an active user. Read-only. */
  resolveSession(token: string): ResolvedSession | null;
  logout(token: string): void;
  me(userId: number): MeDto;
  /** Trusted device behind a device cookie, if it is still trusted. Read-only. */
  resolveDevice(token: string | undefined): TrustedDeviceRow | null;
  trustDevice(
    name: string,
    actorId: number,
    currentToken?: string,
  ): { token: string; device: DeviceDto };
  listDevices(currentToken?: string): DeviceDto[];
  revokeDevice(id: number, actorId: number, currentToken?: string): DeviceDto;
  /** Learner profiles for the picker; only on a trusted device. */
  profiles(deviceToken: string | undefined): ProfileDto[];
  /**
   * The admin's own new password. The current one must match (with the login's protection
   * against guessing: throttled, 403 when wrong); the admin's other sessions end, this one stays.
   */
  changePassword(
    userId: number,
    input: { current: string; next: string },
    ip: string,
    currentToken: string | undefined,
  ): Promise<void>;
  /** Key for the signed admin activity cookie. */
  readonly activityKey: Buffer;
}

export interface AuthDeps {
  readonly config: Config;
  readonly audit: AuditService;
  readonly settings: SettingsService;
  readonly keyring: Keyring;
  readonly users: UsersService;
}

/** Verifies a secret; for a missing account it still spends the same time hashing. */
async function checkSecret(secret: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    await verifySecret(secret, await dummySecretHash());
    return false;
  }
  return verifySecret(secret, hash);
}

const toMe = (user: UserRow): MeDto => ({
  id: user.id,
  role: user.role,
  name: user.name,
  avatar: user.avatar,
});

export function createAuthService(db: Db, deps: AuthDeps): AuthService {
  const { config, audit, settings, keyring, users: usersService } = deps;
  const throttle = createThrottle(db);

  const guardThrottle = (keys: ThrottleKeys): void => {
    const waitMs = throttle.retryAfter(keys);
    if (waitMs > 0) {
      throw new ThrottledError(Math.ceil(waitMs / 1000));
    }
  };

  const toDevice = (row: TrustedDeviceRow, currentHash: string | null): DeviceDto => ({
    id: row.id,
    name: row.name,
    createdAt: new Date(row.createdAt).toISOString(),
    revokedAt: row.revokedAt === null ? null : new Date(row.revokedAt).toISOString(),
    isCurrent: row.tokenHash === currentHash,
  });

  /** Opens a session; the browser's previous session (if any) ends: one per browser. */
  const openSession = (
    user: UserRow,
    deviceId: number | null,
    previousToken?: string,
  ): NewSession => {
    const now = Date.now();
    const token = randomToken();
    const tokenHash = sha256Hex(token);
    const lifetime =
      user.role === 'admin'
        ? settings.get('session.adminMaxHours') * HOUR_MS
        : settings.get('session.learnerDays') * DAY_MS;
    db.transaction(() => {
      if (previousToken) {
        db.update(sessions)
          .set({ revokedAt: now, revokedReason: 'replaced' })
          .where(and(eq(sessions.tokenHash, sha256Hex(previousToken)), isNull(sessions.revokedAt)))
          .run();
      }
      db.insert(sessions)
        .values({
          tokenHash,
          userId: user.id,
          role: user.role,
          deviceId,
          createdAt: now,
          expiresAt: now + lifetime,
        })
        .run();
    });
    return { token, tokenHash, role: user.role, expiresAt: now + lifetime, user: toMe(user) };
  };

  const resolveDevice = (token: string | undefined): TrustedDeviceRow | null => {
    if (!token) {
      return null;
    }
    const row = db
      .select()
      .from(trustedDevices)
      .where(eq(trustedDevices.tokenHash, sha256Hex(token)))
      .get();
    return row && row.revokedAt === null ? row : null;
  };

  return {
    activityKey: keyring.derive('session-activity/v1'),

    setupNeeded: () => usersService.adminCount() === 0,

    ensureSetupToken() {
      if (usersService.adminCount() > 0) {
        clearSetupToken(config.dataDir);
        return null;
      }
      return issueSetupToken(config.dataDir);
    },

    async completeSetup(input, ip, previousToken) {
      const keys = throttleKeys('setup', ip);
      guardThrottle(keys);
      if (usersService.adminCount() > 0) {
        throw conflict('already_set_up', 'Первый админ уже создан');
      }
      if (!verifySetupToken(config.dataDir, input.token)) {
        throttle.recordFailure(keys);
        throw forbidden('Неверный код установки', 'invalid_setup_token');
      }
      const admin = await usersService.createFirstAdmin(input);
      clearSetupToken(config.dataDir);
      throttle.recordSuccess(keys);
      const payload = auditPayload(setupCompleted, { login: input.login });
      audit.record(admin.id, setupCompleted, 'user', admin.id, payload);
      const row = usersService.findRow(admin.id);
      if (!row) {
        throw new Error('First admin vanished');
      }
      return openSession(row, null, previousToken);
    },

    async loginAdmin(login, password, ip, previousToken) {
      const keys = throttleKeys(`admin:${login}`, ip);
      guardThrottle(keys);
      const user = usersService.findAdminByLogin(login);
      const usable = user?.active === true && user.passwordHash !== null ? user : null;
      const ok = await checkSecret(password, usable?.passwordHash);
      if (!ok || !usable) {
        throttle.recordFailure(keys);
        throw new HttpError(401, 'invalid_credentials', 'Неверный логин или пароль');
      }
      throttle.recordSuccess(keys);
      return openSession(usable, null, previousToken);
    },

    async loginLearner(userId, pin, deviceToken, ip, previousToken) {
      const device = resolveDevice(deviceToken);
      if (!device) {
        throw deviceNotTrusted();
      }
      const keys = throttleKeys(`learner:${userId}`, ip);
      guardThrottle(keys);
      const user = usersService.findRow(userId);
      const usable = user?.role === 'learner' && user.active && user.pinHash !== null ? user : null;
      const ok = await checkSecret(pin, usable?.pinHash);
      if (!ok || !usable) {
        throttle.recordFailure(keys);
        throw new HttpError(401, 'invalid_pin', 'Неверный PIN');
      }
      throttle.recordSuccess(keys);
      return openSession(usable, device.id, previousToken);
    },

    resolveSession(token) {
      const tokenHash = sha256Hex(token);
      const row = db
        .select()
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .leftJoin(trustedDevices, eq(sessions.deviceId, trustedDevices.id))
        .where(eq(sessions.tokenHash, tokenHash))
        .get();
      if (!row) {
        return null;
      }
      const { sessions: session, users: user, trusted_devices: device } = row;
      const now = Date.now();
      if (session.revokedAt !== null || session.expiresAt <= now || !user.active) {
        return null;
      }
      if (session.deviceId !== null && (device === null || device.revokedAt !== null)) {
        return null;
      }
      return { session, user, tokenHash };
    },

    logout(token) {
      db.update(sessions)
        .set({ revokedAt: Date.now(), revokedReason: 'logout' })
        .where(and(eq(sessions.tokenHash, sha256Hex(token)), isNull(sessions.revokedAt)))
        .run();
    },

    me(userId) {
      const user = usersService.findRow(userId);
      if (!user) {
        throw notFound();
      }
      return toMe(user);
    },

    resolveDevice,

    async changePassword(userId, input, ip, currentToken) {
      const user = usersService.findRow(userId);
      if (user?.role !== 'admin' || user.login === null || !currentToken) {
        throw notFound();
      }
      const keys = throttleKeys(`admin:${user.login}`, ip);
      guardThrottle(keys);
      const ok = await checkSecret(input.current, user.passwordHash);
      if (!ok) {
        throttle.recordFailure(keys);
        throw forbidden('Текущий пароль не подходит', 'invalid_password');
      }
      throttle.recordSuccess(keys);
      if (input.current === input.next) {
        throw badRequest('same_password', 'Новый пароль совпадает с текущим');
      }
      const passwordHash = await hashSecret(input.next);
      const keep = sha256Hex(currentToken);
      db.transaction(() => {
        const now = Date.now();
        db.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, userId)).run();
        const closed = db
          .update(sessions)
          .set({ revokedAt: now, revokedReason: 'password_changed' })
          .where(
            and(
              eq(sessions.userId, userId),
              isNull(sessions.revokedAt),
              ne(sessions.tokenHash, keep),
            ),
          )
          .run().changes;
        const payload = auditPayload(passwordChanged, {
          login: user.login ?? '',
          otherSessionsClosed: closed,
        });
        audit.record(userId, passwordChanged, 'user', userId, payload);
      });
    },

    trustDevice(name, actorId, currentToken) {
      const now = Date.now();
      const token = randomToken();
      const tokenHash = sha256Hex(token);
      const previous = resolveDevice(currentToken);
      const row = db.transaction(() => {
        if (previous) {
          // This browser gets a new token; the old one must not stay valid elsewhere.
          db.update(trustedDevices)
            .set({ revokedAt: now, revokedBy: actorId })
            .where(eq(trustedDevices.id, previous.id))
            .run();
        }
        const inserted = db
          .insert(trustedDevices)
          .values({ tokenHash, name, createdBy: actorId, createdAt: now })
          .returning()
          .get();
        audit.record(
          actorId,
          deviceTrusted,
          'device',
          inserted.id,
          auditPayload(deviceTrusted, { name }),
        );
        return inserted;
      });
      return { token, device: toDevice(row, tokenHash) };
    },

    listDevices(currentToken) {
      const currentHash = currentToken ? sha256Hex(currentToken) : null;
      return db
        .select()
        .from(trustedDevices)
        .orderBy(desc(trustedDevices.id))
        .all()
        .map((row) => toDevice(row, currentHash));
    },

    revokeDevice(id, actorId, currentToken) {
      const currentHash = currentToken ? sha256Hex(currentToken) : null;
      const existing = db.select().from(trustedDevices).where(eq(trustedDevices.id, id)).get();
      if (!existing) {
        throw notFound('Устройство не найдено');
      }
      if (existing.revokedAt !== null) {
        return toDevice(existing, currentHash);
      }
      const now = Date.now();
      const row = db.transaction(() => {
        const updated = db
          .update(trustedDevices)
          .set({ revokedAt: now, revokedBy: actorId })
          .where(eq(trustedDevices.id, id))
          .returning()
          .get();
        db.update(sessions)
          .set({ revokedAt: now, revokedReason: 'device_revoked' })
          .where(and(eq(sessions.deviceId, id), isNull(sessions.revokedAt)))
          .run();
        const payload = auditPayload(deviceRevoked, { name: existing.name });
        audit.record(actorId, deviceRevoked, 'device', id, payload);
        return updated ?? existing;
      });
      return toDevice(row, currentHash);
    },

    profiles(deviceToken) {
      if (!resolveDevice(deviceToken)) {
        throw deviceNotTrusted();
      }
      return usersService.activeLearners();
    },
  };
}
