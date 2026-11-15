// The history of the installation: a learner's journal of XP and coins (FEAT-007) and the
// audit of admin actions (FEAT-006). Both newest first, a page at a time.
import type { LedgerPageDto, LedgerSourceType } from '@questclass/shared/economy/dto';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

/** One row of `GET /api/admin/audit`. */
export interface AuditRecordDto {
  readonly id: number;
  /** ISO 8601 */
  readonly at: string;
  readonly actorId: number | null;
  readonly action: string;
  readonly entity: string;
  readonly entityId: string | null;
  readonly learnerId: number | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface AuditPageDto {
  readonly items: AuditRecordDto[];
  readonly nextCursor: string | null;
}

/** Dates are calendar days in the browser's zone: `from` inclusive, `to` inclusive. */
export interface HistoryRange {
  readonly from: string;
  readonly to: string;
}

const PAGE = 30;

function rangeParams(params: URLSearchParams, range: HistoryRange) {
  if (range.from) params.set('from', new Date(`${range.from}T00:00:00`).toISOString());
  if (range.to) {
    const end = new Date(`${range.to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    params.set('to', end.toISOString());
  }
}

export interface LedgerFilter extends HistoryRange {
  readonly learnerId: number | null;
  readonly type: LedgerSourceType | '';
}

export function useLedgerHistory(filter: LedgerFilter) {
  return useInfiniteQuery({
    queryKey: ['admin', 'ledger', filter] as const,
    initialPageParam: null as string | null,
    enabled: filter.learnerId !== null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE) });
      if (filter.type) params.set('type', filter.type);
      rangeParams(params, filter);
      if (pageParam) params.set('cursor', pageParam);
      return api<LedgerPageDto>(`/api/admin/learners/${filter.learnerId}/ledger?${params}`);
    },
    getNextPageParam: (page) => page.nextCursor,
  });
}

export interface AuditFilter extends HistoryRange {
  readonly learnerId: number | null;
  readonly action: string;
}

export function useAuditHistory(filter: AuditFilter) {
  return useInfiniteQuery({
    queryKey: ['admin', 'audit', filter] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE) });
      if (filter.learnerId !== null) params.set('learnerId', String(filter.learnerId));
      if (filter.action) params.set('action', filter.action);
      rangeParams(params, filter);
      if (pageParam) params.set('cursor', pageParam);
      return api<AuditPageDto>(`/api/admin/audit?${params}`);
    },
    getNextPageParam: (page) => page.nextCursor,
  });
}
