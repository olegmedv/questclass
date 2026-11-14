// Subjects, tasks and assignments as the admin manages them (FEAT-008 endpoints).
import type {
  SubjectCreateRequest,
  SubjectDto,
  SubjectUpdateRequest,
  TaskCreateRequest,
  TaskDto,
  TaskStatus,
  TaskUpdateRequest,
} from '@questclass/shared/tasks/dto';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

export const adminTaskKeys = {
  subjects: ['admin', 'subjects'] as const,
  tasks: ['admin', 'tasks'] as const,
  list: (filter: TaskFilter) => ['admin', 'tasks', 'list', filter] as const,
  one: (id: number) => ['admin', 'tasks', 'one', id] as const,
};

export interface TaskFilter {
  readonly subjectId?: number;
  readonly status?: TaskStatus;
  readonly type?: string;
}

/** Every subject, archived ones included. */
export function useAdminSubjects() {
  return useQuery({
    queryKey: adminTaskKeys.subjects,
    queryFn: () => api<SubjectDto[]>('/api/admin/subjects'),
  });
}

function refreshSubjects(client: QueryClient) {
  // Learner screens read `/api/subjects` under their own key.
  return Promise.all([
    client.invalidateQueries({ queryKey: adminTaskKeys.subjects }),
    client.invalidateQueries({ queryKey: ['subjects'] }),
  ]);
}

export function useCreateSubject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SubjectCreateRequest) =>
      api<SubjectDto>('/api/admin/subjects', { method: 'POST', json: input }),
    onSuccess: () => refreshSubjects(client),
  });
}

export function useUpdateSubject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: SubjectUpdateRequest }) =>
      api<SubjectDto>(`/api/admin/subjects/${id}`, { method: 'PATCH', json: patch }),
    onSuccess: () => refreshSubjects(client),
  });
}

export function useDeleteSubject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<undefined>(`/api/admin/subjects/${id}`, { method: 'DELETE' }),
    onSuccess: () => refreshSubjects(client),
  });
}

function query(filter: TaskFilter): string {
  const params = new URLSearchParams();
  if (filter.subjectId !== undefined) params.set('subjectId', String(filter.subjectId));
  if (filter.status) params.set('status', filter.status);
  if (filter.type) params.set('type', filter.type);
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function useAdminTasks(filter: TaskFilter = {}) {
  return useQuery({
    queryKey: adminTaskKeys.list(filter),
    queryFn: () => api<TaskDto[]>(`/api/admin/tasks${query(filter)}`),
  });
}

export function useAdminTask(id: number) {
  return useQuery({
    queryKey: adminTaskKeys.one(id),
    queryFn: () => api<TaskDto>(`/api/admin/tasks/${id}`),
  });
}

/** A changed task: its page gets the answer, every list is refetched. */
function taskChanged(client: QueryClient, task: TaskDto) {
  client.setQueryData(adminTaskKeys.one(task.id), task);
  return client.invalidateQueries({
    queryKey: adminTaskKeys.tasks,
    predicate: (q) => q.queryKey[2] !== 'one',
  });
}

export function useCreateTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskCreateRequest) =>
      api<TaskDto>('/api/admin/tasks', { method: 'POST', json: input }),
    onSuccess: (task) => taskChanged(client, task),
  });
}

export function useUpdateTask(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: TaskUpdateRequest) =>
      api<TaskDto>(`/api/admin/tasks/${id}`, { method: 'PATCH', json: patch }),
    onSuccess: (task) => taskChanged(client, task),
  });
}

export function useDeleteTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<undefined>(`/api/admin/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: adminTaskKeys.tasks }),
  });
}

/** Assigns the task to a learner or takes it back. */
export function useAssignment(taskId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ learnerId, assigned }: { learnerId: number; assigned: boolean }) => {
      if (assigned) {
        return api<TaskDto>(`/api/admin/tasks/${taskId}/assignments`, {
          method: 'POST',
          json: { learnerId },
        });
      }
      await api<undefined>(`/api/admin/tasks/${taskId}/assignments/${learnerId}`, {
        method: 'DELETE',
      });
      return api<TaskDto>(`/api/admin/tasks/${taskId}`);
    },
    onSuccess: (task) => taskChanged(client, task),
  });
}

export const TASK_STATUS_LABEL: Readonly<Record<TaskStatus, string>> = {
  draft: 'Черновик',
  published: 'Опубликовано',
  archived: 'В архиве',
};
