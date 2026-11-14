import {
  ITEM_KINDS,
  catalogItemCreateSchema,
  catalogItemUpdateSchema,
} from '@questclass/shared/catalog/dto';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../../app';
import { route, type AppEnv, type RouteDef } from '../../http/route';
import { readJson, readParams, readQuery } from '../../http/validate';

const idParams = z.object({ id: z.coerce.number().int().positive() });
const listQuery = z.object({ kind: z.enum(ITEM_KINDS).optional() });
const actorOf = (c: Context<AppEnv>): number | null => c.get('actor')?.id ?? null;

/** The shared catalog: items of the shop and the built-in art (admin). */
export function catalogRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'GET',
      path: '/api/admin/catalog/library',
      roles: ['admin'],
      handler: (c) => c.json(ctx.catalog.library()),
    }),
    route({
      method: 'GET',
      path: '/api/admin/catalog/items',
      roles: ['admin'],
      handler: (c) => c.json(ctx.catalog.items(readQuery(c, listQuery))),
    }),
    route({
      method: 'POST',
      path: '/api/admin/catalog/items',
      roles: ['admin'],
      handler: async (c) => {
        const input = await readJson(c, catalogItemCreateSchema);
        return c.json(ctx.catalog.create(input, actorOf(c)), 201);
      },
    }),
    route({
      method: 'GET',
      path: '/api/admin/catalog/items/:id',
      roles: ['admin'],
      handler: (c) => c.json(ctx.catalog.item(readParams(c, idParams).id)),
    }),
    route({
      method: 'PATCH',
      path: '/api/admin/catalog/items/:id',
      roles: ['admin'],
      handler: async (c) => {
        const { id } = readParams(c, idParams);
        const patch = await readJson(c, catalogItemUpdateSchema);
        return c.json(ctx.catalog.update(id, patch, actorOf(c)));
      },
    }),
  ];
}
