// @vitest-environment jsdom
// FEAT-024: routes, role guards, 401 → login, 403 → «Нет доступа», setup redirect.
import { useQuery } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api/client';
import { authKeys } from '../src/api/queries/auth';
import { canOpenDevTools, QueryErrorView, RequireRole } from '../src/app/guards';
import { createQueryClient } from '../src/app/providers';
import {
  admin,
  errorReply,
  learner,
  mockApi,
  noRetryClient,
  renderRoute,
  renderWithProviders,
  sessionApi,
} from './helpers';

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

describe('routes', () => {
  it.each([
    ['/', 'Саша, начнём?'],
    ['/tasks/7', 'Задание не найдено'],
    ['/hero', 'Герой'],
    ['/shop', 'Магазин'],
    ['/rewards', 'Мои награды'],
  ])('learner opens %s', async (path, title) => {
    mockApi(sessionApi(learner));
    renderRoute(path);
    expect(await heading(title)).toBeInTheDocument();
  });

  it('admin opens /admin and nested admin paths', async () => {
    mockApi(sessionApi(admin));
    const { router } = renderRoute('/admin');
    expect(await heading('Кабинет родителя')).toBeInTheDocument();
    await router.navigate('/admin/unknown/page');
    expect(await heading('Такой страницы нет')).toBeInTheDocument();
  });

  it('unknown paths show «Такой страницы нет»', async () => {
    mockApi(sessionApi(learner));
    renderRoute('/no/such/page');
    expect(await heading('Такой страницы нет')).toBeInTheDocument();
  });
});

describe('guards', () => {
  it('anonymous user on a learner page gets the login screen', async () => {
    mockApi(sessionApi(null));
    const { router } = renderRoute('/shop');
    expect(await heading('Вход')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toEqual({ from: '/shop' });
  });

  it('anonymous user on an admin page gets the login screen', async () => {
    mockApi(sessionApi(null));
    renderRoute('/admin');
    expect(await heading('Вход')).toBeInTheDocument();
  });

  it('learner on an admin page sees «Нет доступа»', async () => {
    mockApi(sessionApi(learner));
    renderRoute('/admin');
    expect(await heading('Нет доступа')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Войти как родитель' })).toHaveAttribute(
      'href',
      '/login?as=admin',
    );
  });

  it('admin on a learner page is taken to the admin home', async () => {
    mockApi(sessionApi(admin));
    const { router } = renderRoute('/shop');
    expect(await heading('Кабинет родителя')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin');
  });

  it('every page leads to /setup until the first admin exists, and back', async () => {
    mockApi({ 'GET /api/setup': { body: { needed: true } } });
    const { router } = renderRoute('/shop');
    expect(await heading('Первый запуск')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/setup');

    mockApi(sessionApi(null));
    const second = renderRoute('/setup');
    await waitFor(() => expect(second.router.state.location.pathname).toBe('/login'));
  });

  it('a server failure of the setup check offers a retry', async () => {
    mockApi({ 'GET /api/setup': errorReply(503, 'unavailable', 'Сервер недоступен') });
    renderRoute('/', { client: noRetryClient() });
    expect(await heading('Не получилось загрузить')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });
});

describe('API errors on screens', () => {
  function renderError(error: unknown) {
    const router = createMemoryRouter(
      [
        { path: '/page', element: <QueryErrorView error={error} /> },
        { path: '/login', element: <h1>Вход</h1> },
      ],
      { initialEntries: ['/page'] },
    );
    return { router, ...renderWithProviders(<RouterProvider router={router} />) };
  }

  it('401 → login screen', async () => {
    renderError(new ApiError(401, 'unauthenticated', 'Нужно войти'));
    expect(await heading('Вход')).toBeInTheDocument();
  });

  it('403 → «Нет доступа»', async () => {
    renderError(new ApiError(403, 'forbidden', 'Нет доступа'));
    expect(await heading('Нет доступа')).toBeInTheDocument();
  });

  it('other errors show the message', async () => {
    renderError(new ApiError(500, 'internal_error', 'Внутренняя ошибка сервера'));
    expect(await heading('Не получилось загрузить')).toBeInTheDocument();
    expect(screen.getByText('Внутренняя ошибка сервера')).toBeInTheDocument();
  });

  it('a 401 from any query ends the session in the UI and shows the login screen', async () => {
    mockApi(
      sessionApi(learner, {
        'GET /api/me/wallet': errorReply(401, 'unauthenticated', 'Нужно войти'),
      }),
    );
    function Wallet() {
      const wallet = useQuery({ queryKey: ['wallet'], queryFn: () => api('/api/me/wallet') });
      return <h1>{wallet.isError ? 'ошибка' : 'Кошелёк'}</h1>;
    }
    const client = createQueryClient();
    const router = createMemoryRouter(
      [
        {
          element: <RequireRole role="learner" />,
          children: [{ path: '/', element: <Wallet /> }],
        },
        { path: '/login', element: <h1>Вход</h1> },
      ],
      { initialEntries: ['/'] },
    );
    renderWithProviders(<RouterProvider router={router} />, client);
    expect(await heading('Вход')).toBeInTheDocument();
    expect(client.getQueryData(authKeys.me)).toBeNull();
  });
});

describe('/dev/ui', () => {
  it('is open to everyone in development', async () => {
    mockApi(sessionApi(null));
    renderRoute('/dev/ui');
    expect(await heading('Галерея компонентов')).toBeInTheDocument();
  });

  it('in production needs an admin', async () => {
    vi.stubEnv('DEV', false);
    mockApi(sessionApi(learner));
    renderRoute('/dev/ui');
    expect(await heading('Нет доступа')).toBeInTheDocument();
  });

  it('in production an admin opens it', async () => {
    vi.stubEnv('DEV', false);
    mockApi(sessionApi(admin));
    renderRoute('/dev/ui');
    expect(await heading('Галерея компонентов')).toBeInTheDocument();
  });

  it('canOpenDevTools', () => {
    expect(canOpenDevTools(null, true)).toBe(true);
    expect(canOpenDevTools(null, false)).toBe(false);
    expect(canOpenDevTools(learner, false)).toBe(false);
    expect(canOpenDevTools(admin, false)).toBe(true);
  });
});
