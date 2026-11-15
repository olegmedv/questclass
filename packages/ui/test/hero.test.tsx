// Fitting-room widgets: HeroScene (+ FittingRoom), HeroRibbon, DressEffect.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DressEffect, FittingRoom, HeroRibbon, HeroScene, type RibbonCard } from '../src';

const room = { image: '/room.webp', title: 'Звёздная студия', footAnchor: { x: 40, y: 79.5 } };

describe('HeroScene', () => {
  it('puts the hero on the room’s foot point, shifted by its foot offset', () => {
    const { container } = render(
      <HeroScene room={room} hero={<img src="/hero.webp" alt="Герой" />} footOffset={6} />,
    );
    expect(screen.getByRole('img', { name: 'Комната: Звёздная студия' })).toHaveAttribute(
      'src',
      '/room.webp',
    );
    const actor = container.querySelector<HTMLElement>('.qc-scene-actor');
    expect(actor?.style.getPropertyValue('--qc-foot-x')).toBe('40%');
    expect(actor?.style.getPropertyValue('--qc-foot-bottom')).toBe('20.5%');
    expect(actor?.style.getPropertyValue('--qc-foot-offset')).toBe('6%');
    expect(screen.getByRole('img', { name: 'Герой' })).toBeInTheDocument();
  });

  it('shows the dressing puff only while covering and revealing', () => {
    const { container, rerender } = render(<DressEffect phase="saving" />);
    expect(container.querySelector('.qc-dress')).toBeNull();
    rerender(<DressEffect phase="cover" />);
    expect(container.querySelector('.qc-dress')).toHaveAttribute('data-phase', 'cover');
    expect(container.querySelector('.qc-dress')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('.qc-dress-pixel')).toHaveLength(12);
    rerender(<DressEffect phase="reveal" />);
    expect(container.querySelector('.qc-dress')).toHaveAttribute('data-phase', 'reveal');
    rerender(<DressEffect phase="idle" />);
    expect(container.querySelector('.qc-dress')).toBeNull();
  });

  it('FittingRoom is a named section with the title, tools, scene, caption and wardrobe', () => {
    render(
      <FittingRoom
        title="Примерка"
        tools={<button type="button">Настройки героя</button>}
        scene={<HeroScene room={null} />}
        caption="Космонавт"
        wardrobe={<p>Гардероб</p>}
      />,
    );
    const section = screen.getByRole('region', { name: 'Примерочная' });
    expect(
      within(section).getByRole('heading', { level: 1, name: 'Примерка' }),
    ).toBeInTheDocument();
    expect(within(section).getByText('Космонавт')).toBeInTheDocument();
    expect(within(section).getByText('Гардероб')).toBeInTheDocument();
  });
});

const cards: RibbonCard[] = [
  { id: '1', title: 'Синий', picture: null, current: true, label: 'Синий, надет' },
  { id: '2', title: 'Вампир', picture: null, live: true, label: 'Вампир, живой' },
  { id: '3', title: 'Космонавт', picture: null, label: 'Космонавт' },
];

describe('HeroRibbon', () => {
  it('one tap chooses a card; arrows move between cards; the worn one is pressed', async () => {
    const onChoose = vi.fn();
    const onTabChange = vi.fn();
    render(
      <HeroRibbon
        label="Персонажи и комнаты"
        tabs={[
          { id: 'ordinary', label: 'Обычные' },
          { id: 'rooms', label: 'Комнаты' },
        ]}
        tab="ordinary"
        onTabChange={onTabChange}
        listLabel="Твои персонажи"
        cards={cards}
        onChoose={onChoose}
      />,
    );
    const list = screen.getByRole('list', { name: 'Твои персонажи' });
    expect(within(list).getByRole('button', { name: 'Синий, надет' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(within(list).getByRole('button', { name: 'Вампир, живой' }));
    expect(onChoose).toHaveBeenCalledWith('2');
    await userEvent.keyboard('{ArrowRight}');
    expect(within(list).getByRole('button', { name: 'Космонавт' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(within(list).getByRole('button', { name: 'Синий, надет' })).toHaveFocus();
    expect(onChoose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('tab', { name: 'Комнаты' }));
    expect(onTabChange).toHaveBeenCalledWith('rooms');
  });

  it('is disabled while saving and shows the empty message without cards', () => {
    const { rerender } = render(
      <HeroRibbon
        label="Гардероб"
        tabs={[{ id: 'live', label: 'Живые' }]}
        tab="live"
        onTabChange={() => {}}
        listLabel="Живые"
        cards={cards}
        onChoose={() => {}}
        disabled
      />,
    );
    for (const button of within(screen.getByRole('list')).getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
    rerender(
      <HeroRibbon
        label="Гардероб"
        tabs={[{ id: 'live', label: 'Живые' }]}
        tab="live"
        onTabChange={() => {}}
        listLabel="Живые"
        cards={[]}
        onChoose={() => {}}
        empty="Живые скины можно получить в магазине."
      />,
    );
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText('Живые скины можно получить в магазине.')).toBeInTheDocument();
  });
});
