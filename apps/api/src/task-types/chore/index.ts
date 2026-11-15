import {
  choreContract,
  type ChoreConfig,
  type ChoreSubmission,
} from '@questclass/shared/task-types/chore/contract';
// Types only: the registry imports this module.
import type { TaskTypePlugin } from '../registry';

/**
 * `chore`: a real-life deed. No automatic grading (the attempts engine refuses it with
 * `no_questions`); the learner reports it and an admin approves or rejects the report
 * (`service.ts`, `routes.ts`).
 */
export const choreTaskType: TaskTypePlugin<ChoreConfig, ChoreSubmission> = {
  contract: choreContract,
  // Reports are checked by the chores service (visibility, availability, period).
  canStart: () => ({ ok: true }),
};
