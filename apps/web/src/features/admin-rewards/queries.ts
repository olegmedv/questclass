// Reward reasons and manual awards «От родителя» (FEAT-016 endpoints).
import type {
  AwardCreateRequest,
  AwardDto,
  AwardPageDto,
  RewardReasonCreateRequest,
  RewardReasonDto,
  RewardReasonUpdateRequest,
} from '@questclass/shared/rewards/dto';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { api } from '../../api/client';

export const rewardKeys = {
  reasons: ['admin', 'reward-reasons'] as const,
  awards: (learnerId: number) => ['admin', 'awards', learnerId] as const,
};

/** Every reason, archived ones included. */
export function useRewardReasons() {
  return useQuery({
    queryKey: rewardKeys.reasons,
    queryFn: () => api<RewardReasonDto[]>('/api/admin/reward-reasons'),
  });
}

export function useCreateReason() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RewardReasonCreateRequest) =>
      api<RewardReasonDto>('/api/admin/reward-reasons', { method: 'POST', json: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: rewardKeys.reasons }),
  });
}

export function useUpdateReason() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: RewardReasonUpdateRequest }) =>
      api<RewardReasonDto>(`/api/admin/reward-reasons/${id}`, { method: 'PATCH', json: patch }),
    onSuccess: () => client.invalidateQueries({ queryKey: rewardKeys.reasons }),
  });
}

const PAGE = 20;

/** Newest first, 20 at a time («Показать ещё»). */
export function useAwards(learnerId: number) {
  return useInfiniteQuery({
    queryKey: rewardKeys.awards(learnerId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<AwardPageDto>(
        `/api/admin/learners/${learnerId}/awards?limit=${PAGE}${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    getNextPageParam: (page) => page.nextCursor,
  });
}

function awardsChanged(client: QueryClient, learnerId: number) {
  return Promise.all([
    client.invalidateQueries({ queryKey: rewardKeys.awards(learnerId) }),
    client.invalidateQueries({ queryKey: ['admin', 'ledger'] }),
  ]);
}

export function useGrantAward(learnerId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AwardCreateRequest) =>
      api<AwardDto>(`/api/admin/learners/${learnerId}/awards`, { method: 'POST', json: input }),
    onSuccess: () => awardsChanged(client, learnerId),
  });
}

/** Cancelling adds a compensating ledger row; the award stays, marked «Отменено». */
export function useCancelAward(learnerId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (awardId: number) =>
      api<AwardDto>(`/api/admin/learners/${learnerId}/awards/${awardId}/cancellation`, {
        method: 'POST',
      }),
    onSuccess: () => awardsChanged(client, learnerId),
  });
}
