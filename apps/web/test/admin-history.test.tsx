// @vitest-environment jsdom
// FEAT-043: the history — a learner's XP and coins and the admin actions, with filters by
// learner, kind and dates, a page at a time.
import type { UserDto } from '@questclass/shared/auth/dto';
import type { LedgerEntryDto } from '@questclass/shared/economy/dto';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { admin, mockApi, renderRoute, sessionApi } from './helpers';

const user = (id: number, name: string, role: UserDto['role'] = 'learner'): UserDto => ({
  id,
  role,
  name,
  login: null,
  avatar: null,
  active: true,
  hasPin: true,
  createdAt: '2026-11-01T10:00:00.000Z',
  deactivatedAt: null,
});
const users = [user(1, 'Мама', 'admin'), user(2, 'Саша'), user(3, 'Маша')];

const entry = (id: number, patch: Partial<LedgerEntryDto>): LedgerEntryDto => ({
  id,
  at: '2026-11-14T10:00:00.000Z',
  xp: 0,
  coins: 0,
  sourceType: 'task',
  sourceId: '10',
  note: null,
  reversesId: null,
  reversedById: null,
  createdBy: null,
  ...patch,
});

describe('/admin/history', () => {
  it('shows a learner’s XP and coins, filters them and loads more', async () => {
    const { calls } = mockApi(
      sessionApi(admin, {
        'GET /api/admin/users': { body: users },
        'GET /api/admin/learners/2/ledger': {
          body: {
            items: [
              entry(3, { sourceType: 'award', xp: 0, coins: -100, reversesId: 2, note: 'Отмена' }),
              entry(2, {
                sourceType: 'award',
                xp: 50,
                coins: 100,
                reversedById: 3,
                note: 'Домашка',
              }),
              entry(1, { sourceType: 'purchase', coins: -40 }),
            ],
            nextCursor: '1_1',
          },
        },
        'GET /api/admin/learners/3/ledger': { body: { items: [], nextCursor: null } },
      }),
    );
    renderRoute('/admin/history');
    const table = await screen.findByRole('region', { name: 'Начисления' });
    await within(table).findByText('Покупка');
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('От родителя');
    expect(rows[1]).toHaveTextContent('0 XP, -100 монет');
    expect(rows[1]).toHaveTextContent('отмена записи № 2');
    expect(rows[2]).toHaveTextContent('+50 XP, +100 монет');
    expect(rows[2]).toHaveTextContent('отменено');
    expect(rows[3]).toHaveTextContent('Покупка');

    await userEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));
    await waitFor(() => expect(calls.some((call) => call.path.includes('cursor=1_1'))).toBe(true));

    await userEvent.selectOptions(screen.getByLabelText('Тип'), 'От родителя');
    await userEvent.type(screen.getByLabelText('С'), '2026-11-01');
    await userEvent.type(screen.getByLabelText('По'), '2026-11-14');
    await waitFor(() => {
      const last = calls
        .filter((call) => call.path.startsWith('/api/admin/learners/2/ledger'))
        .at(-1);
      const params = new URL(last?.path ?? '', 'http://x').searchParams;
      expect(params.get('type')).toBe('award');
      expect(params.get('from')).toBe(new Date('2026-11-01T00:00:00').toISOString());
      expect(params.get('to')).toBe(new Date('2026-11-15T00:00:00').toISOString());
    });

    await userEvent.selectOptions(screen.getByLabelText('Ученик'), 'Маша');
    expect(
      await within(screen.getByRole('region', { name: 'Начисления' })).findByText('Начислений нет'),
    ).toBeVisible();
  });

  it('shows admin actions in words, with who did them, and filters them', async () => {
    const { calls } = mockApi(
      sessionApi(admin, {
        'GET /api/admin/users': { body: users },
        'GET /api/admin/audit': {
          body: {
            items: [
              {
                id: 9,
                at: '2026-11-14T10:00:00.000Z',
                actorId: 1,
                action: 'award.granted',
                entity: 'award',
                entityId: '4',
                learnerId: 2,
                payload: { title: 'Домашка', coins: 100 },
              },
              {
                id: 8,
                at: '2026-11-14T09:00:00.000Z',
                actorId: null,
                action: 'import.lesson',
                entity: 'task',
                entityId: '7',
                learnerId: null,
                payload: { externalId: 'plants-1' },
              },
              {
                id: 7,
                at: '2026-11-14T08:00:00.000Z',
                actorId: 1,
                action: 'something.new',
                entity: 'x',
                entityId: null,
                learnerId: null,
                payload: {},
              },
            ],
            nextCursor: null,
          },
        },
      }),
    );
    renderRoute('/admin/history?tab=actions');
    const table = await screen.findByRole('region', { name: 'Действия' });
    await within(table).findByText('Импорт урока');
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Награда начислена');
    expect(rows[1]).toHaveTextContent('title: Домашка · coins: 100');
    expect(rows[1]).toHaveTextContent('Мама');
    expect(rows[1]).toHaveTextContent('Саша');
    expect(rows[2]).toHaveTextContent('Импорт урока');
    expect(rows[2]).toHaveTextContent('Система');
    expect(rows[3]).toHaveTextContent('something.new');
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Ученик'), 'Саша');
    await userEvent.selectOptions(screen.getByLabelText('Действие'), 'Задание закрыто');
    await waitFor(() => {
      const last = calls.filter((call) => call.path.startsWith('/api/admin/audit')).at(-1);
      const params = new URL(last?.path ?? '', 'http://x').searchParams;
      expect(params.get('learnerId')).toBe('2');
      expect(params.get('action')).toBe('progress.closed');
    });
  });
});
