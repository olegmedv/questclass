import type { RewardType } from '@questclass/shared/catalog/dto';
import {
  ROBUX_GROUP,
  type FulfillmentRequest,
  type LearnerWishesDto,
  type ReceiptDto,
  type WishGroupDto,
  type WishesDto,
} from '@questclass/shared/wishes/dto';
import { createHash } from 'node:crypto';
import { and, asc, desc, eq, inArray, lt, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { fulfillmentAllocations } from '../../db/schema/fulfillmentAllocations';
import { fulfillments, type FulfillmentRow } from '../../db/schema/fulfillments';
import { purchases, type PurchaseRow } from '../../db/schema/purchases';
import { users } from '../../db/schema/users';
import { wishRequests } from '../../db/schema/wishRequests';
import { conflict, notFound } from '../../http/errors';
import { auditPayload, defineAuditAction, type AuditService } from '../audit/service';
import type { UsersService } from '../users/service';

export const wishFulfilled = defineAuditAction(
  'wish.fulfilled',
  z.object({ groupKey: z.string(), rewardType: z.string(), title: z.string(), amount: z.number() }),
);

export interface WishesService {
  /** The learner's groups with something left, and the receipts (newest first, by 20). */
  view(learnerId: number, query?: { cursor?: string; limit?: number }): WishesDto;
  /** «Хочу использовать»: one insert, unless the group is already requested. */
  request(learnerId: number, groupKey: string): { group: WishGroupDto; created: boolean };
  /** Groups waiting for the admin (`open` = requested), by learner. */
  queue(status: 'open' | 'remaining'): LearnerWishesDto[];
  /**
   * Hands out `amount` of a group: one receipt and its allocations, oldest purchases first.
   * Idempotent by `requestId`; `expectedRemaining` must match what is left now.
   */
  fulfill(
    learnerId: number,
    input: FulfillmentRequest,
    actorId: number | null,
  ): { receipt: ReceiptDto; created: boolean };
}

export interface WishesDeps {
  readonly audit: AuditService;
  readonly users: UsersService;
  readonly clock?: () => number;
}

export const HISTORY_PAGE = 20;
export const HISTORY_MAX = 100;
export const CURSOR_PATTERN = /^\d+$/;
const ROBUX_TITLE = 'Robux';

/** Robux tickets form one group; a wish groups by item, title and description. */
export function groupKeyOf(
  row: Pick<PurchaseRow, 'rewardType' | 'itemId' | 'title' | 'description'>,
): string {
  if (row.rewardType === 'robux') {
    return ROBUX_GROUP;
  }
  const digest = createHash('sha256').update(`${row.title}\u0000${row.description}`).digest('hex');
  return `wish:${row.itemId}:${digest.slice(0, 12)}`;
}

interface Ticket {
  readonly row: PurchaseRow;
  readonly groupKey: string;
  readonly remaining: number;
}

interface Group {
  readonly key: string;
  readonly rewardType: RewardType;
  readonly tickets: Ticket[];
  readonly remaining: number;
}

const iso = (ms: number): string => new Date(ms).toISOString();

export function createWishesService(db: Db, deps: WishesDeps): WishesService {
  const { audit, users: usersService, clock = Date.now } = deps;

  const requireLearner = (learnerId: number): void => {
    if (usersService.findRow(learnerId)?.role !== 'learner') {
      throw notFound('Ученик не найден');
    }
  };

  /** Ticket purchases with what is left of each (reward − handed out), oldest first. */
  const tickets = (learnerId: number): Ticket[] =>
    db
      .select({
        row: purchases,
        used: sql<number>`coalesce(sum(${fulfillmentAllocations.amount}), 0)`,
      })
      .from(purchases)
      .leftJoin(fulfillmentAllocations, eq(fulfillmentAllocations.purchaseId, purchases.id))
      .where(and(eq(purchases.learnerId, learnerId), eq(purchases.kind, 'ticket')))
      .groupBy(purchases.id)
      .orderBy(asc(purchases.id))
      .all()
      .map(({ row, used }) => ({
        row,
        groupKey: groupKeyOf(row),
        remaining: Math.max(0, (row.rewardAmount ?? 0) - used),
      }));

  /** Groups with something left. */
  const groups = (learnerId: number): Group[] => {
    const byKey = new Map<string, Ticket[]>();
    for (const ticket of tickets(learnerId)) {
      if (ticket.remaining <= 0) continue;
      byKey.set(ticket.groupKey, [...(byKey.get(ticket.groupKey) ?? []), ticket]);
    }
    return [...byKey].map(([key, list]) => ({
      key,
      rewardType: list[0]?.row.rewardType ?? 'wish',
      tickets: list,
      remaining: list.reduce((n, t) => n + t.remaining, 0),
    }));
  };

  /** Newest request and newest receipt per group. */
  const latest = (learnerId: number) => {
    const requests = new Map(
      db
        .select({ key: wishRequests.groupKey, at: max(wishRequests.at) })
        .from(wishRequests)
        .where(eq(wishRequests.learnerId, learnerId))
        .groupBy(wishRequests.groupKey)
        .all()
        .map((r) => [r.key, r.at ?? 0]),
    );
    const handed = new Map(
      db
        .select({ key: fulfillments.groupKey, at: max(fulfillments.at) })
        .from(fulfillments)
        .where(eq(fulfillments.learnerId, learnerId))
        .groupBy(fulfillments.groupKey)
        .all()
        .map((r) => [r.key, r.at ?? 0]),
    );
    return { requests, handed };
  };

  const toGroupDto = (group: Group, last: ReturnType<typeof latest>): WishGroupDto => {
    const first = group.tickets[0]?.row;
    const requestedAt = last.requests.get(group.key);
    // Requested while the newest request is newer than the newest receipt of the group.
    const requested = requestedAt !== undefined && requestedAt > (last.handed.get(group.key) ?? -1);
    return {
      groupKey: group.key,
      rewardType: group.rewardType,
      title: group.rewardType === 'robux' ? ROBUX_TITLE : (first?.title ?? ''),
      description: first?.description ?? '',
      ticket: first?.snapshot.ticket ?? null,
      remaining: group.remaining,
      status: requested ? 'requested' : 'ready',
      requestedAt: requested && requestedAt !== undefined ? iso(requestedAt) : null,
    };
  };

  const groupViews = (learnerId: number): WishGroupDto[] => {
    const last = latest(learnerId);
    return groups(learnerId).map((g) => toGroupDto(g, last));
  };

  const receipts = (rows: FulfillmentRow[]): ReceiptDto[] => {
    const ids = rows.map((r) => r.id);
    const parts =
      ids.length === 0
        ? []
        : db
            .select()
            .from(fulfillmentAllocations)
            .where(inArray(fulfillmentAllocations.fulfillmentId, ids))
            .orderBy(asc(fulfillmentAllocations.purchaseId))
            .all();
    return rows.map((r) => ({
      id: r.id,
      groupKey: r.groupKey,
      rewardType: r.rewardType,
      title: r.title,
      amount: r.amount,
      at: iso(r.at),
      allocations: parts
        .filter((p) => p.fulfillmentId === r.id)
        .map((p) => ({ purchaseId: p.purchaseId, amount: p.amount })),
    }));
  };

  return {
    view(learnerId, query = {}) {
      const limit = Math.min(query.limit ?? HISTORY_PAGE, HISTORY_MAX);
      const before = query.cursor === undefined ? undefined : Number(query.cursor);
      const rows = db
        .select()
        .from(fulfillments)
        .where(
          and(
            eq(fulfillments.learnerId, learnerId),
            before === undefined ? undefined : lt(fulfillments.id, before),
          ),
        )
        .orderBy(desc(fulfillments.id))
        .limit(limit + 1)
        .all();
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        groups: groupViews(learnerId),
        history: {
          items: receipts(page),
          nextCursor: rows.length > limit && last ? String(last.id) : null,
        },
      };
    },

    request(learnerId, groupKey) {
      return db.transaction(() => {
        const group = groupViews(learnerId).find((g) => g.groupKey === groupKey);
        if (!group) {
          throw notFound('Нет такой награды');
        }
        if (group.status === 'requested') {
          return { group, created: false };
        }
        db.insert(wishRequests).values({ learnerId, groupKey, at: clock() }).run();
        const updated = groupViews(learnerId).find((g) => g.groupKey === groupKey) ?? group;
        return { group: updated, created: true };
      });
    },

    queue(status) {
      const learners = db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.role, 'learner'))
        .orderBy(asc(users.id))
        .all();
      return learners
        .map((learner) => ({
          learnerId: learner.id,
          learnerName: learner.name,
          groups: groupViews(learner.id).filter(
            (g) => status === 'remaining' || g.status === 'requested',
          ),
        }))
        .filter((entry) => entry.groups.length > 0);
    },

    fulfill(learnerId, input, actorId) {
      requireLearner(learnerId);
      const now = clock();
      return db.transaction(() => {
        const earlier = db
          .select()
          .from(fulfillments)
          .where(
            and(eq(fulfillments.learnerId, learnerId), eq(fulfillments.requestId, input.requestId)),
          )
          .get();
        if (earlier) {
          if (earlier.groupKey !== input.groupKey) {
            throw conflict('request_conflict', 'Этот запрос уже использован для другой выдачи');
          }
          const [receipt] = receipts([earlier]);
          if (!receipt) throw new Error('receipt');
          return { receipt, created: false };
        }
        const group = groups(learnerId).find((g) => g.key === input.groupKey);
        if (!group) {
          throw notFound('Нет такой награды');
        }
        if (input.expectedRemaining !== group.remaining) {
          throw conflict('remaining_changed', 'Остаток изменился. Обновите страницу', {
            remaining: group.remaining,
          });
        }
        if (input.amount > group.remaining) {
          throw conflict('amount_exceeds_remaining', 'Больше, чем осталось', {
            remaining: group.remaining,
          });
        }
        const first = group.tickets[0]?.row;
        const row = db
          .insert(fulfillments)
          .values({
            learnerId,
            groupKey: group.key,
            requestId: input.requestId,
            rewardType: group.rewardType,
            title: group.rewardType === 'robux' ? ROBUX_TITLE : (first?.title ?? ''),
            amount: input.amount,
            createdBy: actorId,
            at: now,
          })
          .returning()
          .get();
        // Oldest purchases first; a purchase may be used partly.
        let left = input.amount;
        for (const ticket of group.tickets) {
          if (left === 0) break;
          const take = Math.min(left, ticket.remaining);
          db.insert(fulfillmentAllocations)
            .values({ fulfillmentId: row.id, purchaseId: ticket.row.id, amount: take })
            .run();
          left -= take;
        }
        const payload = auditPayload(wishFulfilled, {
          groupKey: row.groupKey,
          rewardType: row.rewardType,
          title: row.title,
          amount: row.amount,
        });
        audit.record(actorId, wishFulfilled, 'fulfillment', row.id, payload, { learnerId });
        const [receipt] = receipts([row]);
        if (!receipt) throw new Error('receipt');
        return { receipt, created: true };
      });
    },
  };
}
