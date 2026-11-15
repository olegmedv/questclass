import { z } from 'zod';
import { defineSetting } from '../define';

/** Keeping lesson videos on the server (SPEC §1, §8 `video_retention_days`). */
export const videoSettings = {
  'video.retentionDays': defineSetting({
    schema: z.number().int().min(1).max(3650),
    default: 30,
    label: 'Видео: через сколько дней после прохождения удалять',
    description:
      'Видео урока удаляется, когда все, кому он назначен, прошли или закрыли его столько дней назад. Вопросы и расшифровка остаются, тест проходится без просмотра.',
  }),
};
