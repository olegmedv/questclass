// @vitest-environment jsdom
// FEAT-028: setup with the token, admin login, the untrusted-device message, profile picker and
// PIN, the retry countdown after throttling, and «Сделать устройство детским».
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { afterLoginPath, formatWait } from '../src/screens/auth/common';
import { admin, errorReply, learner, mockApi, renderRoute, sessionApi } from './helpers';

const profiles = [
  { id: 2, name: 'Саша', avatar: null },
  { id: 3, name: 'Маша', avatar: null },
];

afterEach(() => {
  vi.useRealTimers();
});

describe('/setup', () => {
  it('creates the first admin with the token and opens the device screen', async () => {
    const { calls } = mockApi({
      'GET /api/setup': { body: { needed: true } },
      'POST /api/setup': { status: 201, body: admin },
      'GET /api/auth/me': { body: admin },
      'GET /api/auth/devices': { body: [] },
    });
    const { router } = renderRoute('/setup');
    expect(await screen.findByRole('heading', { level: 1, name: 'Первый запуск' })).toBeVisible();
    await userEvent.type(screen.getByLabelText(/Код установки/), ' abc123 ');
    await userEvent.type(screen.getByLabelText('Как к вам обращаться'), 'Мама');
    await userEvent.type(screen.getByLabelText(/Логин/), 'Mama');
    await userEvent.type(screen.getByLabelText(/Пароль/), 'secret-pass');
    await userEvent.click(screen.getByRole('button', { name: 'Создать и войти' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/device'));
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      token: 'abc123',
      login: 'mama',
      password: 'secret-pass',
      name: 'Мама',
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Устройства' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Учётная запись создана/)).toBeInTheDocument();
  });

  it('checks the fields before sending', async () => {
    const { calls } = mockApi({ 'GET /api/setup': { body: { needed: true } } });
    renderRoute('/setup');
    await screen.findByRole('heading', { level: 1, name: 'Первый запуск' });
    await userEvent.type(screen.getByLabelText(/Логин/), 'a!');
    await userEvent.type(screen.getByLabelText(/Пароль/), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Создать и войти' }));
    expect(screen.getByLabelText(/Код установки/)).toHaveAccessibleDescription(
      expect.stringContaining('Введите код установки'),
    );
    expect(screen.getByLabelText(/Логин/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/Пароль/)).toHaveAccessibleDescription(
      expect.stringContaining('Пароль не короче 8 символов'),
    );
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
  });

  it('a wrong token is shown at the token field', async () => {
    mockApi({
      'GET /api/setup': { body: { needed: true } },
      'POST /api/setup': errorReply(403, 'invalid_setup_token', 'Неверный код установки'),
    });
    renderRoute('/setup');
    await screen.findByRole('heading', { level: 1, name: 'Первый запуск' });
    await userEvent.type(screen.getByLabelText(/Код установки/), 'nope');
    await userEvent.type(screen.getByLabelText(/Логин/), 'mama');
    await userEvent.type(screen.getByLabelText(/Пароль/), 'secret-pass');
    await userEvent.click(screen.getByRole('button', { name: 'Создать и войти' }));
    expect(await screen.findByText(/Код не подходит/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Код установки/)).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('admin login', () => {
  it('signs in and returns to the page that asked for it', async () => {
    let signedIn = false;
    mockApi({
      'GET /api/setup': { body: { needed: false } },
      'GET /api/auth/me': () =>
        signedIn ? { body: admin } : errorReply(401, 'unauthenticated', 'Нужно войти'),
      'POST /api/auth/login': () => {
        signedIn = true;
        return { body: admin };
      },
      'GET /api/auth/devices': { body: [] },
    });
    const { router } = renderRoute('/admin/device');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    await router.navigate('/login?as=admin', { state: router.state.location.state });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Вход для родителя' }),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Логин'), 'mama');
    await userEvent.type(screen.getByLabelText('Пароль'), 'secret-pass');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/device'));
  });

  it('a wrong password says so and clears the password', async () => {
    mockApi({
      ...sessionApi(null),
      'POST /api/auth/login': errorReply(401, 'invalid_credentials', 'Неверный логин или пароль'),
    });
    renderRoute('/login?as=admin');
    await screen.findByRole('heading', { level: 1, name: 'Вход для родителя' });
    await userEvent.type(screen.getByLabelText('Логин'), 'mama');
    await userEvent.type(screen.getByLabelText('Пароль'), 'wrong-pass');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный логин или пароль');
    expect(screen.getByLabelText('Пароль')).toHaveValue('');
  });

  it('after too many attempts shows the time until the next one and blocks the button', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockApi({
      ...sessionApi(null),
      'POST /api/auth/login': errorReply(429, 'too_many_attempts', 'Слишком много попыток', {
        retryAfterSec: 3,
      }),
    });
    renderRoute('/login?as=admin');
    await screen.findByRole('heading', { level: 1, name: 'Вход для родителя' });
    await userEvent.type(screen.getByLabelText('Логин'), 'mama');
    await userEvent.type(screen.getByLabelText('Пароль'), 'wrong-pass');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Попробуйте через 3 с');
    expect(screen.getByRole('button', { name: 'Войти' })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Попробуйте через 2 с');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Войти' })).toBeEnabled();
  });
});

describe('learner login', () => {
  it('on an untrusted device asks a parent to switch it on', async () => {
    mockApi({
      ...sessionApi(null),
      'GET /api/auth/profiles': errorReply(403, 'device_not_trusted', 'Попросите родителя'),
    });
    renderRoute('/login');
    expect(
      await screen.findByRole('heading', { name: 'Попросите родителя включить это устройство' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Я родитель' })).toHaveAttribute(
      'href',
      '/login?as=admin',
    );
  });

  it('a trusted device without learners says so', async () => {
    mockApi({ ...sessionApi(null), 'GET /api/auth/profiles': { body: [] } });
    renderRoute('/login');
    expect(await screen.findByRole('heading', { name: 'Учеников пока нет' })).toBeInTheDocument();
  });

  it('pick a profile, type the PIN, land on the learner home', async () => {
    let signedIn = false;
    const { calls } = mockApi({
      'GET /api/setup': { body: { needed: false } },
      'GET /api/auth/me': () =>
        signedIn ? { body: learner } : errorReply(401, 'unauthenticated', 'Нужно войти'),
      'GET /api/auth/profiles': { body: profiles },
      'POST /api/auth/learner-login': () => {
        signedIn = true;
        return { body: learner };
      },
    });
    const { router } = renderRoute('/login');
    expect(await screen.findByRole('heading', { level: 1, name: 'Кто учится?' })).toBeVisible();
    const list = screen.getByRole('list', { name: 'Ученики' });
    expect(within(list).getAllByRole('button')).toHaveLength(2);
    await userEvent.click(within(list).getByRole('button', { name: /Саша/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Привет, Саша!' })).toBeVisible();
    const pad = screen.getByRole('group', { name: 'PIN ученика Саша' });
    for (const digit of ['2', '4', '6', '8']) {
      await userEvent.click(within(pad).getByRole('button', { name: digit }));
    }
    await userEvent.click(within(pad).getByRole('button', { name: 'Войти' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(calls.find((call) => call.path === '/api/auth/learner-login')?.body).toEqual({
      userId: 2,
      pin: '2468',
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Учёба' })).toBeInTheDocument();
  });

  it('a wrong PIN is announced and the pad is cleared; «Другой ученик» goes back', async () => {
    mockApi({
      ...sessionApi(null),
      'GET /api/auth/profiles': { body: profiles },
      'POST /api/auth/learner-login': errorReply(401, 'invalid_pin', 'Неверный PIN'),
    });
    renderRoute('/login');
    await userEvent.click(await screen.findByRole('button', { name: /Маша/ }));
    await userEvent.keyboard('1111{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный PIN');
    expect(screen.getByText('Введено цифр: 0')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Другой ученик' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Кто учится?' })).toBeVisible();
  });

  it('throttling shows the wait time and locks the pad', async () => {
    mockApi({
      ...sessionApi(null),
      'GET /api/auth/profiles': { body: profiles },
      'POST /api/auth/learner-login': errorReply(429, 'too_many_attempts', 'Слишком много', {
        retryAfterSec: 75,
      }),
    });
    renderRoute('/login');
    await userEvent.click(await screen.findByRole('button', { name: /Саша/ }));
    await userEvent.keyboard('1234{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Подожди 1:15');
    expect(screen.getByRole('button', { name: '5' })).toBeDisabled();
  });
});

describe('«Сделать устройство детским»', () => {
  it('trusts this device and then shows it as the children’s one', async () => {
    let devices: object[] = [];
    const { calls } = mockApi(
      sessionApi(admin, {
        'GET /api/auth/devices': () => ({ body: devices }),
        'POST /api/auth/devices': (body) => {
          const device = {
            id: 1,
            name: (body as { name: string }).name,
            createdAt: '2026-11-14T10:00:00.000Z',
            revokedAt: null,
            isCurrent: true,
          };
          devices = [device];
          return { status: 201, body: device };
        },
      }),
    );
    renderRoute('/admin/device');
    expect(await screen.findByRole('heading', { level: 1, name: 'Устройства' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Устройства' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const name = screen.getByLabelText('Название устройства');
    await userEvent.clear(name);
    await userEvent.type(name, 'Планшет Саши');
    await userEvent.click(screen.getByRole('button', { name: 'Сделать устройство детским' }));
    expect(await screen.findByText(/Это устройство — детское/)).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ name: 'Планшет Саши' });
    expect(screen.getByRole('cell', { name: 'Планшет Саши' })).toBeInTheDocument();
  });

  it('a device can be revoked after confirmation', async () => {
    let revoked = false;
    const device = (isRevoked: boolean) => ({
      id: 7,
      name: 'Старый телефон',
      createdAt: '2026-11-01T10:00:00.000Z',
      revokedAt: isRevoked ? '2026-11-14T10:00:00.000Z' : null,
      isCurrent: false,
    });
    const { calls } = mockApi(
      sessionApi(admin, {
        'GET /api/auth/devices': () => ({ body: [device(revoked)] }),
        'DELETE /api/auth/devices/7': () => {
          revoked = true;
          return { body: device(true) };
        },
      }),
    );
    renderRoute('/admin/device');
    await userEvent.click(await screen.findByRole('button', { name: 'Отозвать' }));
    const dialog = screen.getByRole('dialog', { name: 'Отозвать «Старый телефон»?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Отозвать' }));
    expect(await screen.findByText('Отозвано')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
  });
});

describe('helpers', () => {
  it('formatWait', () => {
    expect(formatWait(8)).toBe('8 с');
    expect(formatWait(75)).toBe('1:15');
    expect(formatWait(900)).toBe('15:00');
  });

  it('afterLoginPath returns only to pages of the same role', () => {
    expect(afterLoginPath('admin', { from: '/admin/device' })).toBe('/admin/device');
    expect(afterLoginPath('admin', { from: '/shop' })).toBe('/admin');
    expect(afterLoginPath('learner', { from: '/shop' })).toBe('/shop');
    expect(afterLoginPath('learner', { from: '/admin' })).toBe('/');
    expect(afterLoginPath('learner', null)).toBe('/');
    expect(afterLoginPath('admin', { from: '/login?as=admin' })).toBe('/admin');
  });
});
