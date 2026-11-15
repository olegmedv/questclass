import type {
  LedgerEntryDto,
  LedgerPageDto,
  LedgerSourceType,
  WalletDto,
} from '@questclass/shared/economy/dto';
import { requestIdSchema } from '@questclass/shared/economy/dto';
import { levelProgress } from '@questclass/shared/economy/level';
import type { Db } from '../../db/client';
import type { LedgerRow } from '../../db/schema/ledger';
import { HttpError, conflict, notFound } from '../../http/errors';
import type { SettingsService } from '../settings/service';
import { createLedgerRepo, type LedgerRowView, type Totals } from './repo';

declare const idemKeyBrand: unique symbol;

/** An idempotency key built on the server; `post()` accepts nothing else. */
export type IdemKey = string & { readonly [idemKeyBrand]: true };

const KEY_SEPARATOR = ':';
const KEY_PART = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * Builds an idempotency key from fixed parts, e.g. `idemKey('task', 7, 'learner', 3, 'pass')`
 * → `task:7:learner:3:pass`. Parts may not contain the separator, so keys of different
 * sources can never collide.
 */
export function idemKey(...parts: readonly (string | number)[]): IdemKey {
  if (parts.length < 2) {
    throw new Error('An idempotency key needs a source prefix and at least one more part');
  }
  const text = parts.map(String);
  for (const part of text) {
    if (!KEY_PART.test(part)) {
      throw new Error(`Invalid idempotency key part: ${JSON.stringify(part)}`);
    }
  }
  return text.join(KEY_SEPARATOR) as IdemKey;
}

/**
 * Key for an intent the client identified by its own `requestId`
 * (`<source>:<learner>:<requestId>`, e.g. `award:3:5f0c…`). The request id is only the last
 * part: it cannot reach another learner's or another source's keys.
 */
export function requestKey(source: string, learnerId: number, requestId: string): IdemKey {
  const parsed = requestIdSchema.safeParse(requestId);
  if (!parsed.success) {
    throw new HttpError(400, 'validation_failed', 'Некорректный requestId');
  }
  return idemKey(source, learnerId, parsed.data);
}

export interface LedgerEntryInput {
  readonly learnerId: number;
  readonly xp?: number;
  readonly coins?: number;
  readonly sourceType: LedgerSourceType;
  readonly sourceId?: string | number | null;
  readonly idemKey: IdemKey;
  readonly note?: string | null;
  /** Admin who caused the entry; null/omitted for the system. */
  readonly createdBy?: number | null;
  /** Effective time, epoch ms (default: now). */
  readonly at?: number;
}

export interface SpendInput extends Omit<LedgerEntryInput, 'xp' | 'coins'> {
  /** Coins to take, ≥ 0. */
  readonly price: number;
}

export interface ReverseOptions {
  readonly createdBy: number | null;
  readonly note?: string | null;
  /** When given, the row must belong to this learner (otherwise 404). */
  readonly learnerId?: number;
}

export interface PostResult {
  readonly entry: LedgerEntryDto;
  /** False when the key already existed and the earlier row was returned. */
  readonly created: boolean;
}

