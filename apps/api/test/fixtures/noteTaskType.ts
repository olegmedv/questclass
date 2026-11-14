import { defineTaskType } from '@questclass/shared/tasks/contract';
import { z } from 'zod';
import { alwaysStartable, type TaskTypePlugin } from '../../src/task-types/registry';

/**
 * A minimal task type for tests of the generic task machinery: its config has a public part
 * (`text`) and a secret part (`answer`) that must never reach a learner.
 */
export const NOTE_TYPE = 'test_note';

const noteConfig = z.object({ text: z.string().max(200), answer: z.string().max(50) });
type NoteConfig = z.infer<typeof noteConfig>;

export const noteTaskType: TaskTypePlugin<NoteConfig, { answer: string }> = {
  contract: defineTaskType({
    type: NOTE_TYPE,
    label: 'Тестовая заметка',
    configSchema: noteConfig,
    submissionSchema: z.object({ answer: z.string() }),
    defaultConfig: () => ({ text: '', answer: '' }),
    publicConfig: (config) => ({ text: config.text }),
    canPublish: (task) => [
      ...(task.config.text === '' ? ['Нужен текст задания'] : []),
      ...(task.subjectId === null ? ['Выберите предмет'] : []),
    ],
  }),
  canStart: alwaysStartable,
  grade: ({ submission, expected }) => ({ correct: submission.answer === expected }),
};

/** Config of a task that passes the note type's publish checks. */
export const READY_NOTE: NoteConfig = { text: 'Сколько будет 2+2?', answer: '4' };
