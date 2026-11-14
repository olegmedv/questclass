import type { HttpBindings } from '@hono/node-server';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import { every } from 'hono/combine';
import { limitBody } from './bodyLimit';
import { forbidden, unauthorized } from './errors';

export const ROLES = ['public', 'admin', 'learner', 'import'] as const;
/** Who may call a route. `public` means no session is required. */
export type Role = (typeof ROLES)[number];
/** Role of an authenticated caller. */
export type ActorRole = Exclude<Role, 'public'>;

/** The authenticated caller of a request (set by the auth middleware, FEAT-004). */
export interface Actor {
  readonly role: ActorRole;
  readonly id: number;
}

/** Hono environment shared by every route of the API. */
export interface AppEnv {
  Bindings: Partial<HttpBindings>;
  Variables: {
    actor: Actor | null;
    clientIp: string;
  };
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type RouteHandler = (c: Context<AppEnv>) => Response | Promise<Response>;

export interface RouteDef {
  readonly method: HttpMethod;
  readonly path: string;
  /** Roles allowed to call the route. Mandatory: there is no implicit default. */
  readonly roles: readonly Role[];
  readonly handler: RouteHandler;
  /** Request body limit in bytes for this route (default 1 MB). */
  readonly bodyLimit?: number;
}

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * The only way to declare an API route. Validates the declaration eagerly so that a route
 * without roles (or with an ambiguous role list) can never be mounted.
 */
export function route(def: RouteDef): RouteDef {
  const name = `${def.method} ${def.path}`;
  if (!def.path.startsWith('/api/')) {
    throw new Error(`Route path must start with /api/: ${name}`);
  }
  if (def.roles.length === 0) {
    throw new Error(`Route ${name} must declare at least one role`);
  }
  if (new Set(def.roles).size !== def.roles.length) {
    throw new Error(`Route ${name} declares a role twice`);
  }
  if (!def.roles.every((role) => isRole(role))) {
    throw new Error(`Route ${name} declares an unknown role`);
  }
  if (def.roles.includes('public') && def.roles.length > 1) {
    throw new Error(`Route ${name}: 'public' cannot be combined with other roles`);
  }
  return Object.freeze({ ...def, roles: Object.freeze([...def.roles]) });
}

/** Rejects callers whose role is not in the route's list: anonymous → 401, other role → 403. */
export function authorize(roles: readonly Role[]): MiddlewareHandler<AppEnv> {
  const isPublic = roles.includes('public');
  return async (c, next) => {
    if (!isPublic) {
      const actor = c.get('actor');
      if (!actor) {
        throw unauthorized();
      }
      if (!roles.includes(actor.role)) {
        throw forbidden();
      }
    }
    await next();
  };
}

const METHODS_WITH_BODY: ReadonlySet<HttpMethod> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Mounts route declarations on the app; a duplicate declaration is a programming error. */
export function mountRoutes(app: Hono<AppEnv>, routes: readonly RouteDef[]): void {
  const seen = new Set<string>();
  for (const def of routes) {
    const key = `${def.method} ${def.path}`;
    if (seen.has(key)) {
      throw new Error(`Route registered twice: ${key}`);
    }
    seen.add(key);
    const chain: MiddlewareHandler<AppEnv>[] = [authorize(def.roles)];
    if (METHODS_WITH_BODY.has(def.method)) {
      chain.push(limitBody(def.bodyLimit));
    }
    app.on(def.method, def.path, every(...chain), (c) => def.handler(c));
  }
}
