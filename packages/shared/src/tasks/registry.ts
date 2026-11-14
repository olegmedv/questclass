import { quizContract } from '../task-types/quiz/contract';
import { videoLessonContract } from '../task-types/video_lesson/contract';
import type { TaskTypeContract } from './contract';

/**
 * Contracts of all task types known to both api and web. Each type adds its line here
 * (quiz — FEAT-010, video_lesson — FEAT-013, chore — FEAT-014).
 */
export const TASK_TYPE_CONTRACTS: readonly TaskTypeContract[] = [
  quizContract,
  videoLessonContract,
  // add task types here
];

export function findTaskTypeContract(type: string): TaskTypeContract | undefined {
  return TASK_TYPE_CONTRACTS.find((contract) => contract.type === type);
}
