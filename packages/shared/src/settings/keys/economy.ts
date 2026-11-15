import { z } from 'zod';
import { defineSetting } from '../define';

/** Economy numbers (spec/02 §2.1–2.2): level size and the default reward of a new task. */
export const economySettings = {
  'economy.xpPerLevel': defineSetting({
    schema: z.number().int().min(10).max(100_000),
    default: 300,
    label: 'Опыт (XP) на один уровень',
  }),
  'economy.defaultTaskXp': defineSetting({
    schema: z.number().int().min(1).max(1000),
    default: 100,
    label: 'XP за задание по умолчанию',
    description: 'Подставляется в новое задание; у каждого задания можно поменять.',
  }),
  'economy.defaultTaskCoins': defineSetting({
    schema: z.number().int().min(0).max(1000),
    default: 350,
    label: 'Монеты за задание по умолчанию',
    description: 'Подставляется в новое задание; у каждого задания можно поменять.',
  }),
};
