// @vitest-environment jsdom
// FEAT-055: «Кабинет родителя» — the queues of `GET /api/admin/inbox` with links, quick actions,
// the search over actions and registered settings (with the trail of each result).
import type { AdminInboxDto } from '@questclass/shared/inbox/dto';
import { SETTINGS } from '@questclass/shared/settings/registry';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { searchAdmin } from '../src/features/admin-inbox/search';
import { admin, errorReply, mockApi, noRetryClient, renderRoute, sessionApi } from './helpers';

const inbox: AdminInboxDto = {
  choreReviews: 2,
  retryRequests: 0,
  wishRequests: 1,
  robuxRequested: 300,
  importRevisions: 1,
  watchConfirmations: 3,
};

describe('/admin', () => {
  it('shows what waits, with links to each queue', async () => {
    mockApi(sessionApi(admin, { 'GET /api/admin/inbox': { body: inbox } }));
    renderRoute('/admin');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Кабинет родителя' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Что нужно сделать?' })).toBeVisible();
    const chips = await screen.findByLabelText('Сейчас ждут');
    expect(within(chips).getByText('Дела на проверку: 2')).toBeInTheDocument();
    expect(within(chips).getByText('Ждут выдачи: 1')).toBeInTheDocument();
    expect(within(chips).getByText('Robux к выдаче: 300')).toBeInTheDocument();
    expect(within(chips).queryByText(/Просят пересдачу/)).not.toBeInTheDocument();

    const queues = screen.getByRole('list', { name: 'Очереди' });
    const chores = within(queues).getByRole('article', { name: 'Дела на проверку' });
    expect(within(chores).getByText('2')).toBeInTheDocument();
    expect(within(chores).getByRole('link', { name: 'Проверить дела' })).toHaveAttribute(
      'href',
      '/admin/reviews',
    );
    const retries = within(queues).getByRole('article', { name: 'Просьбы о пересдаче' });
    expect(within(retries).getByText('нет')).toBeInTheDocument();
    expect(within(retries).getByRole('link', { name: 'Разрешить пересдачу' })).toHaveAttribute(
      'href',
      '/admin/reviews?queue=retries',
    );
    expect(
      within(queues)
        .getByRole('article', { name: 'Просмотры ждут подтверждения' })
        .querySelector('a'),
    ).toHaveAttribute('href', '/admin/progress');

    const quick = screen.getByLabelText('Быстрые действия');
    expect(within(quick).getByRole('link', { name: 'Выдать желание' })).toHaveAttribute(
      'href',
      '/admin/wishes',
    );
    expect(within(quick).getByRole('link', { name: 'Открыть задания' })).toHaveAttribute(
      'href',
      '/admin/tasks',
    );
    const sections = screen.getByRole('list', { name: 'Разделы кабинета' });
    expect(within(sections).getByRole('link', { name: /Настройки/ })).toHaveAttribute(
      'href',
      '/admin/settings',
    );
  });

  it('says when nothing waits', async () => {
    mockApi(
      sessionApi(admin, {
        'GET /api/admin/inbox': {
          body: {
            choreReviews: 0,
            retryRequests: 0,
            wishRequests: 0,
            robuxRequested: 0,
            importRevisions: 0,
            watchConfirmations: 0,
          },
        },
      }),
    );
    renderRoute('/admin');
    expect(await screen.findByText('Всё сделано')).toBeInTheDocument();
  });

  it('finds actions and settings, showing where each one lives', async () => {
    mockApi(sessionApi(admin, { 'GET /api/admin/inbox': { body: inbox } }));
    renderRoute('/admin');
    const box = await screen.findByLabelText('Поиск по кабинету');
    await userEvent.type(box, 'субтитры');
    const found = screen.getByRole('list', { name: 'Найдено' });
    const shutter = within(found).getByRole('link', { name: /Полоса над субтитрами/ });
    expect(shutter).toHaveTextContent('Кабинет › Задания › Видеоурок');
    expect(shutter).toHaveAttribute('href', '/admin/tasks');

    await userEvent.clear(box);
    await userEvent.type(box, 'ещё попытка');
    expect(
      within(screen.getByRole('list', { name: 'Найдено' })).getByRole('link', {
        name: /Разрешить ещё попытку/,
      }),
    ).toHaveAttribute('href', '/admin/reviews?queue=retries');

    await userEvent.clear(box);
    await userEvent.type(box, 'зачёта');
    expect(
      within(screen.getByRole('list', { name: 'Найдено' })).getByRole('link', {
        name: new RegExp(SETTINGS['quiz.minCorrect'].label),
      }),
    ).toHaveTextContent('Кабинет › Настройки');

    await userEvent.clear(box);
    await userEvent.type(box, 'бегемот');
    expect(screen.getByText('Ничего не нашлось. Попробуйте другое слово.')).toBeInTheDocument();
  });

  it('a failed inbox does not hide the rest of the home', async () => {
    mockApi(
      sessionApi(admin, { 'GET /api/admin/inbox': errorReply(500, 'internal_error', 'Сбой') }),
    );
    renderRoute('/admin', { client: noRetryClient() });
    expect(await screen.findByText(/Не получилось загрузить очереди/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Разделы кабинета' })).toBeInTheDocument();
    expect(screen.getByLabelText('Поиск по кабинету')).toBeInTheDocument();
  });
});

describe('searchAdmin', () => {
  it('matches every word, ё as е, titles first; every registered setting is findable', () => {
    expect(searchAdmin('')).toEqual([]);
    expect(searchAdmin('еще попытка')[0]?.id).toBe('retries');
    for (const [key, def] of Object.entries(SETTINGS)) {
      const ids = searchAdmin(def.label, undefined, 50).map((entry) => entry.id);
      expect(ids, key).toContain(`setting:${key}`);
    }
  });
});
