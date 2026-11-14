import { and, eq, isNull, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { isUniqueViolation } from '../db/constraints';
import { jobRuns, type JobRunRow } from '../db/schema/jobRuns';

/** A background job of the process (CLAUDE.md: no external cron). */
export interface Job {
  readonly name: string;
  readonly intervalMs: number;
  /** Delay of the first run after start (default: one interval). */
  readonly firstDelayMs?: number;
  /** Does the work; returns counters for `job_runs.result`. */
  run(now: number): Record<string, number>;
}

export type RunOutcome =
  | { readonly status: 'ok'; readonly run: JobRunRow }
  | { readonly status: 'failed'; readonly run: JobRunRow }
  /** Another run of the job had not finished yet. */
  | { readonly status: 'skipped' };

export interface Scheduler {
  start(): void;
  stop(): void;
  /** Runs one job now (tests, CLI); never overlaps another run of it. */
  runNow(name: string): RunOutcome;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const nodeTimers: Timers = {
  setTimeout: (fn, ms) => {
    const handle = setTimeout(fn, ms);
    // Background work never keeps the process alive.
    handle.unref();
    return handle;
  },
  clearTimeout: (handle) => {
    clearTimeout(handle as NodeJS.Timeout);
  },
};

/** An unfinished run older than this was cut off (crash, kill) and no longer blocks the job. */
export const STALE_RUN_MS = 6 * 60 * 60 * 1000;

/**
 * Starts a run of `job` unless one is still going: the row is the lock. A run older than
 * `STALE_RUN_MS` is closed as failed first.
 */
export function runJob(db: Db, job: Job, now: number): RunOutcome {
  const started = db.transaction(() => {
    db.update(jobRuns)
      .set({ status: 'failed', finishedAt: now, error: 'interrupted' })
      .where(
        and(
          eq(jobRuns.job, job.name),
          isNull(jobRuns.finishedAt),
          lt(jobRuns.startedAt, now - STALE_RUN_MS),
        ),
      )
      .run();
    try {
      return db.insert(jobRuns).values({ job: job.name, startedAt: now }).returning().get();
    } catch (err) {
      if (isUniqueViolation(err, 'job_runs.job')) {
        return null;
      }
      throw err;
    }
  });
  if (!started) {
    return { status: 'skipped' };
  }
  const finish = (set: Partial<JobRunRow>): JobRunRow =>
    db
      .update(jobRuns)
      .set({ ...set, finishedAt: Date.now() })
      .where(eq(jobRuns.id, started.id))
      .returning()
      .get() ?? started;
  try {
    const result = job.run(now);
    return { status: 'ok', run: finish({ status: 'ok', result }) };
  } catch (err) {
    console.error(`Job ${job.name} failed`, err);
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'failed', run: finish({ status: 'failed', error: message.slice(0, 500) }) };
  }
}

export interface SchedulerOptions {
  readonly clock?: () => number;
  readonly timers?: Timers;
}

/** Runs each job every `intervalMs` in this process, one run of a job at a time. */
export function createScheduler(
  db: Db,
  jobs: readonly Job[],
  options: SchedulerOptions = {},
): Scheduler {
  const { clock = Date.now, timers = nodeTimers } = options;
  const handles = new Map<string, unknown>();
  let running = false;

  const find = (name: string): Job => {
    const job = jobs.find((j) => j.name === name);
    if (!job) {
      throw new Error(`Unknown job: ${name}`);
    }
    return job;
  };

  const schedule = (job: Job, delay: number): void => {
    handles.set(
      job.name,
      timers.setTimeout(() => {
        if (!running) return;
        runJob(db, job, clock());
        if (running) schedule(job, job.intervalMs);
      }, delay),
    );
  };

  return {
    start() {
      if (running) return;
      running = true;
      for (const job of jobs) {
        schedule(job, job.firstDelayMs ?? job.intervalMs);
      }
    },
    stop() {
      running = false;
      for (const handle of handles.values()) {
        timers.clearTimeout(handle);
      }
      handles.clear();
    },
    runNow: (name) => runJob(db, find(name), clock()),
  };
}
