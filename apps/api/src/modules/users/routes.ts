import {
  USER_ROLES,
  userCreateRequestSchema,
  userUpdateRequestSchema,
} from '@questclass/shared/auth/schemas';
import { z } from 'zod';
import type { AppContext } from '../../app';
import { route, type RouteDef } from '../../http/route';
import { readJson, readParams, readQuery } from '../../http/validate';

const idParams = z.object({ id: z.coerce.number().int().positive() });
const listQuery = z.object({
  role: z.enum(USER_ROLES).optional(),
  active: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

/** Admin management of users. There is no DELETE: users are deactivated (`active: false`). */
export function usersRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'GET',
      path: '/api/admin/users',
      roles: ['admin'],
      handler: (c) => c.json(ctx.users.list(readQuery(c, listQuery))),
    }),
    route({
      method: 'POST',
      path: '/api/admin/users',
      roles: ['admin'],
      handler: async (c) => {
        const input = await readJson(c, userCreateRequestSchema);
        return c.json(await ctx.users.create(input, c.get('actor')?.id ?? null), 201);
      },
    }),
    route({
      method: 'GET',
      path: '/api/admin/users/:id',
      roles: ['admin'],
      handler: (c) => c.json(ctx.users.get(readParams(c, idParams).id)),
    }),
    route({
      method: 'PATCH',
      path: '/api/admin/users/:id',
      roles: ['admin'],
      handler: async (c) => {
        const { id } = readParams(c, idParams);
        const patch = await readJson(c, userUpdateRequestSchema);
        return c.json(await ctx.users.update(id, patch, c.get('actor')?.id ?? null));
      },
    }),
  ];
}
