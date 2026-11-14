import { watchBatchSchema } from '@questclass/shared/task-types/video_lesson/dto';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../../app';
import { unauthorized } from '../../http/errors';
import { route, type AppEnv, type RouteDef } from '../../http/route';
import { readJson, readParams } from '../../http/validate';

const id = z.coerce.number().int().positive();
const taskParams = z.object({ taskId: id });
const sessionParams = z.object({ taskId: id, id });
const confirmParams = z.object({ id, taskId: id });

function learnerOf(c: Context<AppEnv>): number {
  const actor = c.get('actor');
  if (actor?.role !== 'learner') {
    throw unauthorized();
  }
  return actor.id;
}

/** Watching of lesson videos: sessions and batches (learner), confirmation by hand (admin). */
export function videoLessonRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'POST',
      path: '/api/watch/:taskId/sessions',
      roles: ['learner'],
      handler: (c) => {
        const { taskId } = readParams(c, taskParams);
        return c.json(ctx.watch.startSession(learnerOf(c), taskId), 201);
      },
    }),
    route({
      method: 'POST',
      path: '/api/watch/:taskId/sessions/:id/intervals',
      roles: ['learner'],
      handler: async (c) => {
        const params = readParams(c, sessionParams);
        const batch = await readJson(c, watchBatchSchema);
        return c.json(ctx.watch.recordBatch(learnerOf(c), params.taskId, params.id, batch));
      },
    }),
    route({
      method: 'POST',
      path: '/api/admin/learners/:id/watch/:taskId/confirmation',
      roles: ['admin'],
      handler: (c) => {
        const params = readParams(c, confirmParams);
        const result = ctx.watch.confirm(params.id, params.taskId, c.get('actor')?.id ?? null);
        return c.json(result.progress, result.created ? 201 : 200);
      },
    }),
  ];
}
