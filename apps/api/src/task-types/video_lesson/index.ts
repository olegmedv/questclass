import {
  videoLessonConfigSchema,
  videoLessonContract,
  type VideoLessonConfig,
  type VideoLessonSubmission,
} from '@questclass/shared/task-types/video_lesson/contract';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { media } from '../../db/schema/media';
import { activeQuestionCount } from '../quiz';
// Types only: the registry imports this module.
import type { TaskTypePlugin } from '../registry';
import { canStartVideoLesson } from './canStart';

/**
 * What the import module passes to `fromImport`: the lesson manifest (FEAT-012) together with
 * the media it created for the video and, on a re-import, the task's current config.
 */
const importInputSchema = z.object({
  mediaId: z.number().int().positive(),
  current: z.unknown().optional(),
});

/**
 * `video_lesson`: a video watched by the lesson's rule, then N random questions of the bank
 * (graded by the attempts engine exactly like a quiz).
 */
export const videoLessonTaskType: TaskTypePlugin<VideoLessonConfig, VideoLessonSubmission> = {
  contract: videoLessonContract,
  grade: ({ submission, expected }) => ({ correct: submission.optionId === expected }),
  canStart: canStartVideoLesson,
  publishChecks(task, { db, settings }) {
    const errors: string[] = [];
    const { mediaId } = task.config;
    if (mediaId !== null) {
      const row = db.select().from(media).where(eq(media.id, mediaId)).get();
      if (!row || row.taskId !== task.id || row.kind === 'image') {
        errors.push('Видео урока не найдено');
      } else if (row.status !== 'ready') {
        errors.push('Видео ещё не загружено до конца');
      }
    }
    const needed = settings.get('quiz.questionsPerAttempt');
    const have = activeQuestionCount(db, task.id);
    if (have < needed) {
      errors.push(`Нужно не меньше ${needed} вопросов в банке (сейчас ${have})`);
    }
    return errors;
  },
  /** A new video replaces the old one; the admin's watch settings of the lesson are kept. */
  fromImport(input) {
    const { mediaId, current } = importInputSchema.parse(input);
    const kept = videoLessonConfigSchema.safeParse(current);
    const base = kept.success ? kept.data : videoLessonContract.defaultConfig();
    return { ...base, mediaId };
  },
};
