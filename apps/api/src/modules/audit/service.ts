import { and, desc, eq, gte, lt, or, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../../db/client';
import { auditLog, type AuditLogRow } from '../../db/schema/audit';
import { redact } from './redact';

/** An auditable action and the payload fields it is allowed to record. */
export interface AuditAction<S extends z.ZodObject = z.ZodObject> {
  readonly name: string;
  readonly schema: S;
}

const ACTION_NAME = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const actions = new Map<string, AuditAction>();

/**
 * Declares an action (e.g. `user.deactivated`) with the zod schema of its payload. Fields not
 * in the schema are dropped when the payload is built. Modules declare their own actions.
 */
export function defineAuditAction<S extends z.ZodObject>(name: string, schema: S): AuditAction<S> {
  if (!ACTION_NAME.test(name)) {
    throw new Error(`Invalid audit action name: ${name}`);
  }
  if (actions.has(name)) {
    throw new Error(`Audit action defined twice: ${name}`);
  }
  const action = Object.freeze({ name, schema });
  actions.set(name, action);
  return action;
}

/** Names of all declared actions (for the history filter). */
export function listAuditActions(): string[] {
  return [...actions.keys()].sort();
}

declare const payloadBrand: unique symbol;

/** A payload that went through `auditPayload()`; the only kind `record()` accepts. */
export interface AuditPayload {
  readonly action: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly [payloadBrand]: true;
}

/** Keeps only the fields allowed for `action`, then masks sensitive ones. */
export function auditPayload<S extends z.ZodObject>(
  action: AuditAction<S>,
  data: z.input<S>,
): AuditPayload {
  const parsed = action.schema.safeParse(data);
  if (!parsed.success) {
    // A programming error, not a client error: never surfaces as a 400.
    throw new Error(`Invalid audit payload for ${action.name}: ${parsed.error.message}`);
  }
  const masked = redact(parsed.data) as Record<string, unknown>;
  return { action: action.name, data: masked } as unknown as AuditPayload;
}

export interface AuditRecord {
  readonly id: number;
  /** ISO 8601 */
  readonly at: string;
  readonly actorId: number | null;
  readonly action: string;
  readonly entity: string;
  readonly entityId: string | null;
  readonly learnerId: number | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface AuditQuery {
  readonly learnerId?: number;
  readonly action?: string;
  /** Inclusive lower bound, epoch ms. */
  readonly from?: number;
  /** Exclusive upper bound, epoch ms. */
  readonly to?: number;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface AuditPage {
  readonly items: AuditRecord[];
  readonly nextCursor: string | null;
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
export const CURSOR_PATTERN = /^\d+_\d+$/;

export interface RecordOptions {
  /** Learner the action concerns (for per-learner history). */
  readonly learnerId?: number | null;
}

export interface AuditService {
  /**
   * Appends one row. Called inside the caller's `db.transaction`, the row is part of that
   * transaction (single SQLite connection).
   */
  record(
    actorId: number | null,
    action: AuditAction,
    entity: string,
    entityId: string | number | null,
    payload: AuditPayload,
    options?: RecordOptions,
  ): AuditRecord;
  /** Newest first, keyset-paginated. Read-only. */
  list(query?: AuditQuery): AuditPage;
}

function toRecord(row: AuditLogRow): AuditRecord {
  return {
    id: row.id,
    at: new Date(row.at).toISOString(),
    actorId: row.actorId,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    learnerId: row.learnerId,
    payload: row.payload,
  };
}

function encodeCursor(row: AuditLogRow): string {
  return `${row.at}_${row.id}`;
}

function decodeCursor(cursor: string): { at: number; id: number } {
  if (!CURSOR_PATTERN.test(cursor)) {
    throw new Error(`Invalid audit cursor: ${cursor}`);
  }
  const [at = '0', id = '0'] = cursor.split('_');
  return { at: Number(at), id: Number(id) };
}

export function createAuditService(db: Db, clock: () => number = Date.now): AuditService {
  return {
    record(actorId, action, entity, entityId, payload, options = {}) {
      if (payload.action !== action.name) {
        throw new Error(`Audit payload was built for ${payload.action}, not ${action.name}`);
      }
      const row = db
        .insert(auditLog)
        .values({
          at: clock(),
          actorId,
          action: action.name,
          entity,
          entityId: entityId === null ? null : String(entityId),
          learnerId: options.learnerId ?? null,
          payload: { ...payload.data },
        })
        .returning()
        .get();
      return toRecord(row);
    },

    list(query = {}) {
      const limit = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
      const conditions: (SQL | undefined)[] = [];
      if (query.learnerId !== undefined) {
        conditions.push(eq(auditLog.learnerId, query.learnerId));
      }
      if (query.action !== undefined) {
        conditions.push(eq(auditLog.action, query.action));
      }
      if (query.from !== undefined) {
        conditions.push(gte(auditLog.at, query.from));
      }
      if (query.to !== undefined) {
        conditions.push(lt(auditLog.at, query.to));
      }
      if (query.cursor !== undefined) {
        const cursor = decodeCursor(query.cursor);
        conditions.push(
          or(
            lt(auditLog.at, cursor.at),
            and(eq(auditLog.at, cursor.at), lt(auditLog.id, cursor.id)),
          ),
        );
      }
      const rows = db
        .select()
        .from(auditLog)
        .where(and(...conditions))
        .orderBy(desc(auditLog.at), desc(auditLog.id))
        .limit(limit + 1)
        .all();
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(toRecord),
        nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
      };
    },
  };
}
