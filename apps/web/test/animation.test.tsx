// @vitest-environment jsdom
// FEAT-035: the animation manager (one hero at a time, modes, hidden tab, off screen,
// reduced motion) on fake timers, and LiveHero/AnimatedHero wired to it.
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AnimationManager,
  AnimationProvider,
  AUTOPLAY_PREVIEW_MS,
} from '../src/features/animation/AnimationManager';
import { LiveHero } from '../src/features/animation/LiveHero';

describe('AnimationManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function shown(
    manager: AnimationManager,
    id: string,
    mode: Parameters<AnimationManager['register']>[1],
  ) {
    manager.register(id, mode);
    manager.setVisible(id, true);
  }

  it('plays one animation at a time', () => {
    const manager = new AnimationManager();
    shown(manager, 'home', 'autoplay');
    shown(manager, 'other', 'autoplay');
    expect(manager.getActive()).toBe('home');
    manager.play('other');
    expect(manager.isPlaying('home')).toBe(false);
    expect(manager.isPlaying('other')).toBe(true);
    manager.stop('other');
    expect(manager.getActive()).toBeNull();
  });

  it('a hero does not start before it is on screen', () => {
    const manager = new AnimationManager();
    manager.register('hero', 'autoplay');
    expect(manager.getActive()).toBeNull();
    manager.setVisible('hero', true);
    expect(manager.getActive()).toBe('hero');
  });

  it('autoplay-3s moves for 3 s after loading, once', () => {
    const manager = new AnimationManager();
    shown(manager, 'home', 'autoplay-3s');
    expect(manager.isPlaying('home')).toBe(true);
    vi.advanceTimersByTime(10_000);
    // The poster is shown until the animation has loaded: time counts from the load.
    expect(manager.isPlaying('home')).toBe(true);
    manager.loaded('home');
    vi.advanceTimersByTime(AUTOPLAY_PREVIEW_MS - 1);
    expect(manager.isPlaying('home')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(manager.isPlaying('home')).toBe(false);
    manager.setVisible('home', false);
    manager.setVisible('home', true);
    expect(manager.isPlaying('home')).toBe(false);
  });

  it('on-demand waits for the button and toggles', () => {
    const manager = new AnimationManager();
    shown(manager, 'card', 'on-demand');
    expect(manager.getActive()).toBeNull();
    manager.toggle('card');
    expect(manager.isPlaying('card')).toBe(true);
    manager.loaded('card');
    vi.advanceTimersByTime(60_000);
    expect(manager.isPlaying('card')).toBe(true);
    manager.toggle('card');
    expect(manager.isPlaying('card')).toBe(false);
  });

  it('a hidden tab stops the animation; autoplay resumes when the tab is back', () => {
    const manager = new AnimationManager();
    shown(manager, 'hero', 'autoplay');
    manager.setPageHidden(true);
    expect(manager.getActive()).toBeNull();
    manager.play('hero');
    expect(manager.getActive()).toBeNull();
    manager.setPageHidden(false);
    expect(manager.isPlaying('hero')).toBe(true);
  });

  it('leaving the screen stops it; coming back resumes autoplay but not on-demand', () => {
    const manager = new AnimationManager();
    shown(manager, 'hero', 'autoplay');
    shown(manager, 'card', 'on-demand');
    manager.setVisible('hero', false);
    expect(manager.getActive()).toBeNull();
    manager.setVisible('hero', true);
    expect(manager.isPlaying('hero')).toBe(true);
    manager.play('card');
    manager.setVisible('card', false);
    expect(manager.getActive()).toBeNull();
    manager.setVisible('card', true);
    expect(manager.getActive()).toBeNull();
  });

  it('reduced motion turns autoplay off but a tap still works', () => {
    const manager = new AnimationManager();
    manager.setReducedMotion(true);
    shown(manager, 'hero', 'autoplay');
    shown(manager, 'home', 'autoplay-3s');
    expect(manager.getActive()).toBeNull();
    manager.play('hero');
    expect(manager.isPlaying('hero')).toBe(true);
  });

  it('switching to reduced motion stops an animation that started by itself', () => {
    const manager = new AnimationManager();
    shown(manager, 'hero', 'autoplay');
    expect(manager.isPlaying('hero')).toBe(true);
    manager.setReducedMotion(true);
    expect(manager.getActive()).toBeNull();
  });

  it('a hero that disappears stops; subscribers hear every change', () => {
    const manager = new AnimationManager();
    const listener = vi.fn();
    manager.subscribe(listener);
    const unregister = manager.register('hero', 'on-demand');
    manager.setVisible('hero', true);
    manager.play('hero');
    unregister();
    expect(manager.getActive()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('LiveHero', () => {
  const observers: { callback: IntersectionObserverCallback; element?: Element }[] = [];

  beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private readonly callback: IntersectionObserverCallback) {}
        observe(element: Element) {
          observers.push({ callback: this.callback, element });
        }
        disconnect() {}
      },
    );
  });

  function setOnScreen(index: number, isIntersecting: boolean) {
    const observer = observers[index]!;
    act(() => {
      observer.callback(
        [{ isIntersecting, target: observer.element } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
  }

  const hero = {
    poster: '/assets/game/characters/vampire-boy.webp',
    src: '/assets/game/animated/vampire-cape.webp',
    alt: 'Вампир',
  };

  it('shows the poster first and swaps to the animation only after it has loaded', async () => {
    render(
      <AnimationProvider>
        <LiveHero {...hero} />
      </AnimationProvider>,
    );
    setOnScreen(0, true);
    expect(screen.getByRole('img', { name: 'Вампир' })).toHaveAttribute('src', hero.poster);
    await userEvent.click(screen.getByRole('button', { name: 'Оживить героя' }));
    const button = screen.getByRole('button', { name: 'Остановить героя' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    // Still the poster that is announced while the animated picture loads.
    expect(screen.getByRole('img', { name: 'Вампир' })).toHaveAttribute('src', hero.poster);
    const motion = document.querySelector<HTMLImageElement>('img.qc-hero-motion')!;
    fireEvent.load(motion);
    expect(screen.getByRole('img', { name: 'Вампир' })).toHaveAttribute('src', hero.src);
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('only one of two heroes moves', async () => {
    render(
      <AnimationProvider>
        <LiveHero {...hero} alt="Первый" />
        <LiveHero {...hero} alt="Второй" />
      </AnimationProvider>,
    );
    setOnScreen(0, true);
    setOnScreen(1, true);
    const [first, second] = screen.getAllByRole('button', { name: 'Оживить героя' });
    await userEvent.click(first!);
    await userEvent.click(second!);
    expect(screen.getAllByRole('button', { name: 'Остановить героя' })).toHaveLength(1);
    expect(document.querySelectorAll('img.qc-hero-motion')).toHaveLength(1);
  });

  it('leaving the screen stops the hero (the animated picture is removed)', async () => {
    render(
      <AnimationProvider>
        <LiveHero {...hero} />
      </AnimationProvider>,
    );
    setOnScreen(0, true);
    await userEvent.click(screen.getByRole('button', { name: 'Оживить героя' }));
    expect(document.querySelector('img.qc-hero-motion')).not.toBeNull();
    setOnScreen(0, false);
    expect(document.querySelector('img.qc-hero-motion')).toBeNull();
    expect(screen.getByRole('button', { name: 'Оживить героя' })).toBeInTheDocument();
  });

  it('autoplay-3s starts by itself on screen and stops 3 s after loading', () => {
    vi.useFakeTimers();
    try {
      render(
        <AnimationProvider>
          <LiveHero {...hero} mode="autoplay-3s" controls={false} />
        </AnimationProvider>,
      );
      expect(document.querySelector('img.qc-hero-motion')).toBeNull();
      setOnScreen(0, true);
      const motion = document.querySelector<HTMLImageElement>('img.qc-hero-motion')!;
      fireEvent.load(motion);
      act(() => {
        vi.advanceTimersByTime(AUTOPLAY_PREVIEW_MS);
      });
      expect(document.querySelector('img.qc-hero-motion')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failed animation stops and says so; the button tries again', async () => {
    render(
      <AnimationProvider>
        <LiveHero {...hero} />
      </AnimationProvider>,
    );
    setOnScreen(0, true);
    await userEvent.click(screen.getByRole('button', { name: 'Оживить героя' }));
    fireEvent.error(document.querySelector('img.qc-hero-motion')!);
    expect(screen.getByRole('status')).toHaveTextContent('Не удалось загрузить анимацию');
    await userEvent.click(screen.getByRole('button', { name: 'Оживить героя' }));
    expect(document.querySelector('img.qc-hero-motion')).not.toBeNull();
  });

  it('a hero without animation has no button', () => {
    render(
      <AnimationProvider>
        <LiveHero poster={hero.poster} alt="Статичный" />
      </AnimationProvider>,
    );
    expect(screen.getByRole('img', { name: 'Статичный' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
