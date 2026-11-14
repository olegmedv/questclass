// @vitest-environment jsdom
// FEAT-039: the settings form is built from the shared registry; secrets are write-only; an
// import token is shown once; users are created, changed and switched off (never deleted).
import type { UserDto } from '@questclass/shared/auth/dto';
import { SETTING_KEYS, SETTINGS } from '@questclass/shared/settings/registry';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { admin, errorReply, mockApi, renderRoute, sessionApi } from './helpers';

const settingsBody = SETTING_KEYS.map((key) => ({
  key,
  value: SETTINGS[key].default,
  default: SETTINGS[key].default,
  isDefault: true,
  updatedAt: null,
}));

describe('/admin/settings', () => {
  it('shows every registered setting with its label and the right control', async () => {
    mockApi(sessionApi(admin, { 'GET /api/admin/settings': { body: settingsBody } }));
    renderRoute('/admin/settings');
    expect(await screen.findByRole('heading', { level: 1, name: 'Настройки' })).toBeVisible();
    const form = await screen.findByRole('form', { name: 'Настройки' });
    for (const key of SETTING_KEYS) {
      expect(within(form).getByText(SETTINGS[key].label)).toBeInTheDocument();
    }
    // A whole number with its range, a choice with readable options, a list one per line.
    expect(screen.getByRole('textbox', { name: 'Тест: верных ответов для зачёта' })).toHaveValue(
      '2',
    );
    expect(
      screen.getByRole('textbox', { name: 'Тест: верных ответов для зачёта' }),
    ).toHaveAccessibleDescription(expect.stringContaining('Можно от 1 до 20'));
    const mode = screen.getByRole('combobox', { name: 'Как открываются задания' });
    expect(within(mode).getByRole('option', { name: 'По кругу предметов' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Круг предметов' })).toHaveValue(
      'russian\nmath\nworld\nreading',
    );
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });

  it('saves only the changed settings', async () => {
    const { calls } = mockApi(
      sessionApi(admin, {
        'GET /api/admin/settings': { body: settingsBody },
        'PUT /api/admin/settings': (body) => ({
          body: settingsBody.map((entry) =>
            entry.key in (body as object)
              ? { ...entry, value: (body as Record<string, unknown>)[entry.key], isDefault: false }
              : entry,
          ),
        }),
      }),
    );
    renderRoute('/admin/settings');
    const percent = await screen.findByRole('textbox', {
      name: 'Видео: сколько процентов нужно посмотреть',
    });
    await userEvent.clear(percent);
    await userEvent.type(percent, '80{Tab}');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Как открываются задания' }),
      'Все сразу',
    );
    const zone = screen.getByRole('textbox', { name: 'Часовой пояс' });
    await userEvent.clear(zone);
    await userEvent.type(zone, 'Europe/Moscow');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
      timezone: 'Europe/Moscow',
      'progress.unlockMode': 'all',
      'watch.minPercent': 80,
    });
    expect(await screen.findByText('Настройки сохранены')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });

  it('an invalid value is shown at its field and nothing is sent', async () => {
    const { calls } = mockApi(
      sessionApi(admin, { 'GET /api/admin/settings': { body: settingsBody } }),
    );
    renderRoute('/admin/settings');
    const zone = await screen.findByRole('textbox', { name: 'Часовой пояс' });
    await userEvent.clear(zone);
    await userEvent.type(zone, 'Mars/Olympus');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(zone).toHaveAccessibleDescription(expect.stringContaining('Неизвестный часовой пояс'));
    expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(0);
  });

  it('a refusal of the server is shown', async () => {
    mockApi(
      sessionApi(admin, {
        'GET /api/admin/settings': { body: settingsBody },
        'PUT /api/admin/settings': errorReply(400, 'validation_failed', 'Некорректные данные', [
          { path: '', message: 'Слишком большое значение' },
        ]),
      }),
    );
    renderRoute('/admin/settings');
    const days = await screen.findByRole('textbox', { name: /Серия занятий: дней подряд/ });
    await userEvent.clear(days);
    await userEvent.type(days, '7{Tab}');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(
      await screen.findByText('Некорректные данные: Слишком большое значение'),
    ).toBeInTheDocument();
  });
});

