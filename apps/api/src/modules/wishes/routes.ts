import { fulfillmentRequestSchema, wishRequestSchema } from '@questclass/shared/wishes/dto';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../../app';
import { unauthorized } from '../../http/errors';
import { route, type AppEnv, type RouteDef } from '../../http/route';
import { readJson, readParams, readQuery } from '../../http/validate';
import { CURSOR_PATTERN, HISTORY_MAX } from './service';

const learnerParams = z.object({ id: z.coerce.number().int().positive() });
const historyQuery = z.object({
  cursor: z.string().regex(CURSOR_PATTERN).optional(),
  limit: z.coerce.number().int().min(1).max(HISTORY_MAX).optional(),
});
const queueQuery = z.object({ status: z.enum(['open', 'remaining']).default('open') });

function learnerOf(c: Context<AppEnv>): number {
  const actor = c.get('actor');
  if (actor?.role !== 'learner') {
    throw unauthorized();
  }
  return actor.id;
}

/** «Мои желания» (learner) and handing out wishes and Robux (admin). */
export function wishesRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'GET',
      path: '/api/me/wishes',
      roles: ['learner'],
      handler: (c) => c.json(ctx.wishes.view(learnerOf(c), readQuery(c, historyQuery))),
    }),
    route({
      method: 'POST',
      path: '/api/me/wish-requests',
      roles: ['learner'],
      handler: async (c) => {
        const { groupKey } = await readJson(c, wishRequestSchema);
        const result = ctx.wishes.request(learnerOf(c), groupKey);
        return c.json(result.group, result.created ? 201 : 200);
      },
    }),
    route({
      method: 'GET',
      path: '/api/admin/wishes',
      roles: ['admin'],
      handler: (c) => c.json(ctx.wishes.queue(readQuery(c, queueQuery).status)),
    }),
    route({
      method: 'POST',
      path: '/api/admin/learners/:id/fulfillments',
      roles: ['admin'],
      handler: async (c) => {
        const { id } = readParams(c, learnerParams);
        const input = await readJson(c, fulfillmentRequestSchema);
        const result = ctx.wishes.fulfill(id, input, c.get('actor')?.id ?? null);
        return c.json(result.receipt, result.created ? 201 : 200);
      },
    }),
  ];
}
