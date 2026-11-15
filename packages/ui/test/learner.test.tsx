// Learner-facing widgets: PinPad, QuestionCard, OptionTile.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OptionTile, PinPad, QuestionCard } from '../src';

function Pin({ onSubmit, error }: { onSubmit: (pin: string) => void; error?: string }) {
  const [pin, setPin] = useState('');
  return <PinPad value={pin} onChange={setPin} onSubmit={onSubmit} error={error} />;
}

describe('PinPad', () => {
  it('is a named group of big keys; submit waits for 4 digits', async () => {
    const onSubmit = vi.fn();
    render(<Pin onSubmit={onSubmit} />);
    expect(screen.getByRole('group', { name: 'PIN' })).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Войти' });
    for (const digit of ['2', '4', '6']) {
      await userEvent.click(screen.getByRole('button', { name: digit }));
    }
    expect(submit).toBeDisabled();
    expect(screen.getByText('Введено цифр: 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '8' }));
    await userEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith('2468');
  });

  it('works with the physical keyboard and Backspace', async () => {
    const onSubmit = vi.fn();
    render(<Pin onSubmit={onSubmit} />);
    await userEvent.keyboard('12345{Backspace}{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('1234');
  });

  it('shows the error as an alert', () => {
    render(<Pin onSubmit={() => {}} error="Неверный PIN" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Неверный PIN');
  });

  it('loading disables the keys', () => {
    render(<PinPad value="1234" onChange={() => {}} onSubmit={() => {}} loading />);
    expect(screen.getByRole('button', { name: '5' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Войти' })).toHaveAttribute('aria-busy', 'true');
  });
});

describe('QuestionCard and OptionTile', () => {
  it('names the options group by the question and shows progress', () => {
    render(
      <QuestionCard index={2} total={8} text="Сколько будет 7 + 5?">
        <OptionTile letter="А">12</OptionTile>
        <OptionTile letter="Б">13</OptionTile>
      </QuestionCard>,
    );
    expect(screen.getByRole('heading', { name: 'Сколько будет 7 + 5?' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Сколько будет 7 + 5?' })).toBeInTheDocument();
    expect(screen.getByText('Вопрос 2 из 8')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Пройдено вопросов' })).toHaveAttribute(
      'aria-valuenow',
      '1',
    );
  });

  it('OptionTile reports choice and result to screen readers', async () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <OptionTile letter="А" onClick={onClick}>
        12
      </OptionTile>,
    );
    const option = screen.getByRole('button', { name: /12/ });
    expect(option).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(option);
    expect(onClick).toHaveBeenCalledOnce();
    rerender(
      <OptionTile letter="А" state="correct" disabled>
        12
      </OptionTile>,
    );
    expect(screen.getByRole('button', { name: '12: верный ответ' })).toBeDisabled();
    rerender(
      <OptionTile letter="А" state="wrong" disabled>
        12
      </OptionTile>,
    );
    expect(screen.getByRole('button', { name: '12: неверный ответ' })).toBeInTheDocument();
  });
});
