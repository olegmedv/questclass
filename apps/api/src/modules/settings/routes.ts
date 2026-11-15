import type { Context } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../../app';
import { route, type AppEnv, type RouteDef } from '../../http/route';
import { readJson, readParams } from '../../http/validate';

/** `{ "<setting key>": <value>, … }`: only the listed keys change. */
const settingsUpdateSchema = z
  .record(z.string().min(1).max(100), z.unknown())
  .refine((values) => Object.keys(values).length > 0, 'Нечего сохранять');

const secretParams = z.object({ key: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/) });
const secretUpdateSchema = z.object({ value: z.string() });

const actorOf = (c: Context<AppEnv>): number | null => c.get('actor')?.id ?? null;

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Admin settings ("Настройки"). Labels and field types come from the shared registry, so the
 * API carries values only. Secrets are write-only: their value is never returned.
 */
export function settingsRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'GET',
      path: '/api/admin/settings',
      roles: ['admin'],
      handler: (c) => c.json(ctx.settings.list()),
    }),
    route({
      method: 'PUT',
      path: '/api/admin/settings',
      roles: ['admin'],
      handler: async (c) => {
        const values = await readJson(c, settingsUpdateSchema);
        const actorId = actorOf(c);
        const current = new Map(ctx.settings.list().map((entry) => [entry.key, entry.value]));
        // All keys or none: a single invalid value rolls the whole form back.
        ctx.db.transaction(() => {
          for (const [key, value] of Object.entries(values)) {
            if (current.has(key) && sameValue(current.get(key), value)) {
              continue; // unchanged fields of the form are not re-saved or audited
            }
            ctx.settings.set(key, value, actorId);
          }
        });
        return c.json(ctx.settings.list());
      },
    }),
    route({
      method: 'GET',
      path: '/api/admin/secrets',
      roles: ['admin'],
      handler: (c) => c.json(ctx.settings.listSecrets()),
    }),
    route({
      method: 'PUT',
      path: '/api/admin/secrets/:key',
      roles: ['admin'],
      handler: async (c) => {
        const { key } = readParams(c, secretParams);
        const { value } = await readJson(c, secretUpdateSchema);
        return c.json(ctx.settings.setSecret(key, value, actorOf(c)));
      },
    }),
    route({
      method: 'DELETE',
      path: '/api/admin/secrets/:key',
      roles: ['admin'],
      handler: (c) => {
        const { key } = readParams(c, secretParams);
        return c.json(ctx.settings.clearSecret(key, actorOf(c)));
      },
    }),
  ];
}
