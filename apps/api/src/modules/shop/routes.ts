import { purchaseRequestSchema } from '@questclass/shared/shop/dto';
import type { Context } from 'hono';
import type { AppContext } from '../../app';
import { unauthorized } from '../../http/errors';
import { route, type AppEnv, type RouteDef } from '../../http/route';
import { readJson } from '../../http/validate';

function learnerOf(c: Context<AppEnv>): number {
  const actor = c.get('actor');
  if (actor?.role !== 'learner') {
    throw unauthorized();
  }
  return actor.id;
}

/** The learner's shop and purchases. */
export function shopRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'GET',
      path: '/api/shop',
      roles: ['learner'],
      handler: (c) => c.json(ctx.shop.shop(learnerOf(c))),
    }),
    route({
      method: 'POST',
      path: '/api/shop/purchases',
      roles: ['learner'],
      handler: async (c) => {
        const input = await readJson(c, purchaseRequestSchema);
        const result = ctx.shop.purchase(learnerOf(c), input);
        return c.json(result.outcome, result.created ? 201 : 200);
      },
    }),
  ];
}
