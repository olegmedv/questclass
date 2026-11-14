import { z } from 'zod';
import { UNLOCK_MODES, type UnlockMode } from '../../progress/dto';
import { subjectKeySchema } from '../../tasks/dto';
import { defineSetting } from '../define';

/** How tasks open for learners (spec/01 §2.7–2.8; user decision 14.11.2026). */
export const progressSettings = {
  'progress.unlockMode': defineSetting<UnlockMode>({
    schema: z.enum(UNLOCK_MODES),
    default: 'rotation',
    label: 'Как открываются задания',
    description:
      'По кругу предметов (после зачёта — следующий предмет), по порядку внутри предмета или все сразу. Назначенные ученику задания открыты всегда и идут первыми.',
  }),
  'progress.rotationSubjects': defineSetting<string[]>({
    schema: z
      .array(subjectKeySchema)
      .min(1)
      .max(12)
      .refine((keys) => new Set(keys).size === keys.length, 'Предметы в круге повторяются'),
    default: ['russian', 'math', 'world', 'reading'],
    label: 'Круг предметов',
    description:
      'Ключи предметов по порядку. Остальные предметы (ИЗО, труд…) открываются по порядку или по назначению.',
  }),
};
