import {
  questionContentSchema,
  questionCreateSchema,
  questionImportRequestSchema,
  questionKeySchema,
  transcriptCreateSchema,
} from '@questclass/shared/questions/schema';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../../app';
import { route, type AppEnv, type RouteDef } from '../../http/route';
import { readJson, readParams, readQuery } from '../../http/validate';

const taskParams = z.object({ taskId: z.coerce.number().int().positive() });
const questionParams = taskParams.extend({ key: questionKeySchema });
const listQuery = z.object({
  archived: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

/** A long transcript (an hour of subtitles) is a few hundred KB. */
const TRANSCRIPT_BODY_LIMIT = 4 * 1024 * 1024;

const actorOf = (c: Context<AppEnv>): number | null => c.get('actor')?.id ?? null;

/** Question banks (versioned) and transcripts of a task. Admin only: answers are included. */
export function questionsRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'GET',
      path: '/api/admin/tasks/:taskId/questions',
      roles: ['admin'],
      handler: (c) => {
        const { taskId } = readParams(c, taskParams);
        const { archived } = readQuery(c, listQuery);
        return c.json(ctx.questions.list(taskId, { includeArchived: archived ?? false }));
      },
    }),
    route({
      method: 'POST',
      path: '/api/admin/tasks/:taskId/questions',
      roles: ['admin'],
      handler: async (c) => {
        const { taskId } = readParams(c, taskParams);
        const input = await readJson(c, questionCreateSchema);
        return c.json(ctx.questions.create(taskId, input, actorOf(c)), 201);
      },
    }),
    route({
      method: 'GET',
      path: '/api/admin/tasks/:taskId/questions/:key/versions',
      roles: ['admin'],
      handler: (c) => {
        const { taskId, key } = readParams(c, questionParams);
        return c.json(ctx.questions.versions(taskId, key));
      },
    }),
    route({
      method: 'PUT',
      path: '/api/admin/tasks/:taskId/questions/:key',
      roles: ['admin'],
      handler: async (c) => {
        const { taskId, key } = readParams(c, questionParams);
        const input = await readJson(c, questionContentSchema);
        return c.json(ctx.questions.update(taskId, key, input, actorOf(c)));
      },
    }),
    route({
      method: 'DELETE',
      path: '/api/admin/tasks/:taskId/questions/:key',
      roles: ['admin'],
      handler: (c) => {
        const { taskId, key } = readParams(c, questionParams);
        ctx.questions.archive(taskId, key, actorOf(c));
        return c.body(null, 204);
      },
    }),
    route({
      method: 'POST',
      path: '/api/admin/tasks/:taskId/question-imports',
      roles: ['admin'],
      handler: async (c) => {
        const { taskId } = readParams(c, taskParams);
        const { content, append } = await readJson(c, questionImportRequestSchema);
        return c.json(ctx.questions.importText(taskId, content, { append }, actorOf(c)), 201);
      },
    }),
    route({
      method: 'GET',
      path: '/api/admin/tasks/:taskId/transcripts',
      roles: ['admin'],
      handler: (c) => c.json(ctx.questions.transcripts(readParams(c, taskParams).taskId)),
    }),
    route({
      method: 'POST',
      path: '/api/admin/tasks/:taskId/transcripts',
      roles: ['admin'],
      bodyLimit: TRANSCRIPT_BODY_LIMIT,
      handler: async (c) => {
        const { taskId } = readParams(c, taskParams);
        const input = await readJson(c, transcriptCreateSchema);
        return c.json(ctx.questions.addTranscript(taskId, input, actorOf(c)), 201);
      },
    }),
  ];
}
