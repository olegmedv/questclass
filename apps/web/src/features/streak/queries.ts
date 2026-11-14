// The learner's study streak (`GET /api/me/streak`).
import type { StreakDto } from '@questclass/shared/progress/dto';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { LIVE_REFRESH } from '../wallet/queries';

export const streakKeys = { streak: ['me', 'streak'] as const };

export function useStreak() {
  return useQuery({
    queryKey: streakKeys.streak,
    queryFn: () => api<StreakDto>('/api/me/streak'),
    ...LIVE_REFRESH,
  });
}
