import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export type JobRunStatus = 'running' | 'ok' | 'failed';

/**
 * One run of a background job. At most one unfinished run per job (partial UNIQUE), so runs never
 * overlap, even across processes; the row is finished once (`ok` or `failed`).
 */
export const jobRuns = sqliteTable(
  'job_runs',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    job: text().notNull(),
    /** Epoch milliseconds. */
    startedAt: integer().notNull(),
    finishedAt: integer(),
    status: text().$type<JobRunStatus>().notNull().default('running'),
    /** Counters of the run (value object, read whole). */
    result: text({ mode: 'json' }).$type<Record<string, number>>(),
    error: text(),
  },
  (t) => [
    uniqueIndex('job_runs_one_running_uq')
      .on(t.job)
      .where(sql`finished_at IS NULL`),
    index('job_runs_job_started_idx').on(t.job, t.startedAt),
  ],
);

export type JobRunRow = typeof jobRuns.$inferSelect;
