import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { MiddlewareHandler } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../src/app';
import { DB_FILENAME } from '../src/db/client';
import type { AppEnv } from '../src/http/route';
import { auditRoutes } from '../src/modules/audit/routes';
import { REDACTED, redact } from '../src/modules/audit/redact';
import {
  auditPayload,
  createAuditService,
  defineAuditAction,
  listAuditActions,
  type AuditService,
} from '../src/modules/audit/service';
import { createTestRuntime, type TestRuntime } from './helpers/db';

// Actions as real modules declare them: only the listed fields may be recorded.
const secretUpdated = defineAuditAction(
  'test_secret.updated',
  z.object({ key: z.string(), isSet: z.boolean() }),
);
const passwordChanged = defineAuditAction(
  'test_user.password_changed',
  z.object({ login: z.string(), newPassword: z.string().optional() }),
);
const userRenamed = defineAuditAction(
  'test_user.renamed',
  z.object({ from: z.string(), to: z.string() }),
);

let runtime: TestRuntime;
let audit: AuditService;
let now: number;

beforeEach(async () => {
  runtime = await createTestRuntime();
  now = Date.parse('2026-11-14T10:00:00Z');
  audit = createAuditService(runtime.ctx.db, () => now);
});

afterEach(async () => {
  await runtime.close();
});

/** Everything SQLite has on disk for this database (main file + WAL), as text. */
function databaseBytes(): string {
  runtime.ctx.db.$client.pragma('wal_checkpoint(TRUNCATE)');
  return readFileSync(path.join(runtime.dataDir, DB_FILENAME)).toString('latin1');
}

function rowCount(): number {
  const row = runtime.ctx.db.$client.prepare('SELECT count(*) AS n FROM audit_log').get() as {
    n: number;
  };
  return row.n;
}

describe('audit.record', () => {
  it('writes exactly one row with the given fields', () => {
    const record = audit.record(
      7,
      userRenamed,
      'user',
      42,
      auditPayload(userRenamed, {
        from: 'Саша',
        to: 'Александр',
      }),
      { learnerId: 42 },
    );

    expect(rowCount()).toBe(1);
    expect(record).toMatchObject({
      at: '2026-11-14T10:00:00.000Z',
      actorId: 7,
      action: 'test_user.renamed',
      entity: 'user',
      entityId: '42',
      learnerId: 42,
      payload: { from: 'Саша', to: 'Александр' },
    });
  });

  it('never stores a secret value, only {key, isSet}', () => {
    // A careless caller passes the whole input, including the secret itself.
    const input = { key: 'openai.apiKey', isSet: true, value: 'sk-live-TOPSECRET-1234' };
    audit.record(1, secretUpdated, 'secret', input.key, auditPayload(secretUpdated, input));

    const [stored] = audit.list().items;
    expect(stored?.payload).toEqual({ key: 'openai.apiKey', isSet: true });
    expect(databaseBytes()).not.toContain('TOPSECRET');
  });

  it('masks password fields even when an action schema allows them', () => {
    const payload = auditPayload(passwordChanged, { login: 'mama', newPassword: 'hunter2-qwerty' });
    audit.record(1, passwordChanged, 'user', 1, payload);

    expect(audit.list().items[0]?.payload).toEqual({ login: 'mama', newPassword: REDACTED });
    expect(databaseBytes()).not.toContain('hunter2-qwerty');
  });

  it('refuses a payload built for another action', () => {
    const payload = auditPayload(userRenamed, { from: 'a', to: 'b' });
    expect(() => audit.record(1, secretUpdated, 'secret', 'k', payload)).toThrow(/another|not/);
    expect(rowCount()).toBe(0);
  });

  it('treats an invalid payload as a programming error', () => {
    const bad = { key: 'x' } as unknown as { key: string; isSet: boolean };
    expect(() => auditPayload(secretUpdated, bad)).toThrow(/Invalid audit payload/);
  });

  it('is part of the caller transaction', () => {
    expect(() =>
      runtime.ctx.db.transaction(() => {
        audit.record(1, userRenamed, 'user', 1, auditPayload(userRenamed, { from: 'a', to: 'b' }));
        throw new Error('rollback');
      }),
    ).toThrow('rollback');
    expect(rowCount()).toBe(0);
  });

  it('rejects duplicate or malformed action names', () => {
    expect(() => defineAuditAction('test_user.renamed', z.object({}))).toThrow(/twice/);
    expect(() => defineAuditAction('NoDots', z.object({}))).toThrow(/Invalid/);
    expect(listAuditActions()).toContain('test_secret.updated');
  });
});

