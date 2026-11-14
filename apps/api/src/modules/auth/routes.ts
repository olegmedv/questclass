import {
  adminLoginRequestSchema,
  deviceCreateRequestSchema,
  learnerLoginRequestSchema,
  passwordChangeRequestSchema,
  setupRequestSchema,
} from '@questclass/shared/auth/schemas';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';
import { z } from 'zod';
import type { AppContext } from '../../app';
import { clientIp } from '../../http/clientIp';
import { errorBody } from '../../http/errors';
import { route, type AppEnv, type RouteDef } from '../../http/route';
import { readJson, readParams } from '../../http/validate';
import { readActivity, signActivity } from './crypto';
import { ThrottledError, type NewSession } from './service';

export const SESSION_COOKIE = 'qc_session';
/** Signed timestamp of the admin's last request (idle timeout without DB writes). */
export const ACTIVITY_COOKIE = 'qc_act';
export const DEVICE_COOKIE = 'qc_device';

/** Browsers cap cookie lifetime at 400 days; the cookie is refreshed on every profile list. */
const DEVICE_COOKIE_MAX_AGE_SEC = 400 * 24 * 60 * 60;
const CLOCK_SKEW_MS = 60_000;

type AppCtx = Context<AppEnv>;

function cookieOptions(ctx: AppContext, maxAgeSec: number): CookieOptions {
  return {
    httpOnly: true,
    secure: ctx.config.isProduction,
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.max(0, Math.floor(maxAgeSec)),
  };
}

function setActivity(c: AppCtx, ctx: AppContext, tokenHash: string, now: number): void {
  const idleSec = ctx.settings.get('session.adminIdleMinutes') * 60;
  const stamp = signActivity(ctx.auth.activityKey, tokenHash, now);
  setCookie(c, ACTIVITY_COOKIE, stamp, cookieOptions(ctx, idleSec));
}

function issueSession(c: AppCtx, ctx: AppContext, session: NewSession): void {
  const now = Date.now();
  const lifetimeSec = (session.expiresAt - now) / 1000;
  setCookie(c, SESSION_COOKIE, session.token, cookieOptions(ctx, lifetimeSec));
  if (session.role === 'admin') {
    setActivity(c, ctx, session.tokenHash, now);
  } else {
    deleteCookie(c, ACTIVITY_COOKIE, { path: '/' });
  }
}

function setDeviceCookie(c: AppCtx, ctx: AppContext, token: string): void {
  setCookie(c, DEVICE_COOKIE, token, cookieOptions(ctx, DEVICE_COOKIE_MAX_AGE_SEC));
}

/** Login endpoints answer a throttled attempt with 429 and `Retry-After`. */
async function withRetryAfter(c: AppCtx, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ThrottledError) {
      c.header('Retry-After', String(err.retryAfterSec));
      return c.json(errorBody(err.code, err.message, err.details), 429);
    }
    throw err;
  }
}

/**
 * Turns the session cookie into the request actor. Admin sessions additionally need a fresh,
 * correctly signed activity cookie (idle timeout), which is re-issued on every request.
 * Nothing here writes to the database.
 */
export function authMiddleware(ctx: AppContext): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    const resolved = token ? ctx.auth.resolveSession(token) : null;
    if (resolved && resolved.session.role === 'learner') {
      c.set('actor', { role: 'learner', id: resolved.user.id });
    } else if (resolved) {
      const now = Date.now();
      const stamp = getCookie(c, ACTIVITY_COOKIE);
      const lastActive = stamp
        ? readActivity(ctx.auth.activityKey, resolved.tokenHash, stamp)
        : null;
      const idleMs = ctx.settings.get('session.adminIdleMinutes') * 60_000;
      if (lastActive !== null && lastActive <= now + CLOCK_SKEW_MS && now - lastActive <= idleMs) {
        c.set('actor', { role: 'admin', id: resolved.user.id });
        setActivity(c, ctx, resolved.tokenHash, now);
      }
    }
    await next();
  };
}

const idParams = z.object({ id: z.coerce.number().int().positive() });

