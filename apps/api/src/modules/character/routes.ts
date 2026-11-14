import { characterNameRequestSchema, equipRequestSchema } from '@questclass/shared/character/dto';
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

/** The learner's hero: what is worn, the room, the name. */
export function characterRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'GET',
      path: '/api/me/character',
      roles: ['learner'],
      handler: (c) => c.json(ctx.character.view(learnerOf(c))),
    }),
    route({
      method: 'PUT',
      path: '/api/me/character/look',
      roles: ['learner'],
      handler: async (c) => {
        const { itemId } = await readJson(c, equipRequestSchema);
        return c.json(ctx.character.setLook(learnerOf(c), itemId));
      },
    }),
    route({
      method: 'PUT',
      path: '/api/me/character/room',
      roles: ['learner'],
      handler: async (c) => {
        const { itemId } = await readJson(c, equipRequestSchema);
        return c.json(ctx.character.setRoom(learnerOf(c), itemId));
      },
    }),
    route({
      method: 'PUT',
      path: '/api/me/character/name',
      roles: ['learner'],
      handler: async (c) => {
        const { name } = await readJson(c, characterNameRequestSchema);
        return c.json(ctx.character.setName(learnerOf(c), name));
      },
    }),
  ];
}
