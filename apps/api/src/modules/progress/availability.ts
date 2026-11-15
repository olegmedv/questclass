/**
 * Which tasks a learner may open and which one to suggest next. Pure: computed from facts on
 * every read, nothing is stored (CLAUDE.md rule 2).
 *
 * - Assigned tasks are always open and come first in "next" (in assignment order).
 * - `all`: every visible task is open.
 * - `sequential`: inside a subject, a task opens when all earlier ones are done.
 * - `rotation`: the rotation subjects take turns (russian → math → world → reading by default):
 *   after a task of one is done, the next subject's first undone task opens. Earlier skipped
 *   tasks of a rotation subject stay open. Other subjects (art, craft…) are sequential.
 *
 * Started or done tasks never close again, and tasks without a subject (chores) are always open
 * but only suggested when assigned.
 */
import type { LockReason, UnlockMode } from '@questclass/shared/progress/dto';

export interface AvailabilityTask {
  readonly id: number;
  /** Null for tasks without a subject. */
  readonly subjectKey: string | null;
  /** Position in the learner's assignment queue; null = not assigned to them. */
  readonly assignmentPosition: number | null;
}

export interface TaskFacts {
  /** Done (passed or closed) since the last reset. */
  readonly completed: boolean;
  /** Touched since the last reset (an attempt or a watch started). */
  readonly started: boolean;
  /** Epoch ms of the latest completion. */
  readonly completedAt: number | null;
}

export interface AvailabilityInput {
  readonly mode: UnlockMode;
  readonly rotationSubjects: readonly string[];
  /** Visible tasks in display order (subject order, then task order). */
  readonly tasks: readonly AvailabilityTask[];
  readonly facts: ReadonlyMap<number, TaskFacts>;
}

export interface TaskAvailability {
  readonly available: boolean;
  readonly lockReason: LockReason | null;
}

export interface AvailabilityResult {
  readonly byTask: ReadonlyMap<number, TaskAvailability>;
  readonly nextTaskId: number | null;
}

const NO_FACTS: TaskFacts = { completed: false, started: false, completedAt: null };
const OPEN: TaskAvailability = { available: true, lockReason: null };

function groupBySubject(tasks: readonly AvailabilityTask[]): Map<string, AvailabilityTask[]> {
  const groups = new Map<string, AvailabilityTask[]>();
  for (const task of tasks) {
    if (task.subjectKey !== null) {
      groups.set(task.subjectKey, [...(groups.get(task.subjectKey) ?? []), task]);
    }
  }
  return groups;
}

export function computeAvailability(input: AvailabilityInput): AvailabilityResult {
  const factsOf = (task: AvailabilityTask): TaskFacts => input.facts.get(task.id) ?? NO_FACTS;
  const done = (task: AvailabilityTask): boolean => factsOf(task).completed;
  const groups = groupBySubject(input.tasks);
  const rotation =
    input.mode === 'rotation' ? input.rotationSubjects.filter((key) => groups.has(key)) : [];
  const inRotation = new Set(rotation);

  const byTask = new Map<number, TaskAvailability>();
  const decide = (task: AvailabilityTask, open: boolean, reason: LockReason): void => {
    const facts = factsOf(task);
    const always = facts.completed || facts.started || task.assignmentPosition !== null;
    byTask.set(task.id, always || open ? OPEN : { available: false, lockReason: reason });
  };

  // Sequential subjects (every subject in `sequential` mode, the others in `rotation` mode).
  for (const [key, list] of groups) {
    if (inRotation.has(key)) {
      continue;
    }
    let previousDone = true;
    for (const task of list) {
      decide(task, input.mode === 'all' || previousDone, 'previous');
      previousDone &&= done(task);
    }
  }

  // Rotation: the subject after the most recently completed rotation task takes its turn.
  let rotationNext: AvailabilityTask | null = null;
  if (rotation.length > 0) {
    let lastKey: string | null = null;
    let lastAt = -Infinity;
    for (const key of rotation) {
      for (const task of groups.get(key) ?? []) {
        const at = factsOf(task).completedAt;
        if (at !== null && at > lastAt) {
          lastAt = at;
          lastKey = key;
        }
      }
    }
    const start = lastKey === null ? 0 : (rotation.indexOf(lastKey) + 1) % rotation.length;
    for (let step = 0; step < rotation.length && rotationNext === null; step += 1) {
      const list = groups.get(rotation[(start + step) % rotation.length] ?? '') ?? [];
      const furthest = list.findLastIndex(done);
      rotationNext = list.slice(furthest + 1).find((task) => !done(task)) ?? null;
    }
    for (const key of rotation) {
      const list = groups.get(key) ?? [];
      const furthest = list.findLastIndex(done);
      list.forEach((task, index) => {
        decide(task, task === rotationNext || index < furthest, 'rotation');
      });
    }
  }

  // Tasks without a subject.
  for (const task of input.tasks) {
    if (task.subjectKey === null) {
      byTask.set(task.id, OPEN);
    }
  }

  const openAndUndone = (task: AvailabilityTask): boolean =>
    !done(task) && byTask.get(task.id)?.available === true;
  const assigned = input.tasks
    .filter((task) => task.assignmentPosition !== null && openAndUndone(task))
    .sort((a, b) => (a.assignmentPosition ?? 0) - (b.assignmentPosition ?? 0));
  const fallback = input.tasks.find(
    (task) => task.subjectKey !== null && !inRotation.has(task.subjectKey) && openAndUndone(task),
  );
  const next = assigned[0] ?? rotationNext ?? fallback ?? null;
  return { byTask, nextTaskId: next?.id ?? null };
}
