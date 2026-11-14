import {
  awardCreateSchema,
  rewardReasonCreateSchema,
  rewardReasonUpdateSchema,
} from '@questclass/shared/rewards/dto';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../../app';
import { unauthorized } from '../../http/errors';
import { route, type AppEnv, type RouteDef } from '../../http/route';
import { readJson, readParams, readQuery } from '../../http/validate';
import { CURSOR_PATTERN, MAX_PAGE_SIZE } from './service';

const id = z.coerce.number().int().positive();
const idParams = z.object({ id });
const awardParams = z.object({ id, awardId: id });
const pageQuery = z.object({
  cursor: z.string().regex(CURSOR_PATTERN).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

const actorOf = (c: Context<AppEnv>): number | null => c.get('actor')?.id ?? null;

function learnerOf(c: Context<AppEnv>): number {
  const actor = c.get('actor');
  if (actor?.role !== 'learner') {
    throw unauthorized();
  }
  return actor.id;
}

/** Reasons of manual awards, the awards themselves and their cancellation. */
export function rewardsRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'GET',
      path: '/api/admin/reward-reasons',
      roles: ['admin'],
      handler: (c) => c.json(ctx.rewards.listReasons({ includeArchived: true })),
    }),
    route({
      method: 'POST',
      path: '/api/admin/reward-reasons',
      roles: ['admin'],
      handler: async (c) => {
        const input = await readJson(c, rewardReasonCreateSchema);
        return c.json(ctx.rewards.createReason(input, actorOf(c)), 201);
      },
    }),
    route({
      method: 'PATCH',
      path: '/api/admin/reward-reasons/:id',
      roles: ['admin'],
      handler: async (c) => {
        const params = readParams(c, idParams);
        const patch = await readJson(c, rewardReasonUpdateSchema);
        return c.json(ctx.rewards.updateReason(params.id, patch, actorOf(c)));
      },
    }),
    route({
      method: 'GET',
      path: '/api/admin/learners/:id/awards',
      roles: ['admin'],
      handler: (c) => c.json(ctx.rewards.list(readParams(c, idParams).id, readQuery(c, pageQuery))),
    }),
    route({
      method: 'POST',
      path: '/api/admin/learners/:id/awards',
      roles: ['admin'],
      handler: async (c) => {
        const params = readParams(c, idParams);
        const input = await readJson(c, awardCreateSchema);
        const outcome = ctx.rewards.grant(params.id, input, actorOf(c));
        return c.json(outcome.award, outcome.created ? 201 : 200);
      },
    }),
    route({
      method: 'POST',
      path: '/api/admin/learners/:id/awards/:awardId/cancellation',
      roles: ['admin'],
      handler: (c) => {
        const params = readParams(c, awardParams);
        const outcome = ctx.rewards.cancel(params.id, params.awardId, actorOf(c));
        return c.json(outcome.award, outcome.created ? 201 : 200);
      },
    }),
    route({
      method: 'GET',
      path: '/api/me/awards',
      roles: ['learner'],
      handler: (c) => c.json(ctx.rewards.list(learnerOf(c), readQuery(c, pageQuery))),
    }),
  ];
}
