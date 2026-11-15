import { z } from 'zod';
import { defineTaskType } from '../../tasks/contract';

export const CHORE_TYPE = 'chore';

/**
 * How often a chore can be done for a reward: once ever, once a day or once a week (days and
 * weeks follow the installation time zone).
 */
export const CHORE_REPEATS = ['once', 'daily', 'weekly'] as const;
export type ChoreRepeat = (typeof CHORE_REPEATS)[number];

export const choreConfigSchema = z.object({ repeat: z.enum(CHORE_REPEATS) });
export type ChoreConfig = z.infer<typeof choreConfigSchema>;

/** «Я сделал»: the learner reports the deed; an admin approves or rejects it. */
export const choreSubmissionSchema = z.object({});
export type ChoreSubmission = z.infer<typeof choreSubmissionSchema>;

export const choreContract = defineTaskType<ChoreConfig, ChoreSubmission>({
  type: CHORE_TYPE,
  label: 'Дело',
  configSchema: choreConfigSchema,
  submissionSchema: choreSubmissionSchema,
  defaultConfig: () => ({ repeat: 'once' }),
  publicConfig: (config) => ({ repeat: config.repeat }),
  canPublish: () => [],
});
