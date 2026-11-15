import { z } from 'zod';
import { defineSetting } from '../define';
import { MAX_WATCH_PERCENT, MIN_WATCH_PERCENT } from '../../task-types/video_lesson/contract';

/** Watching of lesson videos (FEAT-013). A lesson may override the threshold in its config. */
export const watchSettings = {
  'watch.minPercent': defineSetting({
    schema: z.number().int().min(MIN_WATCH_PERCENT).max(MAX_WATCH_PERCENT),
    default: 70,
    label: 'Видео: сколько процентов нужно посмотреть',
    description:
      'Для уроков в режиме «по проценту» без своего порога. Считаются только уникальные просмотренные секунды.',
  }),
  'watch.maxRate': defineSetting({
    schema: z.number().min(1).max(4),
    default: 1.25,
    label: 'Видео: насколько зачёт может обгонять реальное время',
    description:
      'За пачку засчитывается не больше, чем прошло времени с прошлой пачки, умноженного на это число.',
  }),
};
