/**
 * Fixture users without paying for scrypt on every test: each distinct password or PIN is
 * hashed once per test file and the rows are inserted directly. Use it in tests that are not
 * about authentication; auth tests keep going through the users service.
 */
import type { AppContext } from '../../src/app';
import { users } from '../../src/db/schema/users';
import { hashSecret } from '../../src/modules/auth/crypto';
import { ADMIN, type AdminCredentials } from './client';

const hashes = new Map<string, Promise<string>>();

function cachedHash(secret: string): Promise<string> {
  let hash = hashes.get(secret);
  if (!hash) {
    hash = hashSecret(secret);
    hashes.set(secret, hash);
  }
  return hash;
}

/** An admin that `loginAdmin(client, admin)` can sign in as. */
export async function quickAdmin(
  ctx: AppContext,
  admin: AdminCredentials = ADMIN,
): Promise<number> {
  const now = Date.now();
  const row = ctx.db
    .insert(users)
    .values({
      role: 'admin',
      name: admin.name,
      login: admin.login,
      passwordHash: await cachedHash(admin.password),
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return row.id;
}

/** An active learner with the given PIN. */
export async function quickLearner(ctx: AppContext, name: string, pin: string): Promise<number> {
  const now = Date.now();
  const row = ctx.db
    .insert(users)
    .values({
      role: 'learner',
      name,
      pinHash: await cachedHash(pin),
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return row.id;
}