export function authRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'GET',
      path: '/api/setup',
      roles: ['public'],
      handler: (c) => c.json({ needed: ctx.auth.setupNeeded() }),
    }),
    route({
      method: 'POST',
      path: '/api/setup',
      roles: ['public'],
      handler: (c) =>
        withRetryAfter(c, async () => {
          const input = await readJson(c, setupRequestSchema);
          const previous = getCookie(c, SESSION_COOKIE);
          const session = await ctx.auth.completeSetup(input, clientIp(c), previous);
          issueSession(c, ctx, session);
          return c.json(session.user, 201);
        }),
    }),
    route({
      method: 'POST',
      path: '/api/auth/login',
      roles: ['public'],
      handler: (c) =>
        withRetryAfter(c, async () => {
          const { login, password } = await readJson(c, adminLoginRequestSchema);
          const previous = getCookie(c, SESSION_COOKIE);
          const session = await ctx.auth.loginAdmin(login, password, clientIp(c), previous);
          issueSession(c, ctx, session);
          return c.json(session.user);
        }),
    }),
    route({
      method: 'POST',
      path: '/api/auth/learner-login',
      roles: ['public'],
      handler: (c) =>
        withRetryAfter(c, async () => {
          const { userId, pin } = await readJson(c, learnerLoginRequestSchema);
          const device = getCookie(c, DEVICE_COOKIE);
          const previous = getCookie(c, SESSION_COOKIE);
          const session = await ctx.auth.loginLearner(userId, pin, device, clientIp(c), previous);
          issueSession(c, ctx, session);
          return c.json(session.user);
        }),
    }),
    route({
      method: 'POST',
      path: '/api/auth/logout',
      roles: ['admin', 'learner'],
      handler: (c) => {
        const token = getCookie(c, SESSION_COOKIE);
        if (token) {
          ctx.auth.logout(token);
        }
        deleteCookie(c, SESSION_COOKIE, { path: '/' });
        deleteCookie(c, ACTIVITY_COOKIE, { path: '/' });
        return c.body(null, 204);
      },
    }),
    route({
      method: 'GET',
      path: '/api/auth/me',
      roles: ['admin', 'learner'],
      handler: (c) => c.json(ctx.auth.me(c.get('actor')?.id ?? 0)),
    }),
    route({
      method: 'PUT',
      path: '/api/me/password',
      roles: ['admin'],
      handler: (c) =>
        withRetryAfter(c, async () => {
          const input = await readJson(c, passwordChangeRequestSchema);
          const token = getCookie(c, SESSION_COOKIE);
          await ctx.auth.changePassword(c.get('actor')?.id ?? 0, input, clientIp(c), token);
          return c.body(null, 204);
        }),
    }),
    route({
      method: 'GET',
      path: '/api/auth/profiles',
      roles: ['public'],
      handler: (c) => {
        const device = getCookie(c, DEVICE_COOKIE);
        const profiles = ctx.auth.profiles(device);
        if (device) {
          setDeviceCookie(c, ctx, device);
        }
        return c.json(profiles);
      },
    }),
    route({
      method: 'GET',
      path: '/api/auth/devices',
      roles: ['admin'],
      handler: (c) => c.json(ctx.auth.listDevices(getCookie(c, DEVICE_COOKIE))),
    }),
    route({
      method: 'POST',
      path: '/api/auth/devices',
      roles: ['admin'],
      handler: async (c) => {
        const { name } = await readJson(c, deviceCreateRequestSchema);
        const actorId = c.get('actor')?.id ?? 0;
        const { token, device } = ctx.auth.trustDevice(name, actorId, getCookie(c, DEVICE_COOKIE));
        setDeviceCookie(c, ctx, token);
        return c.json(device, 201);
      },
    }),
    route({
      method: 'DELETE',
      path: '/api/auth/devices/:id',
      roles: ['admin'],
      handler: (c) => {
        const { id } = readParams(c, idParams);
        const actorId = c.get('actor')?.id ?? 0;
        return c.json(ctx.auth.revokeDevice(id, actorId, getCookie(c, DEVICE_COOKIE)));
      },
    }),
  ];
}
