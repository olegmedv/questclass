import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import {
  IP_POLICY,
  MAX_DELAY_MS,
  PAIR_POLICY,
  createThrottle,
  delayFor,
  throttleKeys,
} from '../src/modules/auth/throttle';
import {
  ADMIN,
  createClient,
  createLearner,
  errorCode,
  loginAdmin,
  seedAdmin,
  trustDevice,
} from './helpers/client';
import { createTestRuntime, type TestRuntime } from './helpers/db';

const PROXY = '172.18.0.2'; // Caddy on the Docker network: trusted by default
const ATTACKER = '198.51.100.66';
const OWNER = '203.0.113.7';

let runtime: TestRuntime;
let now: number;

beforeEach(async () => {
  runtime = await createTestRuntime();
  await seedAdmin(runtime.ctx);
  now = Date.parse('2026-11-14T09:00:00Z');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
});

afterEach(async () => {
  vi.useRealTimers();
  await runtime.close();
});

function advance(ms: number): void {
  now += ms;
  vi.setSystemTime(now);
}

function browserFrom(ip: string) {
  return createClient(createApp(runtime.ctx).app, { peer: PROXY, forwardedFor: ip });
}

const wrongLogin = { login: ADMIN.login, password: 'wrong-password' };

describe('delay schedule', () => {
  it('allows a few typos, then doubles the delay up to 15 minutes', () => {
    expect([1, 2, 3].map((f) => delayFor(f, PAIR_POLICY))).toEqual([0, 0, 0]);
    expect([4, 5, 6, 7].map((f) => delayFor(f, PAIR_POLICY))).toEqual([1000, 2000, 4000, 8000]);
    expect(delayFor(14, PAIR_POLICY)).toBe(MAX_DELAY_MS);
    expect(delayFor(1000, PAIR_POLICY)).toBe(MAX_DELAY_MS);
    expect(delayFor(IP_POLICY.free + 1, IP_POLICY)).toBe(IP_POLICY.baseMs);
  });

  it('never locks longer than 15 minutes', () => {
    const throttle = createThrottle(runtime.ctx.db);
    const keys = throttleKeys('admin:mama', ATTACKER);
    for (let i = 0; i < 40; i += 1) {
      throttle.recordFailure(keys);
    }
    expect(throttle.retryAfter(keys)).toBe(MAX_DELAY_MS);
  });
});

describe('login throttling behind the reverse proxy', () => {
  it('locks the (account, IP) pair with growing delays, answering 429 + Retry-After', async () => {
    const attacker = browserFrom(ATTACKER);
    for (let i = 0; i < 4; i += 1) {
      expect((await attacker.post('/api/auth/login', wrongLogin)).status).toBe(401);
    }
    const locked = await attacker.post('/api/auth/login', wrongLogin);
    expect(locked.status).toBe(429);
    expect(locked.headers.get('retry-after')).toBe('1');
    expect(await errorCode(locked)).toBe('too_many_attempts');

    advance(1000);
    expect((await attacker.post('/api/auth/login', wrongLogin)).status).toBe(401);
    const longer = await attacker.post('/api/auth/login', wrongLogin);
    expect(longer.status).toBe(429);
    expect(longer.headers.get('retry-after')).toBe('2');
  });

  it('refuses even the right password while locked', async () => {
    const attacker = browserFrom(ATTACKER);
    for (let i = 0; i < 4; i += 1) {
      await attacker.post('/api/auth/login', wrongLogin);
    }
    const res = await attacker.post('/api/auth/login', {
      login: ADMIN.login,
      password: ADMIN.password,
    });
    expect(res.status).toBe(429);
  });

  it('does not let a stranger lock the owner out (different X-Forwarded-For)', async () => {
    const throttle = createThrottle(runtime.ctx.db);
    const attackerKeys = throttleKeys(`admin:${ADMIN.login}`, ATTACKER);
    for (let i = 0; i < 12; i += 1) {
      throttle.recordFailure(attackerKeys);
    }
    expect((await browserFrom(ATTACKER).post('/api/auth/login', wrongLogin)).status).toBe(429);

    const owner = browserFrom(OWNER);
    await loginAdmin(owner);
    expect((await owner.get('/api/auth/me')).status).toBe(200);
  });

  it('limits one IP across many accounts', async () => {
    const throttle = createThrottle(runtime.ctx.db);
    for (let i = 0; i < IP_POLICY.free; i += 1) {
      throttle.recordFailure(throttleKeys(`admin:user${i}`, ATTACKER));
    }
    const attacker = browserFrom(ATTACKER);
    // One more failure on a fresh account trips the per-IP limit…
    expect((await attacker.post('/api/auth/login', { login: 'fresh', password: 'x' })).status).toBe(
      401,
    );
    // …so yet another account from the same IP is refused before any password check.
    expect((await attacker.post('/api/auth/login', { login: 'other', password: 'x' })).status).toBe(
      429,
    );
    // The owner, from another address, is unaffected.
    await loginAdmin(browserFrom(OWNER));
  });

  it('resets the pair counter after a successful login', async () => {
    const owner = browserFrom(OWNER);
    for (let i = 0; i < 3; i += 1) {
      await owner.post('/api/auth/login', wrongLogin);
    }
    await loginAdmin(owner);
    for (let i = 0; i < 3; i += 1) {
      expect((await owner.post('/api/auth/login', wrongLogin)).status).toBe(401);
    }
  });

  it('throttles PIN guessing per learner on a trusted device', async () => {
    const learnerId = await createLearner(runtime.ctx, 'Саша', '1234');
    const tablet = browserFrom(OWNER);
    await loginAdmin(tablet);
    await trustDevice(tablet);
    const guess = (pin: string) =>
      tablet.post('/api/auth/learner-login', { userId: learnerId, pin });
    for (const pin of ['0000', '1111', '2222', '3333']) {
      expect((await guess(pin)).status).toBe(401);
    }
    expect((await guess('1234')).status).toBe(429);
    advance(1000);
    expect((await guess('1234')).status).toBe(200);
  });
});
