// Counters of the admin's queues for the home «Что нужно сделать?» (FEAT-055).
import type { AdminInboxDto } from '@questclass/shared/inbox/dto';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

export const inboxKey = ['admin', 'inbox'] as const;

export function useAdminInbox() {
  return useQuery({
    queryKey: inboxKey,
    queryFn: () => api<AdminInboxDto>('/api/admin/inbox'),
    // Learners keep reporting chores and asking for wishes while the parent looks.
    refetchInterval: 60_000,
  });
}
