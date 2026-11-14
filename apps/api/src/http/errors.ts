import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';

/** Body of every error response: `{ error: { code, message, details? } }`. */
export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** An expected failure that maps to an HTTP status and a stable machine-readable code. */
export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new HttpError(400, code, message, details);
export const unauthorized = (message = 'Нужно войти') =>
  new HttpError(401, 'unauthenticated', message);
export const forbidden = (message = 'Нет доступа', code = 'forbidden') =>
  new HttpError(403, code, message);
export const notFound = (message = 'Не найдено') => new HttpError(404, 'not_found', message);
export const conflict = (code: string, message: string, details?: unknown) =>
  new HttpError(409, code, message, details);

export function errorBody(code: string, message: string, details?: unknown): ErrorBody {
  return details === undefined
    ? { error: { code, message } }
    : { error: { code, message, details } };
}

export function errorResponse(c: Context, err: HttpError): Response {
  return c.json(errorBody(err.code, err.message, err.details), err.status);
}

/** Converts zod issues into a compact, client-friendly list. */
export function zodDetails(err: ZodError): { path: string; message: string }[] {
  return err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

/** Global error handler: never leaks internals, always answers with the error JSON shape. */
export function handleError(err: unknown, c: Context): Response {
  if (err instanceof HttpError) {
    return errorResponse(c, err);
  }
  if (err instanceof ZodError) {
    return c.json(errorBody('validation_failed', 'Некорректные данные', zodDetails(err)), 400);
  }
  if (err instanceof HTTPException) {
    const code = err.status === 413 ? 'payload_too_large' : 'http_error';
    return c.json(errorBody(code, err.message || 'Ошибка запроса'), err.status);
  }
  console.error('Unhandled error', err);
  return c.json(errorBody('internal_error', 'Внутренняя ошибка сервера'), 500);
}

export function handleNotFound(c: Context): Response {
  return c.json(errorBody('not_found', 'Не найдено'), 404);
}
