// FEAT-035: AnimatedHero is presentational — it renders what it is told and reports load/error.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnimatedHero } from '../src';

describe('AnimatedHero', () => {
  it('stopped: only the poster, the button offers to start', () => {
    render(
      <AnimatedHero
        poster="/p.webp"
        src="/a.webp"
        alt="Вампир"
        playing={false}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByRole('img', { name: 'Вампир' })).toHaveAttribute('src', '/p.webp');
    expect(document.querySelector('.qc-hero-motion')).toBeNull();
    expect(screen.getByRole('button', { name: 'Оживить героя' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('playing: reports the load and then announces the animation', () => {
    const onLoaded = vi.fn();
    render(
      <AnimatedHero poster="/p.webp" src="/a.webp" alt="Вампир" playing onLoaded={onLoaded} />,
    );
    fireEvent.load(document.querySelector('.qc-hero-motion')!);
    expect(onLoaded).toHaveBeenCalledOnce();
    expect(screen.getByRole('img', { name: 'Вампир' })).toHaveAttribute('src', '/a.webp');
    expect(document.querySelector('figure')).toHaveAttribute('data-moving', 'true');
  });

  it('CSS motion moves the poster itself', () => {
    render(<AnimatedHero poster="/p.webp" motion="float" alt="Фея" playing />);
    expect(document.querySelector('figure')).toHaveAttribute('data-motion', 'float');
  });

  it('a sprite cell is an image with the hero name', () => {
    render(
      <AnimatedHero
        poster="/special.webp"
        sprite={{ cols: 2, rows: 2, col: 1, row: 0 }}
        alt="Сик"
        playing={false}
      />,
    );
    const sprite = screen.getByRole('img', { name: 'Сик' });
    expect(sprite).toHaveStyle({ backgroundPosition: '100% 0%' });
  });

  it('disabled motion keeps a disabled button with an explanation', () => {
    render(
      <AnimatedHero
        poster="/p.webp"
        src="/a.webp"
        alt="Вампир"
        playing={false}
        onToggle={() => {}}
        disabled
      />,
    );
    expect(screen.getByRole('button', { name: 'Движение выключено' })).toBeDisabled();
  });
});
