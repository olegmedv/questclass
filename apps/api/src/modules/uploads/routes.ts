import { z } from 'zod';
import type { AppContext } from '../../app';
import { route, type RouteDef } from '../../http/route';
import { readParams } from '../../http/validate';
import { streamFile } from '../media/stream';
import { UPLOAD_LIMITS } from './service';

const idParams = z.object({ id: z.coerce.number().int().positive() });

/** Pictures uploaded by the admin (shop items, awards) and their delivery to everyone signed in. */
export function uploadsRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'POST',
      path: '/api/admin/uploads',
      roles: ['admin'],
      bodyLimit: UPLOAD_LIMITS.bodyBytes,
      handler: async (c) => {
        const bytes = new Uint8Array(await c.req.arrayBuffer());
        return c.json(ctx.uploads.create(bytes, c.get('actor')?.id ?? null), 201);
      },
    }),
    route({
      method: 'GET',
      path: '/api/admin/uploads',
      roles: ['admin'],
      handler: (c) => c.json(ctx.uploads.list()),
    }),
    route({
      method: 'GET',
      path: '/api/uploads/:id',
      roles: ['learner', 'admin'],
      handler: (c) => {
        const found = ctx.uploads.file(readParams(c, idParams).id);
        return streamFile(c, found.file, { extension: found.extension });
      },
    }),
  ];
}
