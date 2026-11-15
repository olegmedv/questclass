import {
  TASK_STATUSES,
  assignmentCreateSchema,
  taskCreateSchema,
  taskUpdateSchema,
} from '@questclass/shared/tasks/dto';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../../app';
import { unauthorized } from '../../http/errors';
import { route, type AppEnv, type RouteDef } from '../../http/route';
import { readJson, readParams, readQuery } from '../../http/validate';

const id = z.coerce.number().int().positive();
const idParams = z.object({ id });
const assignmentParams = z.object({ id, learnerId: id });
const listQuery = z.object({
  subjectId: z.coerce.number().int().positive().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  type: z.string().min(1).max(40).optional(),
});

const actorOf = (c: Context<AppEnv>): number | null => c.get('actor')?.id ?? null;

function learnerOf(c: Context<AppEnv>): number {
  const actor = c.get('actor');
  if (actor?.role !== 'learner') {
    throw unauthorized();
  }
  return actor.id;
}

/** Tasks: admin CRUD and assignments; learners read the tasks meant for them. */
export function tasksRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'GET',
      path: '/api/tasks',
      roles: ['learner'],
      handler: (c) => c.json(ctx.tasks.visibleTo(learnerOf(c))),
    }),
    route({
      method: 'GET',
      path: '/api/tasks/:id',
      roles: ['learner'],
      handler: (c) => c.json(ctx.tasks.visibleTask(learnerOf(c), readParams(c, idParams).id)),
    }),
    route({
      method: 'GET',
      path: '/api/admin/tasks',
      roles: ['admin'],
      handler: (c) => c.json(ctx.tasks.list(readQuery(c, listQuery))),
    }),
    route({
      method: 'POST',
      path: '/api/admin/tasks',
      roles: ['admin'],
      handler: async (c) => {
        const input = await readJson(c, taskCreateSchema);
        return c.json(ctx.tasks.create(input, actorOf(c)), 201);
      },
    }),
    route({
      method: 'GET',
      path: '/api/admin/tasks/:id',
      roles: ['admin'],
      handler: (c) => c.json(ctx.tasks.get(readParams(c, idParams).id)),
    }),
    route({
      method: 'PATCH',
      path: '/api/admin/tasks/:id',
      roles: ['admin'],
      handler: async (c) => {
        const { id: taskId } = readParams(c, idParams);
        const patch = await readJson(c, taskUpdateSchema);
        return c.json(ctx.tasks.update(taskId, patch, actorOf(c)));
      },
    }),
    route({
      method: 'DELETE',
      path: '/api/admin/tasks/:id',
      roles: ['admin'],
      handler: (c) => {
        ctx.tasks.remove(readParams(c, idParams).id, actorOf(c));
        return c.body(null, 204);
      },
    }),
    route({
      method: 'POST',
      path: '/api/admin/tasks/:id/assignments',
      roles: ['admin'],
      handler: async (c) => {
        const { id: taskId } = readParams(c, idParams);
        const { learnerId } = await readJson(c, assignmentCreateSchema);
        const result = ctx.tasks.assign(taskId, learnerId, actorOf(c));
        return c.json(result.task, result.created ? 201 : 200);
      },
    }),
    route({
      method: 'DELETE',
      path: '/api/admin/tasks/:id/assignments/:learnerId',
      roles: ['admin'],
      handler: (c) => {
        const params = readParams(c, assignmentParams);
        ctx.tasks.unassign(params.id, params.learnerId, actorOf(c));
        return c.body(null, 204);
      },
    }),
  ];
}
