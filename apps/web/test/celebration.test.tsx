// @vitest-environment jsdom
// FEAT-038: Celebration variants — pass, purchase, streak (movie, flight of coins and XP); the
// streak is shown once per bonus and device; reduced motion gives a static version; preview
// changes nothing.
import {
  Celebration,
  streakCelebrationKey,
  wasStreakCelebrated,
  type StreakCelebrationProps,
} from '@questclass/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

let play: MockInstance<HTMLMediaElement['play']>;
let pause: MockInstance<HTMLMediaElement['pause']>;

beforeEach(() => {
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('pass and purchase', () => {
  it('a passed task shows the rewards and closes with «Отлично!»', async () => {
    const onClose = vi.fn();
    const onReward = vi.fn();
    render(
      <Celebration
        variant="pass"
        open
        onClose={onClose}
        title="Тест пройден!"
        message="7 из 8 верно"
        reward={{ xp: 100, coins: 350 }}
        onReward={onReward}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Тест пройден!' })).toBeInTheDocument();
    expect(screen.getByText('+100 XP')).toBeInTheDocument();
    expect(screen.getByText(/\+350 монет/)).toBeInTheDocument();
    expect(onReward).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Отлично!' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('a purchase says what was spent and what is left', () => {
    render(
      <Celebration
        variant="purchase"
        open
        onClose={() => {}}
        item={{ name: 'Вампир', image: '/assets/game/characters/vampire-boy.webp' }}
        spent={40}
        balance={310}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Куплено!' })).toBeInTheDocument();
    expect(screen.getByText('Вампир. Потрачено 40 монет, осталось 310.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Вампир' })).toBeInTheDocument();
  });

  it('Escape closes it and the focus goes back', async () => {
    function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
      return (
        <>
          <button type="button">Сдать тест</button>
          <Celebration variant="pass" open={open} onClose={onClose} title="Зачёт" reward={{}} />
        </>
      );
    }
    const onClose = vi.fn();
    const { rerender } = render(<Harness open={false} onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Сдать тест' });
    opener.focus();
    rerender(<Harness open onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Отлично!' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    rerender(<Harness open={false} onClose={onClose} />);
    expect(opener).toHaveFocus();
  });

  it('flying coins and XP are drawn unless motion is reduced', () => {
    const { rerender } = render(
      <Celebration
        variant="pass"
        open
        onClose={() => {}}
        title="Зачёт"
        reward={{ xp: 10, coins: 5 }}
      />,
    );
    expect(document.querySelectorAll('.qc-celebration-token').length).toBeGreaterThan(0);
    rerender(
      <Celebration
        variant="pass"
        open
        onClose={() => {}}
        title="Зачёт"
        reward={{ xp: 10, coins: 5 }}
        reducedMotion
      />,
    );
    expect(document.querySelectorAll('.qc-celebration-token')).toHaveLength(0);
  });
});

describe('streak', () => {
  const movie = {
    src: '/assets/celebrations/streak-five-v1.webp',
    poster: '/assets/celebrations/streak-five-poster.webp',
    durationMs: 10_083,
    audio: '/assets/celebrations/streak-five-v1.ogg',
  };
  const base: StreakCelebrationProps = {
    variant: 'streak',
    open: true,
    onClose: () => {},
    reward: { coins: 200, xp: 200 },
    totals: { coins: 550, xp: 1331 },
    movie,
    reducedMotion: false,
  };

  function totals() {
    const coins = document.querySelector('[data-kind="coins"].qc-streak-total b')?.textContent;
    const xp = document.querySelector('[data-kind="xp"].qc-streak-total b')?.textContent;
    return { coins, xp };
  }

  it('plays the movie, then counts the rewards up to the confirmed totals', () => {
    vi.useFakeTimers();
    try {
      const onReward = vi.fn();
      render(<Celebration {...base} onReward={onReward} />);
      expect(
        screen.getByRole('img', { name: 'Герой побеждает и поднимает кубок' }),
      ).toBeInTheDocument();
      expect(totals()).toEqual({ coins: '350', xp: '1 131' });
      expect(onReward).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(movie.durationMs);
      });
      expect(screen.queryByRole('img', { name: 'Герой побеждает и поднимает кубок' })).toBeNull();
      expect(onReward).toHaveBeenCalledOnce();
      expect(document.querySelectorAll('.qc-celebration-token').length).toBeGreaterThan(0);
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(totals()).toEqual({ coins: '550', xp: '1 331' });
      expect(screen.getByRole('button', { name: 'Отлично!' })).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Награды уже на счету');
      expect(onReward).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('«К наградам» skips the movie and stops its sound', async () => {
    render(<Celebration {...base} />);
    expect(play).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'К наградам' }));
    expect(pause).toHaveBeenCalled();
    expect(screen.getByText('Пять дней — твои!')).toBeInTheDocument();
  });

  it('is remembered on this device once shown, so the bonus is celebrated once', () => {
    const key = streakCelebrationKey(2, 'bonus-17');
    expect(wasStreakCelebrated(key)).toBe(false);
    render(<Celebration {...base} seenKey={key} />);
    expect(wasStreakCelebrated(key)).toBe(true);
    expect(wasStreakCelebrated(streakCelebrationKey(2, 'bonus-18'))).toBe(false);
  });

  it('preview changes nothing and says so', () => {
    const key = streakCelebrationKey(2, 'bonus-17');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render(<Celebration {...base} preview seenKey={key} reducedMotion />);
    expect(setItem).not.toHaveBeenCalled();
    expect(wasStreakCelebrated(key)).toBe(false);
    expect(screen.getByText('ПРЕДПРОСМОТР')).toBeInTheDocument();
    expect(screen.getByText('Предпросмотр: ничего не начислено')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Закрыть предпросмотр' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Настоящий баланс не изменился');
  });

  it('reduced motion: a static version without the movie, sound or flights', () => {
    const onReward = vi.fn();
    render(<Celebration {...base} reducedMotion onReward={onReward} />);
    expect(document.querySelector('.qc-streak-movie')).toBeNull();
    expect(document.querySelector('audio')).toBeNull();
    expect(document.querySelectorAll('.qc-celebration-token')).toHaveLength(0);
    expect(totals()).toEqual({ coins: '550', xp: '1 331' });
    expect(screen.getByRole('button', { name: 'Отлично!' })).toBeInTheDocument();
    expect(onReward).toHaveBeenCalledOnce();
  });

  it('a movie that fails to load goes straight to the rewards with a note', () => {
    render(<Celebration {...base} />);
    fireEvent.error(document.querySelector('.qc-streak-movie')!);
    expect(screen.getByText('Ролик не загрузился. Награда сохранена.')).toBeInTheDocument();
  });

  it('a blocked soundtrack offers «Включить звук»', async () => {
    play.mockRejectedValueOnce(new Error('NotAllowed'));
    render(<Celebration {...base} />);
    expect(await screen.findByRole('button', { name: 'Включить звук' })).toBeInTheDocument();
  });
});
