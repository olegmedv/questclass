// Feedback and data: Toast, Tooltip, Spinner, Progress, EmptyState, DataTable.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  Button,
  DataTable,
  EmptyState,
  ProgressBar,
  ProgressRing,
  Spinner,
  ToastProvider,
  Tooltip,
  useToast,
} from '../src';

describe('Toast', () => {
  function Shop() {
    const toast = useToast();
    return (
      <>
        <Button onClick={() => toast.show('Куплено!', { tone: 'success' })}>Купить</Button>
        <Button onClick={() => toast.show('Не хватает монет', { tone: 'error' })}>Ошибка</Button>
      </>
    );
  }

  it('a status toast appears and hides after its time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(
        <ToastProvider>
          <Shop />
        </ToastProvider>,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Купить' }));
      expect(screen.getByRole('status')).toHaveTextContent('Куплено!');
      act(() => {
        vi.advanceTimersByTime(4100);
      });
      expect(screen.queryByText('Куплено!')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('errors are alerts and can be dismissed', async () => {
    render(
      <ToastProvider>
        <Shop />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ошибка' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Не хватает монет');
    await userEvent.click(screen.getByRole('button', { name: 'Скрыть' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('useToast outside the provider is a clear error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Shop />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});

describe('Tooltip', () => {
  it('describes its trigger on focus and hides on Escape', async () => {
    render(
      <Tooltip content="Монеты за уроки">
        <button type="button">?</button>
      </Tooltip>,
    );
    await userEvent.tab();
    const tip = screen.getByRole('tooltip');
    expect(screen.getByRole('button', { name: '?' })).toHaveAccessibleDescription(
      'Монеты за уроки',
    );
    expect(tip).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('Spinner and progress', () => {
  it('Spinner is a named status', () => {
    render(<Spinner label="Загружаем уроки" />);
    expect(screen.getByRole('status', { name: 'Загружаем уроки' })).toBeInTheDocument();
  });

  it('ProgressBar exposes value and range', () => {
    render(<ProgressBar label="Просмотрено" value={70} valueText="70%" />);
    const bar = screen.getByRole('progressbar', { name: 'Просмотрено' });
    expect(bar).toHaveAttribute('aria-valuenow', '70');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuetext', '70%');
  });

  it('ProgressBar without a value is indeterminate and busy', () => {
    render(<ProgressBar label="Загрузка" />);
    const bar = screen.getByRole('progressbar', { name: 'Загрузка' });
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(bar).toHaveAttribute('aria-busy', 'true');
  });

  it('ProgressRing clamps its value', () => {
    render(<ProgressRing label="Серия" value={7} max={5} />);
    expect(screen.getByRole('progressbar', { name: 'Серия' })).toHaveAttribute(
      'aria-valuenow',
      '5',
    );
  });
});

describe('EmptyState and DataTable', () => {
  it('EmptyState is a named section; the error tone is an alert', () => {
    const { rerender } = render(<EmptyState title="Здесь пока пусто" />);
    expect(screen.getByRole('region', { name: 'Здесь пока пусто' })).toBeInTheDocument();
    rerender(<EmptyState tone="error" title="Не получилось" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Не получилось');
  });

  const columns = [
    { key: 'name', header: 'Имя' },
    { key: 'coins', header: 'Монеты', align: 'end' as const },
  ];

  it('DataTable renders a captioned table in a focusable region', () => {
    render(
      <DataTable
        caption="Ученики"
        columns={columns}
        rows={[{ id: 1, name: 'Саша', coins: 350 }]}
        rowKey={(row) => row.id}
      />,
    );
    expect(screen.getByRole('table', { name: 'Ученики' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Ученики' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('columnheader', { name: 'Монеты' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '350' })).toBeInTheDocument();
  });

  it('DataTable shows empty, loading and error states', () => {
    const { rerender } = render(
      <DataTable caption="История" columns={columns} rows={[]} rowKey={() => 0} empty="Пусто" />,
    );
    expect(screen.getByRole('cell', { name: 'Пусто' })).toBeInTheDocument();
    rerender(<DataTable caption="История" columns={columns} rows={[]} rowKey={() => 0} loading />);
    expect(screen.getByRole('region', { name: 'История' })).toHaveAttribute('aria-busy', 'true');
    rerender(
      <DataTable
        caption="История"
        columns={columns}
        rows={[]}
        rowKey={() => 0}
        error="Сервер недоступен"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Сервер недоступен');
  });
});
