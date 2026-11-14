// Test helpers: a fake API behind `fetch` and the real route table in a memory router.
import type { MeDto } from '@questclass/shared/auth/dto';
import type { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { vi } from 'vitest';
import { createQueryClient, Providers } from '../src/app/providers';
import { routes as appRoutes } from '../src/app/router';

export interface MockReply {
  readonly status?: number;
  readonly body?: unknown;
}

/** `"<METHOD> <path>"` → reply, or a function of the parsed JSON body. */
export type ApiTable = Record<string, MockReply | ((body: unknown) => MockReply)>;

export interface ApiCall {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

export const errorReply = (status: number, code: string, message = code, details?: unknown) => ({
  status,
  body: { error: { code, message, ...(details !== undefined && { details }) } },
});

/** Replaces `fetch` with a table-driven fake API; unknown endpoints answer 404. */
export function mockApi(table: ApiTable) {
  const calls: ApiCall[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ method, path: url.pathname + url.search, body });
    const entry = table[`${method} ${url.pathname}`];
    const reply: MockReply = !entry
      ? errorReply(404, 'not_found', 'Не найдено')
      : typeof entry === 'function'
        ? entry(body)
        : entry;
    const status = reply.status ?? 200;
    return Promise.resolve(
      new Response(status === 204 ? null : JSON.stringify(reply.body ?? null), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

export const learner: MeDto = { id: 2, role: 'learner', name: 'Саша', avatar: null };
export const admin: MeDto = { id: 1, role: 'admin', name: 'Мама', avatar: null };

/** The usual answers of a set-up installation for a given session (null = anonymous). */
export function sessionApi(me: MeDto | null, extra: ApiTable = {}): ApiTable {
  return {
    'GET /api/setup': { body: { needed: false } },
    'GET /api/auth/me': me ? { body: me } : errorReply(401, 'unauthenticated', 'Нужно войти'),
    ...extra,
  };
}

export function renderWithProviders(ui: ReactElement, client: QueryClient = createQueryClient()) {
  return { client, ...render(<Providers client={client}>{ui}</Providers>) };
}

/** A query client like the app's, but without retries (server errors surface at once). */
export function noRetryClient(): QueryClient {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });
  return client;
}

/** Renders the app's real routes (or given ones) at `path`. */
export function renderRoute(
  path: string,
  { routes = appRoutes, client }: { routes?: RouteObject[]; client?: QueryClient } = {},
) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return { router, ...renderWithProviders(<RouterProvider router={router} />, client) };
}
