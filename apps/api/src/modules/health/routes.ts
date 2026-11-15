import { route, type RouteDef } from '../../http/route';

/** Liveness probe for the container healthcheck and the reverse proxy. Never touches the DB. */
export function healthRoutes(): RouteDef[] {
  return [
    route({
      method: 'GET',
      path: '/api/health',
      roles: ['public'],
      handler: (c) => c.json({ status: 'ok' }),
    }),
  ];
}