export interface LedgerQuery {
  readonly type?: LedgerSourceType;
  readonly from?: number;
  readonly to?: number;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface LedgerService {
  /**
   * Appends one row. Idempotent by key: a repeated key returns the existing row unchanged
   * (`created: false`). Safe to call inside the caller's transaction.
   */
  post(input: LedgerEntryInput): PostResult;
  /**
   * Takes coins for a purchase. Refused with 409 `insufficient_coins` when the balance is below
   * the price or negative (a negative balance blocks every purchase, even a free one).
   */
  spend(input: SpendInput): PostResult;
  /** Appends the compensating row for `id`. A row can be reversed once (409 afterwards). */
  reverse(id: number, options: ReverseOptions): PostResult;
  balance(learnerId: number): Totals;
  /** Net amount a learner got from one source (reversals included). */
  sourceTotals(learnerId: number, sourceType: LedgerSourceType, sourceId: string | number): Totals;
  /** Whether any row refers to the source (history check before deleting it). */
  hasSource(sourceType: LedgerSourceType, sourceId: string | number): boolean;
  wallet(learnerId: number): WalletDto;
  list(learnerId: number, query?: LedgerQuery): LedgerPageDto;
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
export const CURSOR_PATTERN = /^\d+_\d+$/;
/** Guards against overflow and typos; real amounts are hundreds. */
const MAX_AMOUNT = 1_000_000_000;

const insufficientCoins = (balance: number, price: number) =>
  conflict('insufficient_coins', 'Пока не хватает монет', {
    balance,
    price,
    missing: Math.max(0, price - balance),
  });

function checkAmount(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_AMOUNT) {
    throw new Error(`Ledger ${name} must be an integer within ±${MAX_AMOUNT}, got ${value}`);
  }
  return value;
}

function toDto(row: LedgerRowView): LedgerEntryDto {
  return {
    id: row.id,
    at: new Date(row.at).toISOString(),
    xp: row.xp,
    coins: row.coins,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    note: row.note,
    reversesId: row.reversesId,
    reversedById: row.reversedById,
    createdBy: row.createdBy,
  };
}

function decodeCursor(cursor: string): { at: number; id: number } {
  if (!CURSOR_PATTERN.test(cursor)) {
    throw new Error(`Invalid ledger cursor: ${cursor}`);
  }
  const [at = '0', id = '0'] = cursor.split('_');
  return { at: Number(at), id: Number(id) };
}

const sourceIdText = (id: string | number | null | undefined): string | null =>
  id === null || id === undefined ? null : String(id);

export interface LedgerDeps {
  readonly settings: SettingsService;
  readonly clock?: () => number;
}

export function createLedgerService(db: Db, deps: LedgerDeps): LedgerService {
  const { settings, clock = Date.now } = deps;
  const repo = createLedgerRepo(db);

  const viewOf = (row: LedgerRow): LedgerEntryDto =>
    toDto(repo.view(row.id) ?? { ...row, reversedById: null });

  /** The earlier row for a repeated key; it must describe the same learner and source. */
  const existing = (input: LedgerEntryInput): PostResult | null => {
    const row = repo.findByKey(input.idemKey);
    if (!row) {
      return null;
    }
    if (
      row.learnerId !== input.learnerId ||
      row.sourceType !== input.sourceType ||
      row.sourceId !== sourceIdText(input.sourceId)
    ) {
      throw conflict('idempotency_conflict', 'Этот ключ уже использован для другой операции');
    }
    return { entry: viewOf(row), created: false };
  };

  const insert = (input: LedgerEntryInput, xp: number, coins: number, reversesId?: number) =>
    repo.insert({
      learnerId: input.learnerId,
      at: input.at ?? clock(),
      xp: checkAmount('xp', xp),
      coins: checkAmount('coins', coins),
      sourceType: input.sourceType,
      sourceId: sourceIdText(input.sourceId),
      idemKey: input.idemKey,
      reversesId: reversesId ?? null,
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
    });

  return {
    post(input) {
      return db.transaction(() => {
        const earlier = existing(input);
        if (earlier) {
          return earlier;
        }
        const row = insert(input, input.xp ?? 0, input.coins ?? 0);
        return { entry: viewOf(row), created: true };
      });
    },

    spend(input) {
      const price = checkAmount('price', input.price);
      if (price < 0) {
        throw new Error(`Price must not be negative, got ${price}`);
      }
      return db.transaction(() => {
        const earlier = existing(input);
        if (earlier) {
          return earlier;
        }
        const { coins } = repo.totals(input.learnerId);
        if (coins < 0 || coins < price) {
          throw insufficientCoins(coins, price);
        }
        const row = insert(input, 0, -price);
        return { entry: viewOf(row), created: true };
      });
    },

    reverse(id, options) {
      return db.transaction(() => {
        const original = repo.findById(id);
        if (
          !original ||
          (options.learnerId !== undefined && original.learnerId !== options.learnerId)
        ) {
          throw notFound('Запись журнала не найдена');
        }
        if (original.reversesId !== null) {
          throw conflict('cannot_reverse_reversal', 'Это уже отмена; её нельзя отменить');
        }
        if (repo.findReversalOf(id)) {
          throw conflict('already_reversed', 'Эта запись уже отменена');
        }
        const row = insert(
          {
            learnerId: original.learnerId,
            sourceType: original.sourceType,
            sourceId: original.sourceId,
            idemKey: idemKey('reversal', id),
            note: options.note ?? null,
            createdBy: options.createdBy,
          },
          -original.xp,
          -original.coins,
          id,
        );
        return { entry: viewOf(row), created: true };
      });
    },

    balance: (learnerId) => repo.totals(learnerId),

    sourceTotals: (learnerId, sourceType, sourceId) =>
      repo.sourceTotals(learnerId, sourceType, String(sourceId)),

    hasSource: (sourceType, sourceId) => repo.hasSource(sourceType, String(sourceId)),

    wallet(learnerId) {
      const { xp, coins } = repo.totals(learnerId);
      return { xp, coins, ...levelProgress(xp, settings.get('economy.xpPerLevel')) };
    },

    list(learnerId, query = {}) {
      const limit = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
      const rows = repo.page({
        learnerId,
        limit,
        ...(query.type !== undefined && { sourceType: query.type }),
        ...(query.from !== undefined && { from: query.from }),
        ...(query.to !== undefined && { to: query.to }),
        ...(query.cursor !== undefined && { before: decodeCursor(query.cursor) }),
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(toDto),
        nextCursor: rows.length > limit && last ? `${last.at}_${last.id}` : null,
      };
    },
  };
}
