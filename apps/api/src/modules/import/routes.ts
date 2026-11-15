import {
  MAX_CHUNK_BYTES,
  REVISION_STATUSES,
  importTokenCreateSchema,
  lessonManifestSchema,
  mediaCompletionSchema,
} from '@questclass/shared/import/manifest';
import type { Context, MiddlewareHandler } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../../app';
import { unauthorized } from '../../http/errors';
import { route, type AppEnv, type RouteDef } from '../../http/route';
import { readJson, readParams, readQuery } from '../../http/validate';

/** A lesson manifest carries the question bank and the transcript. */
const MANIFEST_BODY_LIMIT = 4 * 1024 * 1024;
const PREFIX_SEGMENTS = 6; // '', 'api', 'import', 'media', ':id', 'files'

const id = z.coerce.number().int().positive();
const idParams = z.object({ id });
const offsetQuery = z.object({ offset: z.coerce.number().int().min(0) });
const revisionsQuery = z.object({ status: z.enum(REVISION_STATUSES).optional() });

const actorOf = (c: Context<AppEnv>): number | null => c.get('actor')?.id ?? null;

function tokenOf(c: Context<AppEnv>): number {
  const actor = c.get('actor');
  if (actor?.role !== 'import') {
    throw unauthorized();
  }
  return actor.id;
}

/** The file part of `/api/import/media/:id/files/<path>`, still percent-encoded (see safePath). */
function rawFilePath(url: string): string {
  return new URL(url).pathname.split('/').slice(PREFIX_SEGMENTS).join('/');
}

/**
 * `Authorization: Bearer <import token>` → actor with role `import` (when the request has no
 * session). An unknown or revoked token leaves the request anonymous. Read-only.
 */
export function importTokenMiddleware(ctx: AppContext): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header('authorization');
    if (c.get('actor') === null && header?.startsWith('Bearer ')) {
      const tokenId = ctx.imports.resolveToken(header.slice('Bearer '.length).trim());
      if (tokenId !== null) {
        c.set('actor', { role: 'import', id: tokenId });
      }
    }
    await next();
  };
}

/** Import tokens and revisions (admin); lesson packages and chunked uploads (import token). */
export function importRoutes(ctx: AppContext): RouteDef[] {
  return [
    // tokens
    route({
      method: 'GET',
      path: '/api/admin/import-tokens',
      roles: ['admin'],
      handler: (c) => c.json(ctx.imports.listTokens()),
    }),
    route({
      method: 'POST',
      path: '/api/admin/import-tokens',
      roles: ['admin'],
      handler: async (c) => {
        const { name } = await readJson(c, importTokenCreateSchema);
        return c.json(ctx.imports.createToken(name, actorOf(c)), 201);
      },
    }),
    route({
      method: 'DELETE',
      path: '/api/admin/import-tokens/:id',
      roles: ['admin'],
      handler: (c) => {
        ctx.imports.revokeToken(readParams(c, idParams).id, actorOf(c));
        return c.body(null, 204);
      },
    }),

    // lesson packages
    route({
      method: 'POST',
      path: '/api/import/lessons',
      roles: ['import'],
      bodyLimit: MANIFEST_BODY_LIMIT,
      handler: async (c) => {
        const tokenId = tokenOf(c);
        const manifest = await readJson(c, lessonManifestSchema);
        const result = await ctx.imports.importLesson(manifest, tokenId);
        return c.json(result, result.outcome === 'created' ? 201 : 200);
      },
    }),
    route({
      method: 'GET',
      path: '/api/import/media/:id',
      roles: ['import'],
      handler: async (c) => c.json(await ctx.imports.mediaStatus(readParams(c, idParams).id)),
    }),
    route({
      method: 'PUT',
      path: '/api/import/media/:id/files/*',
      roles: ['import'],
      bodyLimit: MAX_CHUNK_BYTES,
      handler: async (c) => {
        const { id: mediaId } = readParams(c, idParams);
        const { offset } = readQuery(c, offsetQuery);
        const result = await ctx.imports.putChunk(
          mediaId,
          rawFilePath(c.req.url),
          offset,
          c.req.raw.body,
        );
        return c.json(result);
      },
    }),
    route({
      method: 'POST',
      path: '/api/import/media/:id/completion',
      roles: ['import'],
      handler: async (c) => {
        const { id: mediaId } = readParams(c, idParams);
        const input = await readJson(c, mediaCompletionSchema);
        return c.json(await ctx.imports.completeMedia(mediaId, input));
      },
    }),

    // revisions of published tasks
    route({
      method: 'GET',
      path: '/api/admin/task-revisions',
      roles: ['admin'],
      handler: (c) => c.json(ctx.imports.listRevisions(readQuery(c, revisionsQuery).status)),
    }),
    route({
      method: 'GET',
      path: '/api/admin/task-revisions/:id',
      roles: ['admin'],
      handler: (c) => c.json(ctx.imports.getRevision(readParams(c, idParams).id)),
    }),
    route({
      method: 'POST',
      path: '/api/admin/task-revisions/:id/acceptance',
      roles: ['admin'],
      handler: (c) => c.json(ctx.imports.acceptRevision(readParams(c, idParams).id, actorOf(c))),
    }),
    route({
      method: 'POST',
      path: '/api/admin/task-revisions/:id/rejection',
      roles: ['admin'],
      handler: (c) => c.json(ctx.imports.rejectRevision(readParams(c, idParams).id, actorOf(c))),
    }),
  ];
}