describe('/admin/settings/secrets', () => {
  it('shows whether a key is set, never its value, and takes a new one', async () => {
    const { calls } = mockApi(
      sessionApi(admin, {
        'GET /api/admin/secrets': {
          body: [
            { key: 'ai.apiKey', isSet: true, updatedAt: '2026-11-10T10:00:00.000Z' },
            { key: 'telegram.token', isSet: false, updatedAt: null },
          ],
        },
        'PUT /api/admin/secrets/telegram.token': {
          body: { key: 'telegram.token', isSet: true, updatedAt: '2026-11-14T10:00:00.000Z' },
        },
        'DELETE /api/admin/secrets/ai.apiKey': {
          body: { key: 'ai.apiKey', isSet: false, updatedAt: null },
        },
      }),
    );
    renderRoute('/admin/settings/secrets');
    const set = await screen.findByRole('region', { name: 'ai.apiKey' });
    expect(within(set).getByText('Задан')).toBeInTheDocument();
    expect(within(set).getByLabelText('Новое значение')).toHaveValue('');
    expect(within(set).getByLabelText('Новое значение')).toHaveAttribute('type', 'password');

    const unset = screen.getByRole('region', { name: 'telegram.token' });
    expect(within(unset).getByText('Не задан')).toBeInTheDocument();
    await userEvent.click(within(unset).getByRole('button', { name: 'Сохранить' }));
    expect(within(unset).getByLabelText('Значение')).toHaveAccessibleDescription(
      'Введите новое значение',
    );
    await userEvent.type(within(unset).getByLabelText('Значение'), ' 123:abc ');
    await userEvent.click(within(unset).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ value: '123:abc' }),
    );
    await waitFor(() => expect(within(unset).getByLabelText('Значение')).toHaveValue(''));

    await userEvent.click(within(set).getByRole('button', { name: 'Удалить' }));
    const dialog = await screen.findByRole('dialog', { name: 'Удалить «ai.apiKey»?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE')).toBe(true));
  });

  it('says so when the installation has no keys', async () => {
    mockApi(sessionApi(admin, { 'GET /api/admin/secrets': { body: [] } }));
    renderRoute('/admin/settings/secrets');
    expect(await screen.findByText('Ключей пока нет')).toBeInTheDocument();
  });
});

describe('/admin/settings/import-tokens', () => {
  it('shows a new token once, with the lesson-prep settings file, and revokes tokens', async () => {
    const tokens = [
      { id: 1, name: 'Старый ноутбук', createdAt: '2026-11-01T10:00:00.000Z', revokedAt: null },
    ];
    const { calls } = mockApi(
      sessionApi(admin, {
        'GET /api/admin/import-tokens': { body: tokens },
        'POST /api/admin/import-tokens': (body) => ({
          status: 201,
          body: {
            id: 2,
            name: (body as { name: string }).name,
            createdAt: '2026-11-14T10:00:00.000Z',
            revokedAt: null,
            token: 'qcimp_secret_value',
          },
        }),
        'DELETE /api/admin/import-tokens/1': { status: 204 },
      }),
    );
    renderRoute('/admin/settings/import-tokens');
    const table = await screen.findByRole('region', { name: 'Токены' });
    expect(await within(table).findByText('Старый ноутбук')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Название'), 'Ноутбук мамы');
    await userEvent.click(screen.getByRole('button', { name: 'Выпустить токен' }));
    const dialog = await screen.findByRole('dialog', { name: 'Токен «Ноутбук мамы»' });
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ name: 'Ноутбук мамы' });
    expect(within(dialog).getByLabelText('Токен')).toHaveValue('qcimp_secret_value');
    expect(
      JSON.parse(
        within(dialog).getByLabelText<HTMLTextAreaElement>('Файл настроек lesson-prep').value,
      ),
    ).toEqual({ server: window.location.origin, token: 'qcimp_secret_value' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Я сохранил токен' }));
    expect(screen.queryByDisplayValue('qcimp_secret_value')).not.toBeInTheDocument();

    await userEvent.click(within(table).getByRole('button', { name: 'Отозвать' }));
    const confirm = await screen.findByRole('dialog', { name: 'Отозвать «Старый ноутбук»?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Отозвать' }));
    await waitFor(() =>
      expect(calls.some((call) => call.method === 'DELETE' && call.path.endsWith('/1'))).toBe(true),
    );
  });
});

