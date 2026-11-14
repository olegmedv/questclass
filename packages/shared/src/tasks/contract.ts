import type { z } from 'zod';

/** Fields of a task a type looks at when deciding whether it can be published. */
export interface TaskDraft<C> {
  readonly title: string;
  readonly subjectId: number | null;
  readonly xp: number;
  readonly coins: number;
  readonly config: C;
}

/**
 * The shared half of a task type plugin (CLAUDE.md rule 10): what the type stores, what a
 * learner submits, what of the config a learner may see, and the static publish checks.
 * The server half (grading, start checks, import) lives in `apps/api/src/task-types/<type>/`.
 */
export interface TaskTypeContract<C = unknown, S = unknown> {
  /** Stable id stored in `tasks.type`, e.g. `quiz`. */
  readonly type: string;
  /** Russian name for the admin UI. */
  readonly label: string;
  readonly configSchema: z.ZodType<C>;
  readonly submissionSchema: z.ZodType<S>;
  /** Config of a newly created task. */
  defaultConfig(): C;
  /** The part of the config a learner may see (never answers or admin notes). */
  publicConfig(config: C): unknown;
  /** Human-readable reasons why the task cannot be published yet; empty = ready. */
  canPublish(task: TaskDraft<C>): string[];
}

const TYPE_ID = /^[a-z][a-z0-9_]{1,39}$/;

/** Declares a task type contract; validates the id and that the default config is valid. */
export function defineTaskType<C, S>(contract: TaskTypeContract<C, S>): TaskTypeContract<C, S> {
  if (!TYPE_ID.test(contract.type)) {
    throw new Error(`Invalid task type id: ${contract.type}`);
  }
  const check = contract.configSchema.safeParse(contract.defaultConfig());
  if (!check.success) {
    throw new Error(`Default config of task type ${contract.type} does not match its schema`);
  }
  return Object.freeze({ ...contract });
}
