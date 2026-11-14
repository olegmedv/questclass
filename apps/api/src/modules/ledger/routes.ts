import { LEDGER_SOURCE_TYPES } from '@questclass/shared/economy/dto';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../../app';
import { notFound, unauthorized } from '../../http/errors';
import { route, type AppEnv, type RouteDef } from '../../http/route';
import { readParams, readQuery } from '../../http/validate';
import { CURSOR_PATTERN, MAX_PAGE_SIZE } from './service';

/** An instant given as epoch milliseconds or an ISO 8601 date-time with offset. */
const instant = z.union([
  z
    .string()
    .regex(/^\d+$/)
    .transform((value) => Number(value)),
  z.iso.datetime({ offset: true }).transform((value) => Date.parse(value)),
]);

const pageQuery = z.object({
  cursor: z.string().regex(CURSOR_PATTERN).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

const adminLedgerQuery = pageQuery.extend({
  type: z.enum(LEDGER_SOURCE_TYPES).optional(),
  from: instant.optional(),
  to: instant.optional(),
});

const learnerParams = z.object({ id: z.coerce.number().int().positive() });

/** The signed-in learner (routes with role `learner` only). */
function learnerId(c: Context<AppEnv>): number {
  const actor = c.get('actor');
  if (actor?.role !== 'learner') {
    throw unauthorized();
  }
  return actor.id;
}

/** Balance, level and the journal of XP and coins. */
export function ledgerRoutes(ctx: AppContext): RouteDef[] {
  const requireLearner = (id: number): number => {
    const user = ctx.users.findRow(id);
    if (user?.role !== 'learner') {
      throw notFound('Ученик не найден');
    }
    return user.id;
  };

  return [
    route({
      method: 'GET',
      path: '/api/me/wallet',
      roles: ['learner'],
      handler: (c) => c.json(ctx.ledger.wallet(learnerId(c))),
    }),
    route({
      method: 'GET',
      path: '/api/me/ledger',
      roles: ['learner'],
      handler: (c) => c.json(ctx.ledger.list(learnerId(c), readQuery(c, pageQuery))),
    }),
    route({
      method: 'GET',
      path: '/api/admin/learners/:id/ledger',
      roles: ['admin'],
      handler: (c) => {
        const id = requireLearner(readParams(c, learnerParams).id);
        return c.json(ctx.ledger.list(id, readQuery(c, adminLedgerQuery)));
      },
    }),
  ];
}
