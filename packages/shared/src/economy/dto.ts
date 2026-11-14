import { z } from 'zod';
import type { LevelProgress } from './level';

/**
 * What produced a ledger row. A reversal keeps the source of the row it compensates, so the
 * net amount paid for one source is always the sum of its rows.
 */
export const LEDGER_SOURCE_TYPES = [
  /** Reward for a task (first pass, admin close, top-up after a better result). */
  'task',
  /** Reward for a streak of study days. */
  'streak',
  /** Manual award by an admin (reason or custom). */
  'award',
  /** Approved real-life chore. */
  'chore',
  /** Shop purchase (negative coins). */
  'purchase',
  /** "Обнулить монеты": one compensating row that brings coins to zero. */
  'coins_reset',
] as const;
export type LedgerSourceType = (typeof LEDGER_SOURCE_TYPES)[number];

/**
 * Client-generated id of one user intent (e.g. a uuid created when a dialog opens). It is only
 * ever a part of a server-built idempotency key, so it may not contain the key separator.
 */
export const requestIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, 'requestId: 8–64 символа, латиница, цифры, _ и -');

/** Balance and level of a learner (`GET /api/me/wallet`). */
export interface WalletDto extends LevelProgress {
  readonly xp: number;
  readonly coins: number;
}

export interface LedgerEntryDto {
  readonly id: number;
  /** ISO 8601 */
  readonly at: string;
  readonly xp: number;
  readonly coins: number;
  readonly sourceType: LedgerSourceType;
  readonly sourceId: string | null;
  readonly note: string | null;
  /** Set on a compensating row: the row it cancels. */
  readonly reversesId: number | null;
  /** Set on a cancelled row: the compensating row. */
  readonly reversedById: number | null;
  readonly createdBy: number | null;
}

/** Newest first; pass `nextCursor` back as `cursor` for the next page. */
export interface LedgerPageDto {
  readonly items: LedgerEntryDto[];
  readonly nextCursor: string | null;
}