describe('redact', () => {
  it('masks sensitive words at any depth and keeps booleans', () => {
    expect(
      redact({
        login: 'mama',
        pin: '1234',
        pinHash: 'abc',
        pinSet: true,
        device: { tokenHash: 'deadbeef', name: 'Планшет' },
        tokens: ['t1', 't2'],
        spinner: 'kept',
        list: [{ api_token: 'x' }],
        value: null,
      }),
    ).toEqual({
      login: 'mama',
      pin: REDACTED,
      pinHash: REDACTED,
      pinSet: true,
      device: { tokenHash: REDACTED, name: 'Планшет' },
      tokens: REDACTED,
      spinner: 'kept',
      list: [{ api_token: REDACTED }],
      value: null,
    });
  });
});

describe('audit.list', () => {
  function seed(): void {
    const rows: [number, number | null, typeof userRenamed | typeof secretUpdated][] = [
      [Date.parse('2026-11-10T08:00:00Z'), 10, userRenamed],
      [Date.parse('2026-11-11T08:00:00Z'), 11, userRenamed],
      [Date.parse('2026-11-12T08:00:00Z'), null, secretUpdated],
      [Date.parse('2026-11-13T08:00:00Z'), 10, userRenamed],
      [Date.parse('2026-11-13T08:00:00Z'), 10, userRenamed],
    ];
    for (const [at, learnerId, action] of rows) {
      now = at;
      const payload =
        action === secretUpdated
          ? auditPayload(secretUpdated, { key: 'k', isSet: false })
          : auditPayload(userRenamed, { from: 'a', to: 'b' });
      audit.record(1, action, 'user', learnerId, payload, { learnerId });
    }
  }

  it('returns newest first and pages with a cursor without gaps or repeats', () => {
    seed();
    const seen: number[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = audit.list({ limit: 2, ...(cursor ? { cursor } : {}) });
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toEqual([5, 4, 3, 2, 1]);
  });

  it('filters by learner, action and time range', () => {
    seed();
    expect(audit.list({ learnerId: 10 }).items.map((i) => i.id)).toEqual([5, 4, 1]);
    expect(audit.list({ action: 'test_secret.updated' }).items.map((i) => i.id)).toEqual([3]);
    const range = audit.list({
      from: Date.parse('2026-11-11T00:00:00Z'),
      to: Date.parse('2026-11-13T00:00:00Z'),
    });
    expect(range.items.map((i) => i.id)).toEqual([3, 2]);
  });

  it('does not write to the database', () => {
    seed();
    const before = runtime.ctx.db.$client.prepare('SELECT total_changes() AS n').get();
    audit.list({ learnerId: 10 });
    audit.list({ limit: 1 });
    const after = runtime.ctx.db.$client.prepare('SELECT total_changes() AS n').get();
    expect(after).toEqual(before);
  });

  it('has indexes on (at), (entity, entity_id) and (learner_id, at)', () => {
    const sqlite = runtime.ctx.db.$client;
    const indexes = sqlite.prepare("PRAGMA index_list('audit_log')").all() as { name: string }[];
    const columns = indexes
      .map((index) =>
        (sqlite.prepare(`PRAGMA index_info('${index.name}')`).all() as { name: string }[])
          .map((c) => c.name)
          .join(','),
      )
      .sort();
    expect(columns).toEqual(['at', 'entity,entity_id', 'learner_id,at']);
    const plan = sqlite
      .prepare('EXPLAIN QUERY PLAN SELECT * FROM audit_log WHERE learner_id = ? ORDER BY at DESC')
      .all(10) as { detail: string }[];
    expect(plan.map((p) => p.detail).join(' ')).toContain('audit_log_learner_at_idx');
  });
});

describe('GET /api/admin/audit', () => {
  const asAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
    c.set('actor', { role: 'admin', id: 1 });
    await next();
  };

  function app() {
    return buildApp(runtime.ctx, auditRoutes(runtime.ctx), { middlewares: [asAdmin] }).app;
  }

  it('is declared for admins only', () => {
    const [def] = auditRoutes(runtime.ctx);
    expect(def?.roles).toEqual(['admin']);
  });

  it('returns a filtered page', async () => {
    const payload = auditPayload(userRenamed, { from: 'a', to: 'b' });
    runtime.ctx.audit.record(1, userRenamed, 'user', 5, payload, { learnerId: 5 });
    runtime.ctx.audit.record(1, userRenamed, 'user', 6, payload, { learnerId: 6 });

    const res = await app().request('/api/admin/audit?learnerId=6&from=2000-01-01T00:00:00Z');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { learnerId: number }[]; nextCursor: null };
    expect(body.items.map((i) => i.learnerId)).toEqual([6]);
    expect(body.nextCursor).toBeNull();
  });

  it('validates the query', async () => {
    expect((await app().request('/api/admin/audit?learnerId=abc')).status).toBe(400);
    expect((await app().request('/api/admin/audit?cursor=garbage')).status).toBe(400);
    expect((await app().request('/api/admin/audit?from=yesterday')).status).toBe(400);
  });
});
