import { z } from 'zod';
import type { AppContext } from '../../app';
import { unauthorized } from '../../http/errors';
import { route, type RouteDef } from '../../http/route';
import { readParams } from '../../http/validate';
import { streamFile } from './stream';

const idParams = z.object({ id: z.coerce.number().int().positive() });
const PREFIX_SEGMENTS = 4; // '', 'api', 'media', ':id'

/**
 * The file part of `/api/media/:id/<path>` exactly as sent (still percent-encoded), so that it is
 * decoded once, by `safePath`, and `%2f` cannot turn into a separator unnoticed.
 */
function rawFilePath(url: string): string {
  return new URL(url).pathname.split('/').slice(PREFIX_SEGMENTS).join('/');
}

/** Media files with Range support: learners get only media of tasks they can see. */
export function mediaRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'GET',
      path: '/api/media/:id/*',
      roles: ['admin', 'learner'],
      handler: async (c) => {
        const actor = c.get('actor');
        if (!actor) {
          throw unauthorized();
        }
        const { id } = readParams(c, idParams);
        const resolved = await ctx.media.resolveFile(actor, id, rawFilePath(c.req.url));
        return streamFile(c, resolved.file, { extension: resolved.path.extension });
      },
    }),
  ];
}
