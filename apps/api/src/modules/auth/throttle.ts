import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { loginThrottle } from '../../db/schema/loginThrottle';

export const MAX_DELAY_MS = 15 * 60 * 1000;
/** Counters are forgotten after a day without failures. */
const DECAY_MS = 24 * 60 * 60 * 1000;

export interface ThrottlePolicy {
  /** Failures allowed without any delay. */
  readonly free: number;
  /** Delay after the first counted failure; doubles with each further one. */
  readonly baseMs: number;
}

/** Per (account, IP): a few typos are free, then 1 s, 2 s, 4 s … up to 15 minutes. */
export const PAIR_POLICY: ThrottlePolicy = { free: 3, baseMs: 1000 };
/** Per IP across all accounts: catches an attacker cycling through accounts. */
export const IP_POLICY: ThrottlePolicy = { free: 20, baseMs: 5000 };

/** Lock duration after `failures` consecutive failures. */
export function delayFor(failures: number, policy: ThrottlePolicy): number {
  if (failures <= policy.free) {
    return 0;
  }
  const exponent = Math.min(failures - policy.free - 1, 30);
  return Math.min(MAX_DELAY_MS, policy.baseMs * 2 ** exponent);
}

export interface ThrottleKeys {
  readonly pair: string;
  readonly ip: string;
}

/** Keys for an attempt on `account` (e.g. `admin:mama`, `learner:3`) from `ip`. */
export function throttleKeys(account: string, ip: string): ThrottleKeys {
  return { pair: `pair:${account}|${ip}`, ip: `ip:${ip}` };
}

export interface Throttle {
  /** Milliseconds until the next attempt is allowed (0 = allowed now). Read-only. */
  retryAfter(keys: ThrottleKeys): number;
  recordFailure(keys: ThrottleKeys): void;
  recordSuccess(keys: ThrottleKeys): void;
}

export function createThrottle(db: Db, clock: () => number = () => Date.now()): Throttle {
  const bump = (key: string, policy: ThrottlePolicy, now: number): void => {
    const row = db.select().from(loginThrottle).where(eq(loginThrottle.key, key)).get();
    const previous = row && now - row.lastFailureAt <= DECAY_MS ? row.failures : 0;
    const failures = previous + 1;
    const lockedUntil = now + delayFor(failures, policy);
    db.insert(loginThrottle)
      .values({ key, failures, lastFailureAt: now, lockedUntil })
      .onConflictDoUpdate({
        target: loginThrottle.key,
        set: { failures, lastFailureAt: now, lockedUntil },
      })
      .run();
  };

  return {
    retryAfter(keys) {
      const now = clock();
      const rows = db
        .select({ lockedUntil: loginThrottle.lockedUntil })
        .from(loginThrottle)
        .where(inArray(loginThrottle.key, [keys.pair, keys.ip]))
        .all();
      const until = Math.max(0, ...rows.map((r) => r.lockedUntil));
      return Math.max(0, until - now);
    },

    recordFailure(keys) {
      const now = clock();
      db.transaction(() => {
        bump(keys.pair, PAIR_POLICY, now);
        bump(keys.ip, IP_POLICY, now);
      });
    },

    recordSuccess(keys) {
      db.delete(loginThrottle).where(eq(loginThrottle.key, keys.pair)).run();
    },
  };
}
