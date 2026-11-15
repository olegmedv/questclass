// @vitest-environment jsdom
// FEAT-027: screen templates — LearnerShell (numbers, profile menu, bottom navigation),
// TaskPlayer, Catalog, ProgressView, AdminShell — rendered with data and slots only.
import { Badge, ItemCard } from '@questclass/ui';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { adminSectionOf } from '../src/app/layouts';
import { AdminPage, AdminShell } from '../src/templates/AdminShell';
import { Catalog } from '../src/templates/Catalog';
import { LearnerShell, learnerSectionOf } from '../src/templates/LearnerShell';
import { ProgressView } from '../src/templates/ProgressView';
import { TaskPlayer } from '../src/templates/TaskPlayer';
import { admin, learner, mockApi, renderRoute, renderWithProviders, sessionApi } from './helpers';

function renderAt(element: ReactElement, path = '/') {
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [path] });
  return { router, ...renderWithProviders(<RouterProvider router={router} />) };
}

describe('LearnerShell', () => {
  const stats = { level: 4, xp: 1131, coins: 30, wishes: 1 };

  function shell(props: Partial<Parameters<typeof LearnerShell>[0]> = {}) {
    return (
      <LearnerShell
        learner={{ name: 'Саша' }}
        stats={stats}
        active="hero"
        onSwitchLearner={() => {}}
        onParents={() => {}}
        {...props}
      >
        <h1>Содержимое</h1>
      </LearnerShell>
    );
  }

  it('the header shows level, XP, coins, «Мои желания» and «Награды»', () => {
    renderAt(shell());
    const numbers = screen.getByRole('group', { name: 'Мои достижения' });
    expect(within(numbers).getByText('Уровень:', { exact: false })).toBeInTheDocument();
    expect(within(numbers).getByText('4')).toBeInTheDocument();
    expect(within(numbers).getByText('1 131')).toBeInTheDocument();
    expect(within(numbers).getByText('30')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Мои желания: 1' })).toHaveAttribute('href', '/wishes');
    expect(screen.getByRole('link', { name: 'Награды' })).toHaveAttribute('href', '/rewards');
  });

  it('while the numbers load they are placeholders', () => {
    renderAt(shell({ stats: null, statsLoading: true }));
    expect(screen.getAllByText('загрузка')).toHaveLength(4);
  });

  it('bottom navigation «Учёба · Герой · Магазин» marks the current section', () => {
    renderAt(shell());
    const nav = screen.getByRole('navigation', { name: 'Разделы' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Учёба', 'Герой', 'Магазин']);
    expect(within(nav).getByRole('link', { name: 'Герой' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Учёба' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Магазин' })).not.toHaveAttribute('aria-current');
  });

  it('the profile menu offers «Сменить ученика» and «Родителям»', async () => {
    const onSwitchLearner = vi.fn();
    const onParents = vi.fn();
    renderAt(shell({ onSwitchLearner, onParents }));
    const trigger = screen.getByRole('button', { name: 'Профиль' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await userEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Профиль' });
    expect(within(menu).getByRole('menuitem', { name: 'Сменить ученика' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: 'Родителям' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onParents).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Сменить ученика' }));
    expect(onSwitchLearner).toHaveBeenCalledOnce();
  });

  it('Escape closes the menu', async () => {
    renderAt(shell());
    await userEvent.click(screen.getByRole('button', { name: 'Профиль' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('section of a path', () => {
    expect(learnerSectionOf('/')).toBe('study');
    expect(learnerSectionOf('/hero')).toBe('hero');
    expect(learnerSectionOf('/shop/item/3')).toBe('shop');
    expect(learnerSectionOf('/rewards')).toBeNull();
  });
});

describe('learner and admin layouts in the app', () => {
  it('learner pages live inside the shell; «Сменить ученика» signs out to the picker', async () => {
    const { calls } = mockApi(sessionApi(learner, { 'POST /api/auth/logout': { status: 204 } }));
    const { router } = renderRoute('/shop');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Магазин желаний' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Магазин' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByRole('button', { name: 'Профиль' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Сменить ученика' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(calls.some((call) => call.method === 'POST' && call.path === '/api/auth/logout')).toBe(
      true,
    );
  });

  it('«Родителям» opens the admin login without signing the learner out', async () => {
    const { calls } = mockApi(sessionApi(learner));
    const { router } = renderRoute('/');
    await screen.findByRole('heading', { level: 1, name: 'Саша, начнём?' });
    await userEvent.click(screen.getByRole('button', { name: 'Профиль' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Родителям' }));
    expect(router.state.location.pathname + router.state.location.search).toBe('/login?as=admin');
    expect(calls.some((call) => call.path === '/api/auth/logout')).toBe(false);
  });

  it('admin pages live inside the admin shell with its sections', async () => {
    mockApi(sessionApi(admin));
    renderRoute('/admin');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Кабинет родителя' }),
    ).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    expect(within(nav).getByRole('link', { name: 'Главная' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('admin section of a path is the longest matching prefix', () => {
    const sections = [
      { id: 'home', label: 'Главная', href: '/admin' },
      { id: 'users', label: 'Пользователи', href: '/admin/users' },
    ];
    expect(adminSectionOf('/admin', sections)).toBe('home');
    expect(adminSectionOf('/admin/users/5', sections)).toBe('users');
    expect(adminSectionOf('/administrator', sections)).toBeNull();
  });
});

describe('TaskPlayer', () => {
  it('has a back link, the title, steps, content and the action bar', () => {
    renderAt(
      <TaskPlayer
        subject="Математика"
        title="Сложение"
        backHref="/"
        steps={[
          { id: 'video', label: 'Видео', status: 'done' },
          { id: 'quiz', label: 'Тест', status: 'current' },
        ]}
        progress={{ label: 'Просмотрено', value: 70, valueText: '70%' }}
        actions={<button type="button">Перейти к вопросам</button>}
      >
        <p>Вопрос</p>
      </TaskPlayer>,
    );
    expect(screen.getByRole('link', { name: 'Назад' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('heading', { level: 1, name: 'Сложение' })).toBeInTheDocument();
    expect(screen.getByText('Математика')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Шаги задания' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Просмотрено' })).toHaveAttribute(
      'aria-valuenow',
      '70',
    );
    expect(screen.getByRole('main', { name: 'Сложение' })).toHaveTextContent('Вопрос');
    expect(screen.getByRole('button', { name: 'Перейти к вопросам' })).toBeInTheDocument();
  });
});

describe('Catalog', () => {
  interface Good {
    id: string;
    kind: 'hero' | 'room';
    title: string;
  }
  const goods: Good[] = [
    { id: 'a', kind: 'hero', title: 'Вампир' },
    { id: 'b', kind: 'hero', title: 'Фея' },
    { id: 'c', kind: 'room', title: 'Лес' },
  ];

  function Shop({
    items = goods,
    loading = false,
    error,
  }: {
    items?: Good[];
    loading?: boolean;
    error?: string;
  }) {
    const [kind, setKind] = useState<'hero' | 'room'>('hero');
    const [open, setOpen] = useState<Good | null>(null);
    return (
      <Catalog
        title="Магазин"
        filter={{
          label: 'Что купить',
          value: kind,
          onChange: setKind,
          items: [
            { id: 'hero', label: 'Герои' },
            { id: 'room', label: 'Комнаты' },
          ],
        }}
        items={items.filter((good) => good.kind === kind)}
        itemKey={(good) => good.id}
        onOpen={setOpen}
        renderItem={(good, openDetails) => (
          <ItemCard title={good.title} footer={<Badge>40</Badge>} onClick={openDetails} />
        )}
        details={{
          item: open,
          title: (good) => good.title,
          render: (good) => <p>Описание: {good.title}</p>,
          footer: () => <button type="button">Купить</button>,
          onClose: () => setOpen(null),
        }}
        loading={loading}
        error={error}
        onRetry={() => {}}
        empty={{ title: 'Здесь пока пусто' }}
      />
    );
  }

  it('shows a filtered grid and opens the details dialog', async () => {
    renderAt(<Shop />);
    expect(screen.getByRole('heading', { level: 1, name: 'Магазин' })).toBeInTheDocument();
    const panel = screen.getByRole('tabpanel', { name: 'Герои' });
    expect(within(panel).getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(screen.getByRole('tab', { name: 'Комнаты' }));
    expect(within(screen.getByRole('tabpanel')).getAllByRole('listitem')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: /Лес/ }));
    const dialog = screen.getByRole('dialog', { name: 'Лес' });
    expect(within(dialog).getByText('Описание: Лес')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Купить' })).toBeInTheDocument();
  });

  it('empty, loading and error states', () => {
    const { unmount } = renderAt(<Shop items={[]} />);
    expect(screen.getByRole('heading', { name: 'Здесь пока пусто' })).toBeInTheDocument();
    unmount();
    const loading = renderAt(<Shop loading />);
    expect(screen.getByRole('list', { name: 'Загрузка' })).toHaveAttribute('aria-busy', 'true');
    loading.unmount();
    renderAt(<Shop error="Нет связи" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Нет связи');
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });
});

describe('ProgressView', () => {
  it('shows totals, the streak slot and the history table', () => {
    renderAt(
      <ProgressView
        title="Мой прогресс"
        totals={[
          { id: 'level', label: 'Уровень', value: 4, kind: 'level' },
          { id: 'coins', label: 'Монеты', value: 30, kind: 'coins' },
        ]}
        streak={<section aria-label="Серия">3 из 5</section>}
        history={{
          caption: 'История начислений',
          columns: [
            { key: 'event', header: 'Событие' },
            { key: 'coins', header: 'Монеты' },
          ],
          rows: [{ id: 1, event: 'Тест', coins: 350 }],
          rowKey: (row: { id: number }) => row.id,
        }}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Мой прогресс' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Итоги' })).getAllByRole('listitem'),
    ).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Серия' })).toHaveTextContent('3 из 5');
    expect(screen.getByRole('table', { name: 'История начислений' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '350' })).toBeInTheDocument();
  });
});

describe('AdminShell', () => {
  it('has the sections, the page header and a logout in the profile menu', async () => {
    const onLogout = vi.fn();
    renderAt(
      <AdminShell
        adminName="Мама"
        onLogout={onLogout}
        active="users"
        sections={[
          { id: 'home', label: 'Главная', href: '/admin' },
          { id: 'users', label: 'Пользователи', href: '/admin/users' },
        ]}
      >
        <AdminPage
          title="Пользователи"
          description="Админы и ученики"
          actions={<button type="button">Добавить</button>}
        >
          <p>Таблица</p>
        </AdminPage>
      </AdminShell>,
    );
    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    expect(within(nav).getByRole('link', { name: 'Пользователи' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Пользователи' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Таблица');
    await userEvent.click(screen.getByRole('button', { name: 'Профиль родителя' }));
    expect(screen.getByText('Мама')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Выйти' }));
    expect(onLogout).toHaveBeenCalledOnce();
  });
});
