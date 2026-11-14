// The learner's shop (`GET /api/shop`, `POST /api/shop/purchases`) and «Мои желания»
// (`GET /api/me/wishes`, `POST /api/me/wish-requests`).
import type { PurchaseOutcomeDto, PurchaseRequest, ShopDto } from '@questclass/shared/shop/dto';
import type { WishesDto, WishGroupDto } from '@questclass/shared/wishes/dto';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { api } from '../../api/client';
import { LIVE_REFRESH } from '../wallet/queries';

/** Under `me`: refreshed together with the wallet after rewards and purchases. */
export const shopKeys = {
  shop: ['me', 'shop'] as const,
  wishes: ['me', 'wishes'] as const,
  character: ['me', 'character'] as const,
};

export function useShop() {
  return useQuery({ queryKey: shopKeys.shop, queryFn: () => api<ShopDto>('/api/shop') });
}

export function usePurchase() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PurchaseRequest) =>
      api<PurchaseOutcomeDto>('/api/shop/purchases', { method: 'POST', json: input }),
    // Coins, the shop, the wardrobe and the wishes all change with a purchase.
    onSettled: () => client.invalidateQueries({ queryKey: ['me'] }),
  });
}

/** «Показать ещё» loads 20 more receipts. */
export const WISH_HISTORY_PAGE = 20;

const wishesPath = (cursor: string | null) =>
  `/api/me/wishes?limit=${WISH_HISTORY_PAGE}${cursor ? `&cursor=${cursor}` : ''}`;

/** Groups of tickets (from the first page) and the history, page by page. */
export function useMyWishes() {
  return useInfiniteQuery({
    queryKey: shopKeys.wishes,
    queryFn: ({ pageParam }) => api<WishesDto>(wishesPath(pageParam)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.history.nextCursor,
    ...LIVE_REFRESH,
  });
}

export function useWishRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (groupKey: string) =>
      api<WishGroupDto>('/api/me/wish-requests', { method: 'POST', json: { groupKey } }),
    onSuccess: (group) => {
      // The group turns «Просьба отправлена» at once; the history stays as it is.
      client.setQueryData<InfiniteData<WishesDto, string | null>>(shopKeys.wishes, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page, index) =>
                index === 0
                  ? {
                      ...page,
                      groups: page.groups.map((g) => (g.groupKey === group.groupKey ? group : g)),
                    }
                  : page,
              ),
            }
          : data,
      );
      void client.invalidateQueries({ queryKey: shopKeys.wishes });
    },
  });
}
