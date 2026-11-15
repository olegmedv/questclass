import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Journal of administrative and security-relevant actions: one row per action, never updated
 * or deleted. `payload` is a single-row value object (CLAUDE.md rule 1b), already filtered
 * to the fields allowed for its action and redacted.
 */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    /** Epoch milliseconds. */
    at: integer().notNull(),
    /** Acting user; null for the system itself (startup, scheduled jobs). */
    actorId: integer(),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text(),
    /** Learner the action concerns, if any (for the per-learner history filter). */
    learnerId: integer(),
    payload: text({ mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  },
  (t) => [
    index('audit_log_at_idx').on(t.at),
    index('audit_log_entity_idx').on(t.entity, t.entityId),
    index('audit_log_learner_at_idx').on(t.learnerId, t.at),
  ],
);

export type AuditLogRow = typeof auditLog.$inferSelect;
