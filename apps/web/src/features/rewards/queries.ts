// The learner's awards from the parent (`GET /api/me/awards`) and the journal of XP and coins
// (`GET /api/me/ledger`), page by page (newest first).
import type { LedgerEntryDto, LedgerPageDto } from '@questclass/shared/economy/dto';
import type { AwardPageDto } from '@questclass/shared/rewards/dto';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

/** «Показать ещё» loads this many more. */
export const REWARDS_PAGE = 20;

export const rewardKeys = {
  awards: ['me', 'awards'] as const,
  ledger: ['me', 'ledger'] as const,
};

const page = (path: string, cursor: string | null) =>
  `${path}?limit=${REWARDS_PAGE}${cursor ? `&cursor=${cursor}` : ''}`;

export function useMyAwards() {
  return useInfiniteQuery({
    queryKey: rewardKeys.awards,
    queryFn: ({ pageParam }) => api<AwardPageDto>(page('/api/me/awards', pageParam)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useMyLedger() {
  return useInfiniteQuery({
    queryKey: rewardKeys.ledger,
    queryFn: ({ pageParam }) => api<LedgerPageDto>(page('/api/me/ledger', pageParam)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** What a journal row was for, in the learner's words. */
export function ledgerLabel(
  entry: LedgerEntryDto,
  taskTitles: ReadonlyMap<string, string>,
): string {
  const note = entry.note ?? '';
  if (entry.reversesId !== null) return note || 'Отмена начисления';
  switch (entry.sourceType) {
    case 'task': {
      const title = entry.sourceId === null ? undefined : taskTitles.get(entry.sourceId);
      return title ? `${note || 'Награда за задание'}: ${title}` : note || 'Награда за задание';
    }
    case 'award':
      return note ? `От родителя: ${note}` : 'Награда от родителя';
    case 'chore':
      return note ? `Дело: ${note}` : 'Дело';
    case 'purchase':
      return note ? `Покупка: ${note}` : 'Покупка в магазине';
    case 'streak':
      return note || 'Серия занятий';
    case 'coins_reset':
      return note || 'Монеты обнулены';
  }
}

/** `2026-11-14` or an ISO time → «14.11.2026». */
export function dateText(value: string): string {
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (day && value.length === 10) return `${day[3]}.${day[2]}.${day[1]}`;
  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