describe('/admin/users', () => {
  const user = (patch: Partial<UserDto> & Pick<UserDto, 'id' | 'name' | 'role'>): UserDto => ({
    login: null,
    avatar: null,
    active: true,
    hasPin: patch.role === 'learner',
    createdAt: '2026-11-01T10:00:00.000Z',
    deactivatedAt: null,
    ...patch,
  });
  const people = [
    user({ id: 1, name: 'Мама', role: 'admin', login: 'mama' }),
    user({ id: 2, name: 'Саша', role: 'learner' }),
    user({ id: 3, name: 'Тест', role: 'learner', active: false }),
  ];

  it('lists active users; switched-off ones on request', async () => {
    mockApi(sessionApi(admin, { 'GET /api/admin/users': { body: people } }));
    renderRoute('/admin/users');
    expect(await screen.findByText('Мама (вы)')).toBeInTheDocument();
    expect(screen.getByText('Саша')).toBeInTheDocument();
    expect(screen.queryByText('Тест')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'Показать отключённых (1)' }));
    expect(screen.getByText('Тест')).toBeInTheDocument();
    expect(screen.getByText('Отключён')).toBeInTheDocument();
  });

  it('adds a learner with a PIN, checking the fields first', async () => {
    const { calls } = mockApi(
      sessionApi(admin, {
        'GET /api/admin/users': { body: people },
        'POST /api/admin/users': {
          status: 201,
          body: user({ id: 4, name: 'Маша', role: 'learner' }),
        },
      }),
    );
    renderRoute('/admin/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    const dialog = await screen.findByRole('dialog', { name: 'Новый пользователь' });
    await userEvent.type(within(dialog).getByLabelText(/Имя/), 'Маша');
    await userEvent.type(within(dialog).getByLabelText(/PIN/), '12');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Добавить' }));
    expect(within(dialog).getByLabelText(/PIN/)).toHaveAccessibleDescription(
      expect.stringContaining('PIN — от 4 до 8 цифр'),
    );
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    await userEvent.type(within(dialog).getByLabelText(/PIN/), '34');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Добавить' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      role: 'learner',
      name: 'Маша',
      pin: '1234',
    });
  });

  it('adds an adult with a login and a password; a taken login is reported', async () => {
    mockApi(
      sessionApi(admin, {
        'GET /api/admin/users': { body: people },
        'POST /api/admin/users': errorReply(409, 'login_taken', 'Такой логин уже занят'),
      }),
    );
    renderRoute('/admin/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Добавить' }));
    const dialog = await screen.findByRole('dialog', { name: 'Новый пользователь' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Взрослый' }));
    await userEvent.type(within(dialog).getByLabelText(/Имя/), 'Папа');
    await userEvent.type(within(dialog).getByLabelText(/Логин/), 'mama');
    await userEvent.type(within(dialog).getByLabelText(/Пароль/), 'long-password');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Добавить' }));
    expect(await within(dialog).findByText('Такой логин уже занят')).toBeInTheDocument();
  });

  it('changes only what was edited and switches a learner off', async () => {
    const { calls } = mockApi(
      sessionApi(admin, {
        'GET /api/admin/users': { body: people },
        'PATCH /api/admin/users/2': (body) => ({ body: { ...people[1], ...(body as object) } }),
      }),
    );
    renderRoute('/admin/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Изменить: Саша' }));
    const dialog = await screen.findByRole('dialog', { name: 'Изменить: Саша' });
    expect(within(dialog).getByLabelText(/Новый PIN/)).toHaveAccessibleDescription(
      expect.stringContaining('Сейчас PIN задан'),
    );
    await userEvent.type(within(dialog).getByLabelText(/Новый PIN/), '5678');
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Может входить' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
      pin: '5678',
      active: false,
    });
  });

  it('the admin cannot switch themselves off or change their password here', async () => {
    mockApi(sessionApi(admin, { 'GET /api/admin/users': { body: people } }));
    renderRoute('/admin/users');
    await userEvent.click(await screen.findByRole('button', { name: 'Изменить: Мама' }));
    const dialog = await screen.findByRole('dialog', { name: 'Изменить: Мама' });
    expect(within(dialog).getByLabelText(/Логин/)).toHaveValue('mama');
    expect(within(dialog).queryByLabelText(/пароль/i)).not.toBeInTheDocument();
    expect(within(dialog).getByText('Свой пароль меняется в разделе «Профиль».')).toBeVisible();
    expect(within(dialog).queryByRole('switch')).not.toBeInTheDocument();
  });
});
