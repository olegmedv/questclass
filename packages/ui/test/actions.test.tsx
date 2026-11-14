// Buttons, cards and chips: roles, accessible names, disabled/loading states.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  Avatar,
  Badge,
  Button,
  buttonClassName,
  Card,
  IconButton,
  ItemCard,
  Placeholder,
  StatChip,
  StepList,
  Settings,
} from '../src';

describe('Button', () => {
  it('is a button named by its label and clicks', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Начать урок</Button>);
    const button = screen.getByRole('button', { name: 'Начать урок' });
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('loading keeps the label, is busy and blocks clicks', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Сохранить
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Сохранить' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is reachable with Tab, unless disabled', async () => {
    render(
      <>
        <Button disabled>Нельзя</Button>
        <Button>Можно</Button>
      </>,
    );
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Можно' })).toHaveFocus();
  });

  it('buttonClassName styles links the same way', () => {
    expect(buttonClassName({ variant: 'primary', size: 'lg', block: true })).toBe(
      'qc-btn qc-btn-primary qc-btn-lg qc-btn-block',
    );
  });
});

describe('IconButton', () => {
  it('has an accessible name and reports pressed state', () => {
    render(<IconButton label="Настройки" icon={<Settings />} pressed />);
    const button = screen.getByRole('button', { name: 'Настройки' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAttribute('title', 'Настройки');
  });
});

describe('Card and ItemCard', () => {
  it('Card is a region named by its title', () => {
    render(<Card title="Серия занятий">3 из 5</Card>);
    expect(screen.getByRole('region', { name: 'Серия занятий' })).toHaveTextContent('3 из 5');
  });

  it('Card while loading is busy and hides the content', () => {
    render(
      <Card title="История" loading>
        секрет
      </Card>,
    );
    expect(screen.getByRole('region', { name: 'История' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('секрет')).not.toBeInTheDocument();
  });

  it('clickable ItemCard is a toggle button with the image alt', async () => {
    const onClick = vi.fn();
    render(
      <ItemCard
        title="Вампир"
        media={{ src: '/assets/game/characters/vampire-boy.webp', alt: 'Вампир' }}
        selected
        onClick={onClick}
      />,
    );
    const card = screen.getByRole('button', { name: /Вампир/ });
    expect(card).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: 'Вампир' })).toBeInTheDocument();
    await userEvent.click(card);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('ItemCard can be disabled', () => {
    render(<ItemCard title="Комната" onClick={() => {}} disabled />);
    expect(screen.getByRole('button', { name: /Комната/ })).toBeDisabled();
  });
});

describe('StatChip, Badge, Avatar, Placeholder, StepList', () => {
  it('StatChip announces label and value', () => {
    render(<StatChip kind="coins" label="Монеты" value={350} />);
    expect(screen.getByText('Монеты:', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('350')).toBeInTheDocument();
  });

  it('clickable StatChip is a button named by label and value', () => {
    render(<StatChip kind="wishes" label="Мои желания" value={2} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Мои желания: 2' })).toBeEnabled();
  });

  it('Badge shows its text', () => {
    render(<Badge tone="live">Живой образ</Badge>);
    expect(screen.getByText('Живой образ')).toBeInTheDocument();
  });

  it('Avatar falls back to an initial with the name as label', () => {
    render(<Avatar name="Саша" />);
    expect(screen.getByRole('img', { name: 'Саша' })).toHaveTextContent('С');
  });

  it('Placeholder is an image named by its label', () => {
    render(<Placeholder kind="upload" label="Картинка товара" />);
    expect(screen.getByRole('img', { name: 'Картинка товара' })).toHaveAttribute(
      'data-kind',
      'upload',
    );
  });

  it('StepList marks the current step', () => {
    render(
      <StepList
        label="Шаги урока"
        steps={[
          { id: 'video', label: 'Видео', status: 'done' },
          { id: 'quiz', label: 'Тест', status: 'current' },
          { id: 'reward', label: 'Награда', status: 'todo' },
        ]}
      />,
    );
    const list = screen.getByRole('list', { name: 'Шаги урока' });
    expect(list).toBeInTheDocument();
    const current = screen.getByText('Тест').closest('li');
    expect(current).toHaveAttribute('aria-current', 'step');
  });
});
