import { z } from 'zod';
import { OPTION_IDS } from '../../questions/schema';
import { defineTaskType } from '../../tasks/contract';

export const QUIZ_TYPE = 'quiz';

/** A quiz is its question bank (FEAT-054); the config itself has nothing to set yet. */
export const quizConfigSchema = z.object({});
export type QuizConfig = z.infer<typeof quizConfigSchema>;

/** One answer: an option of a question of the attempt. */
export const quizSubmissionSchema = z.object({ optionId: z.enum(OPTION_IDS) });
export type QuizSubmission = z.infer<typeof quizSubmissionSchema>;

export const quizContract = defineTaskType<QuizConfig, QuizSubmission>({
  type: QUIZ_TYPE,
  label: 'Тест',
  configSchema: quizConfigSchema,
  submissionSchema: quizSubmissionSchema,
  defaultConfig: () => ({}),
  publicConfig: () => ({}),
  // The bank size is checked on the server (it needs the database).
  canPublish: () => [],
});
