import { z } from 'zod';
import type { AppContext } from '../../app';
import { route, type RouteDef } from '../../http/route';
import { readQuery } from '../../http/validate';
import { CURSOR_PATTERN, MAX_PAGE_SIZE } from './service';

/** An instant given as epoch milliseconds or an ISO 8601 date-time with offset. */
const instant = z.union([
  z
    .string()
    .regex(/^\d+$/)
    .transform((value) => Number(value)),
  z.iso.datetime({ offset: true }).transform((value) => Date.parse(value)),
]);

const auditQuerySchema = z.object({
  learnerId: z.coerce.number().int().positive().optional(),
  action: z.string().min(1).max(100).optional(),
  from: instant.optional(),
  to: instant.optional(),
  cursor: z.string().regex(CURSOR_PATTERN).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

export function auditRoutes(ctx: AppContext): RouteDef[] {
  return [
    route({
      method: 'GET',
      path: '/api/admin/audit',
      roles: ['admin'],
      handler: (c) => {
        return c.json(ctx.audit.list(readQuery(c, auditQuerySchema)));
      },
    }),
  ];
}
