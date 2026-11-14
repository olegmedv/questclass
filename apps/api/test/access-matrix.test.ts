/**
 * Access matrix (CLAUDE.md rule 11): who may call which route.
 *
 * Every item that adds routes adds rows here. Rows for a learner's own data must point the URL
 * at learner A's resource and set `learnerOwned: true`; learner B must then get 404.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROLES } from '../src/http/route';
import {
  createTwoLearners,
  PERSONAS,
  type Persona,
  type TwoLearners,
} from './fixtures/twoLearners';

type Expectation = Readonly<Record<Persona, number>>;

interface MatrixRow {
  /** `METHOD /path` exactly as declared with route(). */
  readonly route: string;
  /** Concrete URL (default: the declared path). */
  readonly url?: (f: TwoLearners) => string;
  readonly body?: (f: TwoLearners, persona: Persona) => unknown;
  /** The request changes state other rows rely on: run it on a fixture of its own. */
  readonly fresh?: boolean;
  /** The URL addresses learner A's data: learner B must get 404. */
  readonly learnerOwned?: boolean;
  readonly expect: Expectation;
}

const everyone = (status: number): Expectation => ({
  anon: status,
  import: status,
  learnerA: status,
  learnerB: status,
  admin: status,
});
const adminOnly = (ok: number): Expectation => ({
  anon: 401,
  import: 401,
  learnerA: 403,
  learnerB: 403,
  admin: ok,
});
/** Routes about the caller's own learner data (`/api/me/...`). */
const learnerOnly = (ok: number): Expectation => ({
  anon: 401,
  import: 401,
  learnerA: ok,
  learnerB: ok,
  admin: 403,
});
const signedIn = (ok: number): Expectation => ({
  anon: 401,
  import: 401,
  learnerA: ok,
  learnerB: ok,
  admin: ok,
});

const MATRIX: readonly MatrixRow[] = [
  // health
  { route: 'GET /api/health', expect: everyone(200) },

  // setup: an admin already exists, so it is closed for everybody
  { route: 'GET /api/setup', expect: everyone(200) },
  {
    route: 'POST /api/setup',
    body: () => ({ token: 'wrong', login: 'intruder', password: 'long-enough-pass' }),
    expect: everyone(409),
  },

  // auth
  {
    route: 'POST /api/auth/login',
    body: (_f, persona) => ({ login: `nobody-${persona}`, password: 'wrong-password' }),
    expect: everyone(401),
  },
  {
    route: 'POST /api/auth/learner-login',
    body: (f) => ({ userId: f.ids.learnerA, pin: '0000' }),
    // Only browsers on the trusted tablet may even try a PIN.
    expect: { anon: 403, import: 403, learnerA: 401, learnerB: 401, admin: 403 },
  },
  { route: 'POST /api/auth/logout', fresh: true, expect: signedIn(204) },
  { route: 'GET /api/auth/me', expect: signedIn(200) },
  {
    route: 'GET /api/auth/profiles',
    expect: { anon: 403, import: 403, learnerA: 200, learnerB: 200, admin: 403 },
  },
  { route: 'GET /api/auth/devices', expect: adminOnly(200) },
  {
    route: 'POST /api/auth/devices',
    body: () => ({ name: 'Ещё планшет' }),
    expect: adminOnly(201),
  },
  {
    route: 'DELETE /api/auth/devices/:id',
    url: (f) => `/api/auth/devices/${f.ids.spareDevice}`,
    expect: adminOnly(200),
  },

  // users
  { route: 'GET /api/admin/users', expect: adminOnly(200) },
  {
    route: 'POST /api/admin/users',
    body: () => ({ role: 'learner', name: 'Новичок', pin: '4321' }),
    expect: adminOnly(201),
  },
  {
    route: 'GET /api/admin/users/:id',
    url: (f) => `/api/admin/users/${f.ids.learnerA}`,
    expect: adminOnly(200),
  },
  {
    route: 'PATCH /api/admin/users/:id',
    url: (f) => `/api/admin/users/${f.ids.learnerA}`,
    body: () => ({ name: 'Аня' }),
    expect: adminOnly(200),
  },

  // audit
  { route: 'GET /api/admin/audit', expect: adminOnly(200) },

  // settings and secrets
  { route: 'GET /api/admin/settings', expect: adminOnly(200) },
  {
    route: 'PUT /api/admin/settings',
    body: () => ({ 'session.learnerDays': 180 }),
    expect: adminOnly(200),
  },
  { route: 'GET /api/admin/secrets', expect: adminOnly(200) },
  // The core registry has no secrets yet, so even the admin gets 404 for this key.
  {
    route: 'PUT /api/admin/secrets/:key',
    url: () => '/api/admin/secrets/not.registered',
    body: () => ({ value: 'x' }),
    expect: adminOnly(404),
  },
  {
    route: 'DELETE /api/admin/secrets/:key',
    url: () => '/api/admin/secrets/not.registered',
    expect: adminOnly(404),
  },

  // ledger
  { route: 'GET /api/me/wallet', expect: learnerOnly(200) },
  { route: 'GET /api/me/ledger', expect: learnerOnly(200) },
  {
    route: 'GET /api/admin/learners/:id/ledger',
    url: (f) => `/api/admin/learners/${f.ids.learnerA}/ledger`,
    expect: adminOnly(200),
  },
];

