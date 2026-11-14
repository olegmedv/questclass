// The learner's balance and level (`GET /api/me/wallet`) for the header of every learner screen.
import type { WalletDto } from '@questclass/shared/economy/dto';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

/** Everything under `me` is the signed-in learner's own data (refreshed together). */
export const walletKeys = { wallet: ['me', 'wallet'] as const };

/** Refreshed every minute and when the tab comes back, as on the original's home. */
export const LIVE_REFRESH = { refetchInterval: 60_000, refetchOnWindowFocus: true } as const;

export function useWallet() {
  return useQuery({
    queryKey: walletKeys.wallet,
    queryFn: () => api<WalletDto>('/api/me/wallet'),
    ...LIVE_REFRESH,
  });
}
