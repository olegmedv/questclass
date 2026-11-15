import type { Context } from 'hono';
import type { z } from 'zod';
import { badRequest, zodDetails } from './errors';

function parseWith<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest('validation_failed', 'Некорректные данные', zodDetails(result.error));
  }
  return result.data;
}

/** Parses and validates a JSON request body; malformed JSON and schema errors → 400. */
export async function readJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let data: unknown;
  try {
    data = await c.req.json();
  } catch {
    throw badRequest('invalid_json', 'Тело запроса должно быть JSON');
  }
  return parseWith(schema, data);
}

/** Validates the query string (single values per key). */
export function readQuery<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  return parseWith(schema, c.req.query());
}

/** Validates path parameters. */
export function readParams<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  return parseWith(schema, c.req.param());
}
