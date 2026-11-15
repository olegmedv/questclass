import { RETRY_REQUEST_STATUSES, retryGrantRequestSchema } from '@questclass/shared/attempts/dto';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../../app';
import { unauthorized } from '../../http/errors';
import { route, type AppEnv, type RouteDef } from '../../http/route';
import { readJson, readParams, readQuery } from '../../http/validate';

const id = z.coerce.number().int().positive();
const taskParams = z.object({ taskId: id });
const attemptParams = z.object({ id });
const answerParams = z.object({ id, questionId: id });
const learnerParams = z.object({ id });
const attemptsQuery = z.object({ taskId: id.optional() });
const requestsQuery = z.object({ status: z.enum(RETRY_REQUEST_STATUSES).optional() });
/** The type validates the body itself (`submissionSchema`). */
const anyJson = z.unknown();

const actorOf = (c: Context<AppEnv>): number | null => c.get('actor')?.id ?? null;

function learnerOf(c: Context<AppEnv>): number {
  const actor = c.get('actor');
  if (actor?.role !== 'learner') {
    throw unauthorized();
  }
  return actor.id;
}

/** Attempts at the questions of a task, and retries. */
export function attemptsRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'POST',
      path: '/api/tasks/:taskId/attempts',
      roles: ['learner'],
      handler: (c) => {
        const { taskId } = readParams(c, taskParams);
        const { attempt, created } = ctx.attempts.start(learnerOf(c), taskId);
        return c.json(attempt, created ? 201 : 200);
      },
    }),
    route({
      method: 'GET',
      path: '/api/attempts/:id',
      roles: ['learner'],
      handler: (c) => c.json(ctx.attempts.get(learnerOf(c), readParams(c, attemptParams).id)),
    }),
    route({
      method: 'PUT',
      path: '/api/attempts/:id/answers/:questionId',
      roles: ['learner'],
      handler: async (c) => {
        const params = readParams(c, answerParams);
        const body = await readJson(c, anyJson);
        return c.json(ctx.attempts.answer(learnerOf(c), params.id, params.questionId, body));
      },
    }),
    route({
      method: 'POST',
      path: '/api/attempts/:id/completion',
      roles: ['learner'],
      handler: (c) => c.json(ctx.attempts.finish(learnerOf(c), readParams(c, attemptParams).id)),
    }),
    route({
      method: 'POST',
      path: '/api/tasks/:taskId/retry-requests',
      roles: ['learner'],
      handler: (c) => {
        const { taskId } = readParams(c, taskParams);
        const { request, created } = ctx.attempts.requestRetry(learnerOf(c), taskId);
        return c.json(request, created ? 201 : 200);
      },
    }),
    route({
      method: 'GET',
      path: '/api/admin/attempts/:id',
      roles: ['admin'],
      handler: (c) => c.json(ctx.attempts.adminGet(readParams(c, attemptParams).id)),
    }),
    route({
      method: 'GET',
      path: '/api/admin/learners/:id/attempts',
      roles: ['admin'],
      handler: (c) => {
        const { id: learnerId } = readParams(c, learnerParams);
        return c.json(ctx.attempts.listForLearner(learnerId, readQuery(c, attemptsQuery)));
      },
    }),
    route({
      method: 'GET',
      path: '/api/admin/retry-requests',
      roles: ['admin'],
      handler: (c) => c.json(ctx.attempts.retryRequests(readQuery(c, requestsQuery).status)),
    }),
    route({
      method: 'POST',
      path: '/api/admin/retry-grants',
      roles: ['admin'],
      handler: async (c) => {
        const { learnerId, taskId } = await readJson(c, retryGrantRequestSchema);
        const { grant, created } = ctx.attempts.grantRetry(learnerId, taskId, actorOf(c));
        return c.json(grant, created ? 201 : 200);
      },
    }),
  ];
}
