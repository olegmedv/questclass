import type { LedgerSourceType } from '@questclass/shared/economy/dto';
import { and, desc, eq, gte, lt, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Db } from '../../db/client';
import { ledger, type LedgerInsert, type LedgerRow } from '../../db/schema/ledger';

export interface Totals {
  readonly xp: number;
  readonly coins: number;
}

/** A row together with the id of the row that cancelled it, if any. */
export interface LedgerRowView extends LedgerRow {
  readonly reversedById: number | null;
}

export interface PageQuery {
  readonly learnerId: number;
  readonly sourceType?: LedgerSourceType;
  /** Inclusive lower bound, epoch ms. */
  readonly from?: number;
  /** Exclusive upper bound, epoch ms. */
  readonly to?: number;
  /** Keyset position: rows strictly older than (at, id). */
  readonly before?: { readonly at: number; readonly id: number };
  readonly limit: number;
}

const reversal = alias(ledger, 'reversal');

const totalsColumns = {
  xp: sql<number>`coalesce(sum(${ledger.xp}), 0)`,
  coins: sql<number>`coalesce(sum(${ledger.coins}), 0)`,
};

/** Plain queries on `ledger`; business rules live in the service. */
export function createLedgerRepo(db: Db) {
  return {
    insert(values: LedgerInsert): LedgerRow {
      return db.insert(ledger).values(values).returning().get();
    },

    findById(id: number): LedgerRow | undefined {
      return db.select().from(ledger).where(eq(ledger.id, id)).get();
    },

    findByKey(idemKey: string): LedgerRow | undefined {
      return db.select().from(ledger).where(eq(ledger.idemKey, idemKey)).get();
    },

    findReversalOf(id: number): LedgerRow | undefined {
      return db.select().from(ledger).where(eq(ledger.reversesId, id)).get();
    },

    view(id: number): LedgerRowView | undefined {
      const row = db
        .select({ row: ledger, reversedById: reversal.id })
        .from(ledger)
        .leftJoin(reversal, eq(reversal.reversesId, ledger.id))
        .where(eq(ledger.id, id))
        .get();
      return row && { ...row.row, reversedById: row.reversedById };
    },

    totals(learnerId: number): Totals {
      return (
        db.select(totalsColumns).from(ledger).where(eq(ledger.learnerId, learnerId)).get() ?? {
          xp: 0,
          coins: 0,
        }
      );
    },

    sourceTotals(learnerId: number, sourceType: LedgerSourceType, sourceId: string): Totals {
      return (
        db
          .select(totalsColumns)
          .from(ledger)
          .where(
            and(
              eq(ledger.learnerId, learnerId),
              eq(ledger.sourceType, sourceType),
              eq(ledger.sourceId, sourceId),
            ),
          )
          .get() ?? { xp: 0, coins: 0 }
      );
    },

    hasSource(sourceType: LedgerSourceType, sourceId: string): boolean {
      const row = db
        .select({ id: ledger.id })
        .from(ledger)
        .where(and(eq(ledger.sourceType, sourceType), eq(ledger.sourceId, sourceId)))
        .limit(1)
        .get();
      return row !== undefined;
    },

    /** Newest first; returns up to `limit + 1` rows so the caller can tell if more exist. */
    page(query: PageQuery): LedgerRowView[] {
      const conditions: (SQL | undefined)[] = [eq(ledger.learnerId, query.learnerId)];
      if (query.sourceType !== undefined) {
        conditions.push(eq(ledger.sourceType, query.sourceType));
      }
      if (query.from !== undefined) {
        conditions.push(gte(ledger.at, query.from));
      }
      if (query.to !== undefined) {
        conditions.push(lt(ledger.at, query.to));
      }
      if (query.before !== undefined) {
        const { at, id } = query.before;
        conditions.push(or(lt(ledger.at, at), and(eq(ledger.at, at), lt(ledger.id, id))));
      }
      return db
        .select({ row: ledger, reversedById: reversal.id })
        .from(ledger)
        .leftJoin(reversal, eq(reversal.reversesId, ledger.id))
        .where(and(...conditions))
        .orderBy(desc(ledger.at), desc(ledger.id))
        .limit(query.limit + 1)
        .all()
        .map((r) => ({ ...r.row, reversedById: r.reversedById }));
    },
  };
}

export type LedgerRepo = ReturnType<typeof createLedgerRepo>;
