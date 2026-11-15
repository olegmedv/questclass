import {
  CHORE_COMPLETION_STATUSES,
  choreRejectionSchema,
} from '@questclass/shared/task-types/chore/dto';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../../app';
import { unauthorized } from '../../http/errors';
import { route, type AppEnv, type RouteDef } from '../../http/route';
import { readJson, readParams, readQuery } from '../../http/validate';

const id = z.coerce.number().int().positive();
const taskParams = z.object({ taskId: id });
const idParams = z.object({ id });
const reviewsQuery = z.object({
  status: z.enum(CHORE_COMPLETION_STATUSES).optional(),
  learnerId: id.optional(),
});

const actorOf = (c: Context<AppEnv>): number | null => c.get('actor')?.id ?? null;

function learnerOf(c: Context<AppEnv>): number {
  const actor = c.get('actor');
  if (actor?.role !== 'learner') {
    throw unauthorized();
  }
  return actor.id;
}

/** Chores: «Я сделал» (learner) and the admin's review of the reports. */
export function choreRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'GET',
      path: '/api/tasks/:taskId/chore-completions',
      roles: ['learner'],
      handler: (c) => c.json(ctx.chores.status(learnerOf(c), readParams(c, taskParams).taskId)),
    }),
    route({
      method: 'POST',
      path: '/api/tasks/:taskId/chore-completions',
      roles: ['learner'],
      handler: (c) => {
        const outcome = ctx.chores.report(learnerOf(c), readParams(c, taskParams).taskId);
        return c.json(outcome.completion, outcome.created ? 201 : 200);
      },
    }),
    route({
      method: 'GET',
      path: '/api/admin/chores/reviews',
      roles: ['admin'],
      handler: (c) => c.json(ctx.chores.reviews(readQuery(c, reviewsQuery))),
    }),
    route({
      method: 'POST',
      path: '/api/admin/chores/reviews/:id/approval',
      roles: ['admin'],
      handler: (c) => {
        const outcome = ctx.chores.approve(readParams(c, idParams).id, actorOf(c));
        return c.json(outcome.completion, outcome.created ? 201 : 200);
      },
    }),
    route({
      method: 'POST',
      path: '/api/admin/chores/reviews/:id/rejection',
      roles: ['admin'],
      handler: async (c) => {
        const { id: completionId } = readParams(c, idParams);
        const input = await readJson(c, choreRejectionSchema);
        const outcome = ctx.chores.reject(completionId, input, actorOf(c));
        return c.json(outcome.completion, outcome.created ? 201 : 200);
      },
    }),
  ];
}
