import type { ProfileDto, UserDto } from '@questclass/shared/auth/dto';
import type {
  UserCreateRequest,
  UserRole,
  UserUpdateRequest,
} from '@questclass/shared/auth/schemas';
import { and, asc, count, eq, ne, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { users, type UserRow } from '../../db/schema/users';
import { HttpError, badRequest, conflict, notFound } from '../../http/errors';
import { auditPayload, defineAuditAction, type AuditService } from '../audit/service';
import { hashSecret } from '../auth/crypto';
import { revokeSessionsOfUser } from '../auth/service';

export const userCreated = defineAuditAction(
  'user.created',
  z.object({ role: z.string(), name: z.string(), login: z.string().nullable() }),
);
export const userUpdated = defineAuditAction(
  'user.updated',
  z.object({
    changed: z.array(z.string()),
    name: z.string().optional(),
    login: z.string().optional(),
    avatar: z.string().nullable().optional(),
    passwordChanged: z.boolean().optional(),
    pinChanged: z.boolean().optional(),
  }),
);
export const userDeactivated = defineAuditAction(
  'user.deactivated',
  z.object({ name: z.string() }),
);
export const userReactivated = defineAuditAction(
  'user.reactivated',
  z.object({ name: z.string() }),
);
export const passwordReset = defineAuditAction(
  'user.password_reset',
  z.object({ login: z.string(), via: z.string() }),
);

export interface UserFilter {
  readonly role?: UserRole;
  readonly active?: boolean;
}

export interface UsersService {
  list(filter?: UserFilter): UserDto[];
  get(id: number): UserDto;
  findRow(id: number): UserRow | undefined;
  findAdminByLogin(login: string): UserRow | undefined;
  /** Number of admin accounts, active or not (setup is needed while it is 0). */
  adminCount(): number;
  /** Learners shown on a trusted device and counted as "all active learners". */
  activeLearners(): ProfileDto[];
  create(input: UserCreateRequest, actorId: number | null): Promise<UserDto>;
  /** Creates the first admin; fails with 409 if any admin already exists (atomic). */
  createFirstAdmin(input: { name: string; login: string; password: string }): Promise<UserDto>;
  update(id: number, patch: UserUpdateRequest, actorId: number | null): Promise<UserDto>;
  /** Recovery from the CLI: new password, all sessions of the admin revoked. */
  resetPassword(login: string, password: string): Promise<UserDto>;
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

export function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    login: row.login,
    avatar: row.avatar,
    active: row.active,
    hasPin: row.pinHash !== null,
    createdAt: new Date(row.createdAt).toISOString(),
    deactivatedAt: iso(row.deactivatedAt),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed: users\.login/.test(err.message);
}

const loginTaken = () => conflict('login_taken', 'Такой логин уже занят');

export function createUsersService(db: Db, deps: { audit: AuditService }): UsersService {
  const { audit } = deps;

  const findRow = (id: number) => db.select().from(users).where(eq(users.id, id)).get();
  const requireRow = (id: number): UserRow => {
    const row = findRow(id);
    if (!row) {
      throw notFound('Пользователь не найден');
    }
    return row;
  };
  const learnerScope = (row: UserRow) => ({ learnerId: row.role === 'learner' ? row.id : null });

  const insertUser = (values: typeof users.$inferInsert): UserRow => {
    try {
      return db.insert(users).values(values).returning().get();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw loginTaken();
      }
      throw err;
    }
  };

  const recordCreated = (row: UserRow, actorId: number | null) => {
    const payload = auditPayload(userCreated, { role: row.role, name: row.name, login: row.login });
    audit.record(actorId, userCreated, 'user', row.id, payload, learnerScope(row));
  };

  const findAdminByLogin = (login: string): UserRow | undefined =>
    db
      .select()
      .from(users)
      .where(and(eq(users.login, login), eq(users.role, 'admin')))
      .get();

  const otherActiveAdmins = (id: number): number =>
    db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.active, true), ne(users.id, id)))
      .get()?.n ?? 0;

  return {
    list(filter = {}) {
      const conditions: SQL[] = [];
      if (filter.role !== undefined) {
        conditions.push(eq(users.role, filter.role));
      }
      if (filter.active !== undefined) {
        conditions.push(eq(users.active, filter.active));
      }
      return db
        .select()
        .from(users)
        .where(and(...conditions))
        .orderBy(asc(users.id))
        .all()
        .map(toUserDto);
    },

    get: (id) => toUserDto(requireRow(id)),
    findRow,

    findAdminByLogin,

    adminCount() {
      return db.select({ n: count() }).from(users).where(eq(users.role, 'admin')).get()?.n ?? 0;
    },

    activeLearners() {
      return db
        .select({ id: users.id, name: users.name, avatar: users.avatar })
        .from(users)
        .where(and(eq(users.role, 'learner'), eq(users.active, true)))
        .orderBy(asc(users.id))
        .all();
    },

    async create(input, actorId) {
      const now = Date.now();
      const base = {
        name: input.name,
        avatar: input.avatar ?? null,
        createdAt: now,
        updatedAt: now,
      };
      const values: typeof users.$inferInsert =
        input.role === 'admin'
          ? {
              ...base,
              role: 'admin',
              login: input.login,
              passwordHash: await hashSecret(input.password),
            }
          : { ...base, role: 'learner', pinHash: await hashSecret(input.pin) };
      const row = db.transaction(() => {
        const inserted = insertUser(values);
        recordCreated(inserted, actorId);
        return inserted;
      });
      return toUserDto(row);
    },

    async createFirstAdmin(input) {
      const passwordHash = await hashSecret(input.password);
      const now = Date.now();
      const row = db.transaction(() => {
        const admins = db.select({ n: count() }).from(users).where(eq(users.role, 'admin')).get();
        if ((admins?.n ?? 0) > 0) {
          throw conflict('already_set_up', 'Первый админ уже создан');
        }
        const inserted = insertUser({
          role: 'admin',
          name: input.name,
          login: input.login,
          passwordHash,
          createdAt: now,
          updatedAt: now,
        });
        recordCreated(inserted, null);
        return inserted;
      });
      return toUserDto(row);
    },

    async update(id, patch, actorId) {
      const current = requireRow(id);
      if (current.role === 'admin' && patch.pin !== undefined) {
        throw badRequest('validation_failed', 'У админа нет PIN');
      }
      if (
        current.role === 'learner' &&
        (patch.login !== undefined || patch.password !== undefined)
      ) {
        throw badRequest('validation_failed', 'У ученика нет логина и пароля');
      }
      const passwordHash =
        patch.password === undefined ? undefined : await hashSecret(patch.password);
      const pinHash = patch.pin === undefined ? undefined : await hashSecret(patch.pin);
      const now = Date.now();

      const row = db.transaction(() => {
        const fresh = requireRow(id);
        const set: Partial<typeof users.$inferInsert> = { updatedAt: now };
        const changed: string[] = [];
        if (patch.name !== undefined && patch.name !== fresh.name) {
          set.name = patch.name;
          changed.push('name');
        }
        if (patch.avatar !== undefined && patch.avatar !== fresh.avatar) {
          set.avatar = patch.avatar;
          changed.push('avatar');
        }
        if (patch.login !== undefined && patch.login !== fresh.login) {
          set.login = patch.login;
          changed.push('login');
        }
        if (passwordHash !== undefined) {
          set.passwordHash = passwordHash;
          changed.push('password');
        }
        if (pinHash !== undefined) {
          set.pinHash = pinHash;
          changed.push('pin');
        }
        const deactivate = patch.active === false && fresh.active;
        const reactivate = patch.active === true && !fresh.active;
        if (deactivate) {
          if (fresh.role === 'admin' && otherActiveAdmins(id) === 0) {
            throw new HttpError(409, 'last_admin', 'Нельзя отключить последнего активного админа');
          }
          set.active = false;
          set.deactivatedAt = now;
        }
        if (reactivate) {
          set.active = true;
          set.deactivatedAt = null;
        }

        let updated = fresh;
        if (changed.length > 0 || deactivate || reactivate) {
          try {
            updated = db.update(users).set(set).where(eq(users.id, id)).returning().get() ?? fresh;
          } catch (err) {
            if (isUniqueViolation(err)) {
              throw loginTaken();
            }
            throw err;
          }
        }
        const scope = learnerScope(fresh);
        if (changed.length > 0) {
          const payload = auditPayload(userUpdated, {
            changed,
            ...(set.name !== undefined && { name: set.name }),
            ...(typeof set.login === 'string' && { login: set.login }),
            ...(set.avatar !== undefined && { avatar: set.avatar }),
            ...(passwordHash !== undefined && { passwordChanged: true }),
            ...(pinHash !== undefined && { pinChanged: true }),
          });
          audit.record(actorId, userUpdated, 'user', id, payload, scope);
        }
        if (deactivate) {
          revokeSessionsOfUser(db, id, 'deactivated');
          const payload = auditPayload(userDeactivated, { name: fresh.name });
          audit.record(actorId, userDeactivated, 'user', id, payload, scope);
        }
        if (reactivate) {
          const payload = auditPayload(userReactivated, { name: fresh.name });
          audit.record(actorId, userReactivated, 'user', id, payload, scope);
        }
        if (passwordHash !== undefined || pinHash !== undefined) {
          revokeSessionsOfUser(db, id, 'credentials_changed');
        }
        return updated;
      });
      return toUserDto(row);
    },

    async resetPassword(login, password) {
      const admin = findAdminByLogin(login);
      if (!admin) {
        throw notFound(`Нет админа с логином ${login}`);
      }
      const passwordHash = await hashSecret(password);
      const row = db.transaction(() => {
        const updated = db
          .update(users)
          .set({ passwordHash, updatedAt: Date.now() })
          .where(eq(users.id, admin.id))
          .returning()
          .get();
        revokeSessionsOfUser(db, admin.id, 'password_reset');
        const payload = auditPayload(passwordReset, { login, via: 'cli' });
        audit.record(null, passwordReset, 'user', admin.id, payload);
        return updated ?? admin;
      });
      return toUserDto(row);
    },
  };
}
