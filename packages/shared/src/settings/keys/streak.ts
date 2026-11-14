import { z } from 'zod';
import { defineSetting } from '../define';

/** Study streak (spec/01 §2.19, spec/02): a bonus for every N days in a row. */
export const streakSettings = {
  'streak.days': defineSetting({
    schema: z.number().int().min(2).max(60),
    default: 5,
    label: 'Серия занятий: дней подряд для бонуса',
    description: 'День засчитывается за любую завершённую попытку учебного задания.',
  }),
  'streak.rewardXp': defineSetting({
    schema: z.number().int().min(0).max(10_000),
    default: 200,
    label: 'Серия занятий: бонус XP',
  }),
  'streak.rewardCoins': defineSetting({
    schema: z.number().int().min(0).max(10_000),
    default: 200,
    label: 'Серия занятий: бонус монет',
  }),
};