function splitRoute(key: string): { method: string; path: string } {
  const [method = '', path = ''] = key.split(' ');
  return { method, path };
}

describe('access matrix', () => {
  let shared: TwoLearners;

  beforeAll(async () => {
    shared = await createTwoLearners();
  }, 30_000);

  afterAll(async () => {
    await shared.close();
  });

  it('every registered route declares at least one known role', () => {
    expect(shared.routes.length).toBeGreaterThan(0);
    for (const def of shared.routes) {
      expect(def.roles.length, `${def.method} ${def.path}`).toBeGreaterThan(0);
      expect(def.roles.every((role) => (ROLES as readonly string[]).includes(role))).toBe(true);
    }
  });

  it('nothing is mounted around the route() registry', () => {
    const declared = new Set(shared.routes.map((r) => `${r.method} ${r.path}`));
    const mounted = new Set(
      shared.app.routes.filter((r) => r.method !== 'ALL').map((r) => `${r.method} ${r.path}`),
    );
    expect([...mounted].sort()).toEqual([...declared].sort());
  });

  it('has exactly one row per registered route', () => {
    const declared = shared.routes.map((r) => `${r.method} ${r.path}`).sort();
    const covered = MATRIX.map((row) => row.route).sort();
    expect(covered).toEqual(declared);
  });

  it('rows for a learner’s own data expect 404 for the other learner', () => {
    for (const row of MATRIX.filter((r) => r.learnerOwned)) {
      expect(row.expect.learnerB, row.route).toBe(404);
    }
  });

  it('the fixture signs each learner in as themselves', async () => {
    const meA = (await (await shared.as('learnerA').get('/api/auth/me')).json()) as { id: number };
    const meB = (await (await shared.as('learnerB').get('/api/auth/me')).json()) as { id: number };
    expect(meA.id).toBe(shared.ids.learnerA);
    expect(meB.id).toBe(shared.ids.learnerB);
  });

  for (const row of MATRIX) {
    it(
      row.route,
      async () => {
        const fixture = row.fresh ? await createTwoLearners() : shared;
        try {
          const { method, path } = splitRoute(row.route);
          const url = row.url?.(fixture) ?? path;
          const actual: Partial<Record<Persona, number>> = {};
          for (const persona of PERSONAS) {
            const body = row.body?.(fixture, persona);
            const res = await fixture
              .as(persona)
              .request(method, url, body === undefined ? {} : { json: body });
            actual[persona] = res.status;
          }
          expect(actual).toEqual(row.expect);
        } finally {
          if (row.fresh) {
            await fixture.close();
          }
        }
      },
      30_000,
    );
  }
});
