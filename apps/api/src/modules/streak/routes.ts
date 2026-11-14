import type { Context } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../../app';
import { notFound, unauthorized } from '../../http/errors';
import { route, type AppEnv, type RouteDef } from '../../http/route';
import { readParams } from '../../http/validate';

const learnerParams = z.object({ id: z.coerce.number().int().positive() });

function learnerOf(c: Context<AppEnv>): number {
  const actor = c.get('actor');
  if (actor?.role !== 'learner') {
    throw unauthorized();
  }
  return actor.id;
}

/** Study streak: read-only views (days are recorded by attempts and admin closures). */
export function streakRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'GET',
      path: '/api/me/streak',
      roles: ['learner'],
      handler: (c) => c.json(ctx.streak.view(learnerOf(c))),
    }),
    route({
      method: 'GET',
      path: '/api/admin/learners/:id/streak',
      roles: ['admin'],
      handler: (c) => {
        const { id } = readParams(c, learnerParams);
        if (ctx.users.findRow(id)?.role !== 'learner') {
          throw notFound('Ученик не найден');
        }
        return c.json(ctx.streak.view(id));
      },
    }),
  ];
}
