// @vitest-environment jsdom
// FEAT-056: «Профиль» — the admin changes their own password: the fields are checked first, the
// server's refusals land at their field, success clears the form.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { admin, errorReply, mockApi, renderRoute, sessionApi } from './helpers';

async function fill(current: string, next: string, repeat = next) {
  const form = await screen.findByRole('form', { name: 'Сменить пароль' });
  await userEvent.type(within(form).getByLabelText(/Текущий пароль/), current);
  await userEvent.type(within(form).getByLabelText(/^Новый пароль\s*\*?$/), next);
  await userEvent.type(within(form).getByLabelText(/Новый пароль ещё раз/), repeat);
  await userEvent.click(within(form).getByRole('button', { name: 'Сменить пароль' }));
  return form;
}

describe('/admin/profile', () => {
  it('changes the password with the current one', async () => {
    const { calls } = mockApi(sessionApi(admin, { 'PUT /api/me/password': { status: 204 } }));
    renderRoute('/admin/profile');
    const form = await fill('old-password', 'new-password-1');
    expect(await screen.findByText(/Пароль изменён/)).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
      current: 'old-password',
      next: 'new-password-1',
    });
    await waitFor(() => expect(within(form).getByLabelText(/Текущий пароль/)).toHaveValue(''));
  });

  it('checks the new password and its repeat before sending', async () => {
    const { calls } = mockApi(sessionApi(admin));
    renderRoute('/admin/profile');
    const form = await fill('old-password', 'short', 'other');
    expect(within(form).getByLabelText(/^Новый пароль\s*\*?$/)).toHaveAccessibleDescription(
      expect.stringContaining('Пароль не короче 8 символов'),
    );
    expect(within(form).getByLabelText(/Новый пароль ещё раз/)).toHaveAccessibleDescription(
      'Пароли не совпадают',
    );
    expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(0);
  });

  it('a wrong current password is shown at its field; throttling as a message', async () => {
    let tries = 0;
    mockApi(
      sessionApi(admin, {
        'PUT /api/me/password': () =>
          tries++ === 0
            ? errorReply(403, 'invalid_password', 'Текущий пароль не подходит')
            : errorReply(429, 'too_many_attempts', 'Слишком много попыток. Попробуйте позже', {
                retryAfterSec: 120,
              }),
      }),
    );
    renderRoute('/admin/profile');
    const form = await fill('wrong-password', 'new-password-1');
    await waitFor(() =>
      expect(within(form).getByLabelText(/Текущий пароль/)).toHaveAccessibleDescription(
        'Текущий пароль не подходит',
      ),
    );
    await userEvent.click(within(form).getByRole('button', { name: 'Сменить пароль' }));
    expect(
      await within(form).findByText('Слишком много попыток. Попробуйте позже: через 2 мин.'),
    ).toBeInTheDocument();
  });
});
