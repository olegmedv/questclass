import { z } from 'zod';
import { defineSetting } from '../define';

/**
 * Tests (user decision 14.11.2026): 3 random questions, a pass needs 2 correct, one free retry
 * after a fail; further tries only with the admin's permission. If `quiz.minCorrect` is set
 * above `quiz.questionsPerAttempt`, a pass needs every question right.
 */
export const quizSettings = {
  'quiz.questionsPerAttempt': defineSetting({
    schema: z.number().int().min(1).max(20),
    default: 3,
    label: 'Тест: вопросов в попытке',
    description: 'Случайные вопросы из банка задания.',
  }),
  'quiz.minCorrect': defineSetting({
    schema: z.number().int().min(1).max(20),
    default: 2,
    label: 'Тест: верных ответов для зачёта',
    description: 'Награда пропорциональна доле верных ответов.',
  }),
  'quiz.autoRetries': defineSetting({
    schema: z.number().int().min(0).max(10),
    default: 1,
    label: 'Тест: бесплатных пересдач после провала',
    description: 'Дальше пересдачу разрешает админ по просьбе ученика.',
  }),
};
