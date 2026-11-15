import type { AppContext } from '../../app';
import { route, type RouteDef } from '../../http/route';
import { adminInbox } from './service';

/** «Что нужно сделать?»: the counters of the admin home (FEAT-055). */
export function adminInboxRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'GET',
      path: '/api/admin/inbox',
      roles: ['admin'],
      handler: (c) => c.json(adminInbox(ctx)),
    }),
  ];
}
