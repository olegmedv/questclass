import { subjectCreateSchema, subjectUpdateSchema } from '@questclass/shared/tasks/dto';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../../app';
import { route, type AppEnv, type RouteDef } from '../../http/route';
import { readJson, readParams } from '../../http/validate';

const idParams = z.object({ id: z.coerce.number().int().positive() });
const actorOf = (c: Context<AppEnv>): number | null => c.get('actor')?.id ?? null;

/** Subjects: learners see the active ones; admins manage all of them. */
export function subjectsRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'GET',
      path: '/api/subjects',
      roles: ['learner', 'admin'],
      handler: (c) => c.json(ctx.subjects.list()),
    }),
    route({
      method: 'GET',
      path: '/api/admin/subjects',
      roles: ['admin'],
      handler: (c) => c.json(ctx.subjects.list({ includeArchived: true })),
    }),
    route({
      method: 'POST',
      path: '/api/admin/subjects',
      roles: ['admin'],
      handler: async (c) => {
        const input = await readJson(c, subjectCreateSchema);
        return c.json(ctx.subjects.create(input, actorOf(c)), 201);
      },
    }),
    route({
      method: 'PATCH',
      path: '/api/admin/subjects/:id',
      roles: ['admin'],
      handler: async (c) => {
        const { id } = readParams(c, idParams);
        const patch = await readJson(c, subjectUpdateSchema);
        return c.json(ctx.subjects.update(id, patch, actorOf(c)));
      },
    }),
    route({
      method: 'DELETE',
      path: '/api/admin/subjects/:id',
      roles: ['admin'],
      handler: (c) => {
        ctx.subjects.remove(readParams(c, idParams).id, actorOf(c));
        return c.body(null, 204);
      },
    }),
  ];
}
