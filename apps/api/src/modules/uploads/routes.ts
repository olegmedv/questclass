import { assetSlotOfFile } from '@questclass/shared/assets/slots';
import { z } from 'zod';
import type { AppContext } from '../../app';
import { route, type RouteDef } from '../../http/route';
import { badRequest } from '../../http/errors';
import { readParams, readQuery } from '../../http/validate';
import { streamFile } from '../media/stream';
import { UPLOAD_LIMITS } from './service';

const idParams = z.object({ id: z.coerce.number().int().positive() });
/** `?for=<file>`: the built-in file (`/assets/<file>`) the upload is meant to replace. */
const uploadQuery = z.object({ for: z.string().min(1).max(200).optional() });

/**
 * Pictures uploaded by the admin (shop items, subject icons, replacements of built-in files) and
 * their delivery to everyone signed in. A sound is accepted only as a replacement of a built-in one.
 */
export function uploadsRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'POST',
      path: '/api/admin/uploads',
      roles: ['admin'],
      bodyLimit: UPLOAD_LIMITS.bodyBytes,
      handler: async (c) => {
        const target = readQuery(c, uploadQuery).for;
        const slot = target === undefined ? undefined : assetSlotOfFile(target);
        if (target !== undefined && !slot) {
          throw badRequest('unknown_slot', 'Такого встроенного файла нет');
        }
        const bytes = new Uint8Array(await c.req.arrayBuffer());
        const actor = c.get('actor')?.id ?? null;
        return c.json(ctx.uploads.create(bytes, actor, slot ? { slot } : {}), 201);
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
