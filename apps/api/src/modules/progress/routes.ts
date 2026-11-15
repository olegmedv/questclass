import {
  closureRequestSchema,
  coinsResetRequestSchema,
  progressResetRequestSchema,
} from '@questclass/shared/progress/dto';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../../app';
import { unauthorized } from '../../http/errors';
import { route, type AppEnv, type RouteDef } from '../../http/route';
import { readJson, readParams } from '../../http/validate';

const id = z.coerce.number().int().positive();
const learnerParams = z.object({ id });
const taskParams = z.object({ id, taskId: id });

const actorOf = (c: Context<AppEnv>): number | null => c.get('actor')?.id ?? null;

function learnerOf(c: Context<AppEnv>): number {
  const actor = c.get('actor');
  if (actor?.role !== 'learner') {
    throw unauthorized();
  }
  return actor.id;
}

/** Progress of learners and the admin's manual control over it. */
export function progressRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'GET',
      path: '/api/me/progress',
      roles: ['learner'],
      handler: (c) => c.json(ctx.progress.learnerProgress(learnerOf(c))),
    }),
    route({
      method: 'GET',
      path: '/api/admin/learners/:id/progress',
      roles: ['admin'],
      handler: (c) => c.json(ctx.progress.learnerProgress(readParams(c, learnerParams).id)),
    }),
    route({
      method: 'POST',
      path: '/api/admin/learners/:id/progress/:taskId/closure',
      roles: ['admin'],
      handler: async (c) => {
        const params = readParams(c, taskParams);
        const input = await readJson(c, closureRequestSchema);
        return c.json(ctx.progress.close(params.id, params.taskId, input, actorOf(c)), 201);
      },
    }),
    route({
      method: 'POST',
      path: '/api/admin/learners/:id/progress/:taskId/reopening',
      roles: ['admin'],
      handler: (c) => {
        const params = readParams(c, taskParams);
        return c.json(ctx.progress.reopen(params.id, params.taskId, actorOf(c)), 201);
      },
    }),
    route({
      method: 'POST',
      path: '/api/admin/learners/:id/progress-resets',
      roles: ['admin'],
      handler: async (c) => {
        const { id: learnerId } = readParams(c, learnerParams);
        const input = await readJson(c, progressResetRequestSchema);
        const result = ctx.progress.reset(learnerId, input, actorOf(c));
        return c.json(result, result.created ? 201 : 200);
      },
    }),
    route({
      method: 'POST',
      path: '/api/admin/learners/:id/coins-resets',
      roles: ['admin'],
      handler: async (c) => {
        const { id: learnerId } = readParams(c, learnerParams);
        const { requestId } = await readJson(c, coinsResetRequestSchema);
        const result = ctx.progress.coinsReset(learnerId, requestId, actorOf(c));
        return c.json(result.entry, result.created ? 201 : 200);
      },
    }),
  ];
}
