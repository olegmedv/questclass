import type { TaskTypeContract } from '@questclass/shared/tasks/contract';
import type { TaskStatus } from '@questclass/shared/tasks/dto';
import type { Db } from '../db/client';
import type { SettingsService } from '../modules/settings/service';

/** A task as type plugins see it: the row with its config already parsed by the type. */
export interface TaskRecord<C = unknown> {
  readonly id: number;
  readonly type: string;
  readonly subjectId: number | null;
  readonly title: string;
  readonly description: string;
  readonly config: C;
  readonly xp: number;
  readonly coins: number;
  readonly status: TaskStatus;
  /** Epoch ms. */
  readonly releaseAt: number | null;
  readonly lessonDate: string | null;
  readonly sort: number;
}

/** What server hooks of a type may use; a type builds its own queries from `db`. */
export interface TaskTypeDeps {
  readonly db: Db;
  readonly settings: SettingsService;
}

export type CanStartResult =
  { readonly ok: true } | { readonly ok: false; readonly code: string; readonly message: string };

export interface CanStartInput<C> {
  readonly task: TaskRecord<C>;
  readonly learnerId: number;
  /** Epoch ms. */
  readonly now: number;
  readonly deps: TaskTypeDeps;
}

export interface GradeInput<C, S> {
  readonly config: C;
  readonly submission: S;
  /** What the submission is compared with (e.g. the correct option of a snapshotted question). */
  readonly expected: unknown;
}

export interface GradeResult {
  readonly correct: boolean;
}

/**
 * The server half of a task type plugin (CLAUDE.md rule 10). The type's routes and services
 * live in `apps/api/src/task-types/<type>/`; shared code only talks to this interface.
 */
export interface TaskTypePlugin<C = unknown, S = unknown> {
  readonly contract: TaskTypeContract<C, S>;
  /** Checks one submission; types without automatic grading (chores) omit it. */
  grade?(input: GradeInput<C, S>): GradeResult;
  /** Type-specific conditions to start an attempt (e.g. enough of the video watched). */
  canStart(input: CanStartInput<C>): CanStartResult;
  /** Publish checks that need the server (media ready, enough questions in the bank). */
  publishChecks?(task: TaskRecord<C>, deps: TaskTypeDeps): string[];
  /** Builds the config of an imported lesson (FEAT-012 manifest, validated by the type). */
  fromImport?(manifest: unknown): C;
}

/** Built-in task types. Each type adds its line here. */
const BUILT_IN_TYPES: readonly TaskTypePlugin[] = [
  // add task type plugins here
];

export interface TaskTypeRegistry {
  get(type: string): TaskTypePlugin | undefined;
  list(): readonly TaskTypePlugin[];
  /** Adds a type to this runtime (built-ins are added on creation; tests add their own). */
  register(plugin: TaskTypePlugin): void;
}

/** A runtime's registry, holding the built-in types. */
export function createTaskTypeRegistry(): TaskTypeRegistry {
  const byType = new Map<string, TaskTypePlugin>();
  const registry: TaskTypeRegistry = {
    get: (type) => byType.get(type),
    list: () => [...byType.values()],
    register(plugin) {
      const type = plugin.contract.type;
      if (byType.has(type)) {
        throw new Error(`Task type registered twice: ${type}`);
      }
      byType.set(type, plugin);
    },
  };
  for (const plugin of BUILT_IN_TYPES) {
    registry.register(plugin);
  }
  return registry;
}

/** Accepts any start: for types without start conditions. */
export const alwaysStartable = (): CanStartResult => ({ ok: true });
