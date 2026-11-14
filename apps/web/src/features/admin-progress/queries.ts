// A learner's progress and the admin's hand on it (FEAT-009, FEAT-010, FEAT-014 endpoints):
// close, reopen, reset, coins reset, attempts, retries, chore reviews.
import type {
  AdminAttemptDto,
  AttemptSummaryDto,
  RetryGrantDto,
  RetryRequestDto,
  RetryRequestStatus,
} from '@questclass/shared/attempts/dto';
import type { LedgerEntryDto } from '@questclass/shared/economy/dto';
import type {
  ClosureRequest,
  LearnerProgressDto,
  StreakDto,
  TaskProgressDto,
} from '@questclass/shared/progress/dto';
import type {
  ChoreCompletionDto,
  ChoreCompletionStatus,
} from '@questclass/shared/task-types/chore/dto';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

export const progressKeys = {
  all: ['admin', 'progress'] as const,
  learner: (id: number) => ['admin', 'progress', 'learner', id] as const,
  streak: (id: number) => ['admin', 'progress', 'streak', id] as const,
  attempts: (id: number, taskId: number | null) =>
    ['admin', 'progress', 'attempts', id, taskId] as const,
  attempt: (id: number) => ['admin', 'progress', 'attempt', id] as const,
  retryRequests: (status: RetryRequestStatus) =>
    ['admin', 'progress', 'retry-requests', status] as const,
  chores: (status: ChoreCompletionStatus) => ['admin', 'progress', 'chores', status] as const,
};

/** Anything the admin does to progress may change every view of it (and the inbox). */
export function refreshProgress(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: progressKeys.all }),
    client.invalidateQueries({ queryKey: ['admin', 'inbox'] }),
    client.invalidateQueries({ queryKey: ['admin', 'ledger'] }),
  ]);
}

export function useLearnerProgress(learnerId: number | null) {
  return useQuery({
    queryKey: progressKeys.learner(learnerId ?? 0),
    queryFn: () => api<LearnerProgressDto>(`/api/admin/learners/${learnerId}/progress`),
    enabled: learnerId !== null,
  });
}

export function useLearnerStreak(learnerId: number | null) {
  return useQuery({
    queryKey: progressKeys.streak(learnerId ?? 0),
    queryFn: () => api<StreakDto>(`/api/admin/learners/${learnerId}/streak`),
    enabled: learnerId !== null,
  });
}

export function useCloseTask(learnerId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, input }: { taskId: number; input: ClosureRequest }) =>
      api<{ progress: TaskProgressDto; reward: { xp: number; coins: number } }>(
        `/api/admin/learners/${learnerId}/progress/${taskId}/closure`,
        { method: 'POST', json: input },
      ),
    onSuccess: () => refreshProgress(client),
  });
}

export function useReopenTask(learnerId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (taskId: number) =>
      api<TaskProgressDto>(`/api/admin/learners/${learnerId}/progress/${taskId}/reopening`, {
        method: 'POST',
      }),
    onSuccess: () => refreshProgress(client),
  });
}

/** One task (`taskId`) or everything; `requestId` makes a repeated click harmless. */
export function useResetProgress(learnerId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { taskId?: number; requestId: string }) =>
      api<{ created: boolean }>(`/api/admin/learners/${learnerId}/progress-resets`, {
        method: 'POST',
        json: input,
      }),
    onSuccess: () => refreshProgress(client),
  });
}

export function useResetCoins(learnerId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) =>
      api<LedgerEntryDto>(`/api/admin/learners/${learnerId}/coins-resets`, {
        method: 'POST',
        json: { requestId },
      }),
    onSuccess: () => refreshProgress(client),
  });
}

export function useLearnerAttempts(learnerId: number | null, taskId: number | null = null) {
  return useQuery({
    queryKey: progressKeys.attempts(learnerId ?? 0, taskId),
    queryFn: () =>
      api<AttemptSummaryDto[]>(
        `/api/admin/learners/${learnerId}/attempts${taskId === null ? '' : `?taskId=${taskId}`}`,
      ),
    enabled: learnerId !== null,
  });
}

export function useAdminAttempt(id: number) {
  return useQuery({
    queryKey: progressKeys.attempt(id),
    queryFn: () => api<AdminAttemptDto>(`/api/admin/attempts/${id}`),
  });
}

export function useRetryRequests(status: RetryRequestStatus = 'open') {
  return useQuery({
    queryKey: progressKeys.retryRequests(status),
    queryFn: () => api<RetryRequestDto[]>(`/api/admin/retry-requests?status=${status}`),
  });
}

export function useGrantRetry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { learnerId: number; taskId: number }) =>
      api<RetryGrantDto>('/api/admin/retry-grants', { method: 'POST', json: input }),
    onSuccess: () => refreshProgress(client),
  });
}

export function useChoreReviews(status: ChoreCompletionStatus = 'pending') {
  return useQuery({
    queryKey: progressKeys.chores(status),
    queryFn: () => api<ChoreCompletionDto[]>(`/api/admin/chores/reviews?status=${status}`),
  });
}

export function useApproveChore() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api<ChoreCompletionDto>(`/api/admin/chores/reviews/${id}/approval`, { method: 'POST' }),
    onSuccess: () => refreshProgress(client),
  });
}

export function useRejectChore() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comment }: { id: number; comment: string }) =>
      api<ChoreCompletionDto>(`/api/admin/chores/reviews/${id}/rejection`, {
        method: 'POST',
        json: comment.trim() === '' ? {} : { comment },
      }),
    onSuccess: () => refreshProgress(client),
  });
}
