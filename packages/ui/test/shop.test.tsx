// Shop widgets: CategoryFilter, ShopItemCard (+ ShopMark), SpriteImage, WishCard.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button, CategoryFilter, ShopItemCard, ShopMark, SpriteImage, WishCard } from '../src';

type Section = 'all' | 'heroes' | 'rooms';

function Filter({ onChange }: { onChange?: (value: Section) => void }) {
  const [value, setValue] = useState<Section>('all');
  return (
    <CategoryFilter
      label="Разделы"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      options={[
        { value: 'all', label: 'Всё', icon: <svg /> },
        { value: 'heroes', label: 'Герои', icon: <svg />, tone: 'blue' },
        { value: 'rooms', label: 'Комнаты', icon: <svg />, tone: 'green', disabled: true },
      ]}
    />
  );
}

describe('CategoryFilter', () => {
  it('is a radio group: click and arrows choose, disabled options are skipped', async () => {
    const onChange = vi.fn();
    render(<Filter onChange={onChange} />);
    const group = screen.getByRole('radiogroup', { name: 'Разделы' });
    const all = within(group).getByRole('radio', { name: 'Всё' });
    expect(all).toBeChecked();
    expect(all).toHaveAttribute('tabindex', '0');
    await userEvent.click(within(group).getByRole('radio', { name: 'Герои' }));
    expect(onChange).toHaveBeenLastCalledWith('heroes');
    expect(within(group).getByRole('radio', { name: 'Герои' })).toBeChecked();
    // ArrowRight skips the disabled «Комнаты» and wraps to «Всё».
    await userEvent.keyboard('{ArrowRight}');
    expect(all).toBeChecked();
    expect(all).toHaveFocus();
    expect(within(group).getByRole('radio', { name: 'Комнаты' })).toBeDisabled();
  });
});

describe('ShopItemCard', () => {
  it('names the item, opens details by the title and buys by the price', async () => {
    const onBuy = vi.fn();
    const onDetails = vi.fn();
    render(
      <ShopItemCard
        title="Космонавт"
        media={<img src="/a.webp" alt="Космонавт" />}
        marks={<ShopMark icon={<svg />} label="Живой герой" tone="teal" />}
        price={40}
        onBuy={onBuy}
        onDetails={onDetails}
      />,
    );
    const card = screen.getByRole('article', { name: 'Космонавт' });
    expect(within(card).getByRole('img', { name: 'Живой герой' })).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Космонавт' }));
    expect(onDetails).toHaveBeenCalledOnce();
    await userEvent.click(
      within(card).getByRole('button', { name: 'Купить «Космонавт» за 40 монет' }),
    );
    expect(onBuy).toHaveBeenCalledOnce();
  });

  it('without enough coins the price button is off and says how many are missing', () => {
    render(<ShopItemCard title="Отель" price={1200} missingCoins={950} onBuy={() => {}} />);
    expect(screen.getByText('Ещё 950 монет')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Отель: 1 200 монет, ещё 950 монет' }),
    ).toBeDisabled();
  });

  it('shows skeletons while loading', () => {
    render(<ShopItemCard title="" price={0} loading />);
    expect(screen.getByRole('article')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('SpriteImage', () => {
  it('a whole picture is an img; a sprite cell is a named image or decorative', () => {
    const { rerender } = render(<SpriteImage src="/t.webp" alt="Билет" />);
    expect(screen.getByRole('img', { name: 'Билет' })).toHaveAttribute('src', '/t.webp');
    rerender(
      <SpriteImage src="/t.webp" sprite={{ cols: 2, rows: 2, col: 1, row: 0 }} alt="Монеты" />,
    );
    const cell = screen.getByRole('img', { name: 'Монеты' });
    expect(cell.style.backgroundPosition).toBe('100% 0%');
    expect(cell.style.backgroundSize).toBe('200% 200%');
    rerender(<SpriteImage src="/t.webp" sprite={{ cols: 2, rows: 2, col: 0, row: 1 }} alt="" />);
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('WishCard', () => {
  it('shows what is left, the status and the action', () => {
    render(
      <WishCard
        title="Картошка"
        amount="Билетов: 1"
        description="Одна порция."
        picture={<SpriteImage src="/t.webp" alt="" />}
        status="Куплено · можно использовать"
        action={<Button>Хочу использовать</Button>}
      />,
    );
    const card = screen.getByRole('article', { name: 'Картошка' });
    expect(within(card).getByText('Билетов: 1')).toBeInTheDocument();
    expect(within(card).getByText('Одна порция.')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Хочу использовать' })).toBeInTheDocument();
  });
});
