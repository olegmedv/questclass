import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { errorBody } from './errors';

/** Default request body limit: 1 MB. Routes that accept files declare their own. */
export const DEFAULT_BODY_LIMIT = 1024 * 1024;

/** Body size guard answering 413 with the common error JSON. */
export function limitBody(maxSize: number = DEFAULT_BODY_LIMIT): MiddlewareHandler {
  return bodyLimit({
    maxSize,
    onError: (c) => c.json(errorBody('payload_too_large', 'Слишком большой запрос'), 413),
  });
}
