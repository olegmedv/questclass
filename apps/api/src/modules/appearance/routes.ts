import { appearanceReplaceSchema } from '@questclass/shared/assets/appearance';
import type { Context } from 'hono';
import type { AppContext } from '../../app';
import { route, type AppEnv, type RouteDef } from '../../http/route';
import { notFound } from '../../http/errors';
import { readJson } from '../../http/validate';
import { sendReplacement } from '../../static';

const actorOf = (c: Context<AppEnv>): number | null => c.get('actor')?.id ?? null;
/** The slot is a manifest path (`game/rooms/room-bright.webp`): the rest of the URL. */
const SLOT_PATH = '/api/admin/appearance/:slot{.+}';
const slotOf = (c: Context<AppEnv>): string => decodeURIComponent(c.req.param('slot') ?? '');

/** «Оформление»: built-in files replaced with the admin's uploads (FEAT-059). */
export function appearanceRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'GET',
      path: '/api/admin/appearance',
      roles: ['admin'],
      handler: (c) => c.json(ctx.appearance.list()),
    }),
    route({
      method: 'PUT',
      path: SLOT_PATH,
      roles: ['admin'],
      handler: async (c) => {
        const { uploadId } = await readJson(c, appearanceReplaceSchema);
        return c.json(ctx.appearance.replace(slotOf(c), uploadId, actorOf(c)));
      },
    }),
    route({
      method: 'DELETE',
      path: SLOT_PATH,
      roles: ['admin'],
      handler: (c) => c.json(ctx.appearance.restore(slotOf(c), actorOf(c))),
    }),
    // Public: the logo and the favicon are on the sign-in screens too.
    route({
      method: 'GET',
      path: '/api/appearance',
      roles: ['public'],
      handler: (c) => c.json(ctx.appearance.current()),
    }),
    // The replacement of `/assets/<file>` by itself: production answers it at the /assets URL
    // (static.ts); the Vite dev and preview servers forward replaced files here.
    route({
      method: 'GET',
      path: '/api/appearance/files/:file{.+}',
      roles: ['public'],
      handler: async (c) => {
        const file = decodeURIComponent(c.req.param('file') ?? '');
        const replacement = ctx.appearance.replacementOf(file);
        const sent = replacement && (await sendReplacement(c, replacement));
        if (!sent) {
          throw notFound('Этот файл не заменён');
        }
        return sent;
      },
    }),
  ];
}
