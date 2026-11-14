// @vitest-environment jsdom
// FEAT-024: the API client and the auth queries built on it.
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api/client';
import {
  authKeys,
  fetchMe,
  fetchProfiles,
  useAdminLogin,
  useLogout,
} from '../src/api/queries/auth';
import { createQueryClient, Providers } from '../src/app/providers';
import { admin, errorReply, learner, mockApi } from './helpers';

describe('api()', () => {
  it('sends JSON with the session cookie and parses the answer', async () => {
    const { calls, fetchMock } = mockApi({ 'POST /api/things': { status: 201, body: { id: 5 } } });
    await expect(api('/api/things', { method: 'POST', json: { a: 1 } })).resolves.toEqual({
      id: 5,
    });
    expect(calls).toEqual([{ method: 'POST', path: '/api/things', body: { a: 1 } }]);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.credentials).toBe('same-origin');
    expect(init?.headers).toMatchObject({ 'content-type': 'application/json' });
  });

  it('resolves 204 with undefined', async () => {
    mockApi({ 'POST /api/auth/logout': { status: 204 } });
    await expect(api('/api/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('turns the error body into an ApiError', async () => {
    mockApi({
      'POST /api/auth/login': errorReply(429, 'too_many_attempts', 'Слишком много попыток', {
        retryAfterSec: 8,
      }),
    });
    const error = await api('/api/auth/login', { method: 'POST', json: {} }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: 'too_many_attempts' });
    expect((error as ApiError).message).toBe('Слишком много попыток');
    expect((error as ApiError).retryAfterSec).toBe(8);
  });

  it('copes with a non-JSON error page', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(new Response('<html>Bad gateway', { status: 502 })),
    );
    await expect(api('/api/health')).rejects.toMatchObject({ status: 502, code: 'http_error' });
  });

  it('reports a network failure as status 0', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(api('/api/health')).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });
});

describe('auth queries', () => {
  it('fetchMe answers null without a session', async () => {
    mockApi({ 'GET /api/auth/me': errorReply(401, 'unauthenticated') });
    await expect(fetchMe()).resolves.toBeNull();
  });

  it('fetchMe rethrows other errors', async () => {
    mockApi({ 'GET /api/auth/me': errorReply(500, 'internal_error') });
    await expect(fetchMe()).rejects.toMatchObject({ status: 500 });
  });

  it('fetchProfiles answers null on an untrusted device', async () => {
    mockApi({ 'GET /api/auth/profiles': errorReply(403, 'device_not_trusted') });
    await expect(fetchProfiles()).resolves.toBeNull();
  });

  it('login stores the user and logout clears it', async () => {
    mockApi({
      'POST /api/auth/login': { body: admin },
      'POST /api/auth/logout': { status: 204 },
    });
    const client = createQueryClient();
    client.setQueryData(['wallet'], { coins: 1 });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Providers client={client}>{children}</Providers>
    );
    const login = renderHook(() => useAdminLogin(), { wrapper });
    await act(() => login.result.current.mutateAsync({ login: 'mama', password: 'secret-123' }));
    expect(client.getQueryData(authKeys.me)).toEqual(admin);
    expect(client.getQueryData(['wallet'])).toBeUndefined();

    const logout = renderHook(() => useLogout(), { wrapper });
    await act(() => logout.result.current.mutateAsync());
    await waitFor(() => expect(client.getQueryData(authKeys.me)).toBeNull());
  });

  it('a wrong password does not end the current session', async () => {
    mockApi({ 'POST /api/auth/login': errorReply(401, 'invalid_credentials', 'Неверный логин') });
    const client = createQueryClient();
    client.setQueryData(authKeys.me, learner);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Providers client={client}>{children}</Providers>
    );
    const login = renderHook(() => useAdminLogin(), { wrapper });
    await act(async () => {
      await login.result.current
        .mutateAsync({ login: 'mama', password: 'nope' })
        .catch(() => undefined);
    });
    expect(client.getQueryData(authKeys.me)).toEqual(learner);
  });
});
