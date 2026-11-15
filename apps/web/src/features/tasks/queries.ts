// The learner's tasks, subjects and progress (FEAT-008, FEAT-009 endpoints).
import type { LearnerProgressDto } from '@questclass/shared/progress/dto';
import type { LearnerTaskDto, SubjectDto } from '@questclass/shared/tasks/dto';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { LIVE_REFRESH } from '../wallet/queries';

export const taskKeys = {
  progress: ['me', 'progress'] as const,
  all: ['tasks'] as const,
  list: ['tasks', 'list'] as const,
  one: (id: number) => ['tasks', 'one', id] as const,
  subjects: ['subjects'] as const,
};

export function useMyProgress() {
  return useQuery({
    queryKey: taskKeys.progress,
    queryFn: () => api<LearnerProgressDto>('/api/me/progress'),
    ...LIVE_REFRESH,
  });
}

export function useLearnerTasks() {
  return useQuery({
    queryKey: taskKeys.list,
    queryFn: () => api<LearnerTaskDto[]>('/api/tasks'),
    ...LIVE_REFRESH,
  });
}

export function useLearnerTask(id: number) {
  return useQuery({
    queryKey: taskKeys.one(id),
    queryFn: () => api<LearnerTaskDto>(`/api/tasks/${id}`),
  });
}

export function useSubjects() {
  return useQuery({
    queryKey: taskKeys.subjects,
    queryFn: () => api<SubjectDto[]>('/api/subjects'),
    staleTime: 5 * 60_000,
  });
}

/** After a result (attempt finished, video watched): numbers, streak and progress change. */
export function refreshLearnerData(client: QueryClient): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['me'] }),
    client.invalidateQueries({ queryKey: taskKeys.all }),
  ]).then(() => undefined);
}
