// Live rooms: the «Ночной отель» schedule and director on fake timers (intervals, quiet, the 8 s
// tap pause, sound only after a gesture, stop on a hidden tab), the room's sound bank, and the
// choice of the scene component by `room.scene`.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroScene } from '../src';
import { DEFAULT_ROOM_SETTINGS, resetUserGesture } from '../src/scenes/common';
import {
  createRoomSchedule,
  NIGHT_HOTEL_EVENTS,
  NightHotelDirector,
  ROOM_QUIET,
  ROOM_TAP_COOLDOWN_MS,
  type Clock,
  type DirectorAudio,
  type NightHotelConditions,
  type NightHotelView,
  type RoomActivity,
} from '../src/scenes/eventScheduler';
import { createRoomAudio, soundResolver } from '../src/scenes/roomAudio';

const RUNNING: RoomActivity = { active: true, visible: true, animations: true, reduced: false };

/** A deterministic random sequence (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('night hotel schedule', () => {
  it('waits the quiet 20–35 s, then plays the event that is due', () => {
    const early = createRoomSchedule(0, { random: () => 0 });
    // random 0: quiet 20 s, lightning due at its shortest interval (20 s), others later.
    expect(early.next(19_999, RUNNING)).toBeNull();
    expect(early.next(20_000, RUNNING)?.id).toBe('lightning');
    // One event at a time.
    expect(early.next(60_000, RUNNING)).toBeNull();

    const late = createRoomSchedule(0, { random: () => 0.999_999 });
    // random ≈1: quiet 35 s, lightning due at 40 s.
    expect(late.next(39_999, RUNNING)).toBeNull();
    expect(late.next(40_000, RUNNING)?.id).toBe('lightning');
  });

  it('keeps every event inside its interval and the quiet between events', () => {
    const random = seeded(7);
    const schedule = createRoomSchedule(0, { random });
    const runs = new Map<string, number[]>();
    let finishedAt = 0;
    const gaps: number[] = [];
    for (let time = 0; time < 6 * 60 * 60 * 1000; time += 1000) {
      const event = schedule.next(time, RUNNING);
      if (!event) continue;
      if (finishedAt > 0) gaps.push(time - finishedAt);
      runs.set(event.id, [...(runs.get(event.id) ?? []), time]);
      finishedAt = time + event.durationMs;
      schedule.finish(finishedAt);
      time = finishedAt;
    }
    for (const event of NIGHT_HOTEL_EVENTS) {
      const times = runs.get(event.id) ?? [];
      expect(times.length, event.id).toBeGreaterThan(2);
      for (let i = 1; i < times.length; i += 1) {
        expect((times[i] ?? 0) - (times[i - 1] ?? 0), event.id).toBeGreaterThanOrEqual(
          event.interval[0] * 1000,
        );
      }
    }
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(ROOM_QUIET[0] * 1000);
  });

  it('a tap plays at once, then waits 8 s after the event ends; never the same event twice', () => {
    const schedule = createRoomSchedule(0, { random: seeded(3) });
    const first = schedule.interact(1000, RUNNING);
    expect(first).not.toBeNull();
    expect(schedule.interact(1500, RUNNING)).toBeNull(); // busy
    schedule.finish(4000);
    expect(schedule.tapWait(4000)).toBe(ROOM_TAP_COOLDOWN_MS);
    expect(schedule.interact(4000 + ROOM_TAP_COOLDOWN_MS - 1, RUNNING)).toBeNull();
    expect(schedule.tapWait(11_000)).toBe(1000);
    const second = schedule.interact(4000 + ROOM_TAP_COOLDOWN_MS, RUNNING);
    expect(second).not.toBeNull();
    expect(second?.id).not.toBe(first?.id);
  });

  it('nothing runs on a hidden tab, with reduced motion or with animations off', () => {
    for (const activity of [
      { ...RUNNING, visible: false },
      { ...RUNNING, reduced: true },
      { ...RUNNING, animations: false },
      { ...RUNNING, active: false },
    ]) {
      const schedule = createRoomSchedule(0, { random: () => 0 });
      expect(schedule.next(60_000, activity)).toBeNull();
      expect(schedule.interact(60_000, activity)).toBeNull();
    }
  });
});

const fakeClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

function fakeAudio() {
  const calls: string[] = [];
  const audio: DirectorAudio = {
    loop: (name) => calls.push(`loop:${name}`),
    effect: (name) => calls.push(`effect:${name}`),
    prepare: () => Promise.resolve(),
    stopEffects: () => calls.push('stop'),
    dispose: () => calls.push('dispose'),
  };
  return { audio, calls };
}

const CONDITIONS: NightHotelConditions = {
  ...RUNNING,
  sounds: true,
  atmosphere: true,
  music: false,
  gesture: false,
};

function director(random: () => number = () => 0) {
  const sound = fakeAudio();
  const createAudio = vi.fn(() => sound.audio);
  const loadClip = vi.fn((url: string) => Promise.resolve(`blob:${url}`));
  const releaseClip = vi.fn();
  let view: NightHotelView | null = null;
  const instance = new NightHotelDirector({
    layers: Object.fromEntries(NIGHT_HOTEL_EVENTS.map((e) => [e.id, `/layers/${e.id}.webp`])),
    createAudio,
    loadClip,
    releaseClip,
    clock: fakeClock,
    random,
    onChange: (next) => (view = next),
  });
  return { instance, sound, createAudio, loadClip, releaseClip, view: () => view };
}

describe('night hotel director', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('makes no sound before the learner has touched the page', () => {
    const { instance, createAudio, sound } = director();
    instance.update(CONDITIONS);
    expect(createAudio).not.toHaveBeenCalled();
    instance.update({ ...CONDITIONS, gesture: true });
    expect(createAudio).toHaveBeenCalledOnce();
    expect(sound.calls).toEqual(['loop:ambient_room_loop', 'loop:rain_loop']);
    instance.update({ ...CONDITIONS, gesture: true, sounds: false });
    expect(sound.calls.at(-1)).toBe('dispose');
    instance.dispose();
  });

  it('a due event loads, plays its sound after the delay and ends with the tap pause', async () => {
    const { instance, sound, loadClip, releaseClip, view } = director(() => 0);
    instance.update({ ...CONDITIONS, gesture: true });
    expect(view()?.running).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(loadClip).toHaveBeenCalledWith('/layers/lightning.webp', expect.any(AbortSignal));
    expect(view()?.clip?.event.id).toBe('lightning');
    expect(view()?.state).toBe('loading');
    instance.clipShown('lightning');
    expect(view()?.state).toBe('playing');
    await vi.advanceTimersByTimeAsync(300);
    expect(sound.calls).toContain('effect:thunder_01');
    await vi.advanceTimersByTimeAsync(1800); // the layer's 2.1 s
    expect(view()?.clip).toBeNull();
    expect(view()?.state).toBe('playing'); // the thunder still rolls
    await vi.advanceTimersByTimeAsync(3700); // 5.5 s of sound after a 0.3 s delay
    expect(view()?.state).toBe('idle');
    expect(view()?.tapWait).toBe(8);
    expect(releaseClip).toHaveBeenCalledWith('blob:/layers/lightning.webp');
    instance.dispose();
  });

  it('a hidden tab stops everything at once; nothing queued plays later', async () => {
    const { instance, loadClip, sound, view } = director(() => 0.5);
    instance.update({ ...CONDITIONS, gesture: true });
    instance.tap();
    await vi.advanceTimersByTimeAsync(0);
    expect(view()?.clip).not.toBeNull();
    const loads = loadClip.mock.calls.length;
    instance.update({ ...CONDITIONS, gesture: true, visible: false });
    expect(view()).toMatchObject({ running: false, clip: null, state: 'idle' });
    expect(sound.calls).toContain('stop');
    expect(sound.calls.at(-1)).toBe('dispose');
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(loadClip.mock.calls.length).toBe(loads);
    instance.tap();
    await vi.advanceTimersByTimeAsync(0);
    expect(loadClip.mock.calls.length).toBe(loads);
    instance.dispose();
  });

  it('a layer that fails is skipped and the room keeps working', async () => {
    const { instance, view } = director(() => 0);
    instance.update(CONDITIONS);
    instance.tap();
    await vi.advanceTimersByTimeAsync(0);
    const id = view()?.clip?.event.id ?? '';
    instance.clipFailed(id);
    expect(view()?.warning).toBe('Один из эффектов недоступен. Остальная комната работает.');
    expect(view()?.state).toBe('idle');
    instance.dispose();
  });
});

function fakeElement(play: () => Promise<void> = () => Promise.resolve()) {
  const element = {
    src: '',
    loop: false,
    volume: 1,
    preload: '',
    play: vi.fn(play),
    pause: vi.fn(),
    load: vi.fn(),
    removeAttribute: vi.fn((name: string) => {
      if (name === 'src') element.src = '';
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  return element;
}

describe('room audio', () => {
  it('loops once per name, one effect at a time, releases everything on dispose', () => {
    const made: ReturnType<typeof fakeElement>[] = [];
    const bank = createRoomAudio({
      resolve: soundResolver([
        '/a/ambient/rain_loop.ogg',
        '/a/events/door_creak.ogg',
        '/a/events/thunder_01.ogg',
      ]),
      createAudio: (src) => {
        const element = fakeElement();
        element.src = src;
        made.push(element);
        return element;
      },
    });
    bank.loop('rain_loop', 0.2);
    bank.loop('rain_loop', 0.2);
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ loop: true, volume: 0.2, src: '/a/ambient/rain_loop.ogg' });
    bank.effect('door_creak', 0.12);
    bank.effect('thunder_01', 0.1);
    expect(made[1]?.pause).toHaveBeenCalled(); // the creak made way for the thunder
    bank.effect('no_such_sound', 0.1);
    expect(made).toHaveLength(3);
    bank.dispose();
    expect(made[0]?.pause).toHaveBeenCalled();
    bank.loop('rain_loop', 0.2);
    expect(made).toHaveLength(3);
  });

  it('reports a blocked play', async () => {
    const onBlocked = vi.fn();
    const bank = createRoomAudio({
      resolve: () => '/a/x.ogg',
      onBlocked,
      createAudio: (src) => {
        const element = fakeElement(() => Promise.reject(new Error('NotAllowedError')));
        element.src = src;
        return element;
      },
    });
    bank.loop('x', 0.5);
    await Promise.resolve();
    await Promise.resolve();
    expect(onBlocked).toHaveBeenCalled();
  });
});

const roomBase = { image: '/room.webp', title: 'Комната', footAnchor: { x: 50, y: 75 } };

function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduced && query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

describe('scene by room.scene', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetUserGesture();
  });

  it('the same picture gets the layers of its scene type, not of its id', () => {
    const scenes = {
      static: null,
      'ambient:fairy': '.qc-ambient[data-theme="fairy"]',
      'ambient:water': '.qc-ambient[data-theme="water"]',
      rebound: '.qc-rebound',
      'ambient:rebound': '.qc-rebound',
      'night-hotel': '.qc-room-touch[aria-label="Оживить комнату: случайная анимация"]',
    } as const;
    for (const [scene, selector] of Object.entries(scenes)) {
      const { container, unmount } = render(
        <HeroScene room={{ ...roomBase, scene, assets: { layers: { curtain: '/c.webp' } } }} />,
      );
      const root = container.querySelector('.qc-scene');
      expect(root, scene).toHaveAttribute('data-room-scene', scene);
      expect(root, scene).toHaveAttribute('data-room-motion', scene === 'static' ? 'off' : 'on');
      if (selector) expect(container.querySelector(selector), scene).not.toBeNull();
      else expect(container.querySelector('.qc-room-layer'), scene).toBeNull();
      unmount();
    }
  });

  it('astro and an animated still room show the room animation', () => {
    for (const scene of ['astro', 'static']) {
      const { container, unmount } = render(
        <HeroScene room={{ ...roomBase, scene, assets: { motion: '/sky.webp' } }} />,
      );
      expect(container.querySelector('img.qc-room-motion'), scene).toHaveAttribute(
        'src',
        '/sky.webp',
      );
      unmount();
    }
  });

  it('reduced motion, animations off or a resting room keep the room still', () => {
    const room = { ...roomBase, scene: 'ambient:embers' };
    stubReducedMotion(true);
    const reduced = render(<HeroScene room={room} />);
    expect(reduced.container.querySelector('.qc-scene')).toHaveAttribute('data-room-motion', 'off');
    expect(reduced.container.querySelector('.qc-ambient')).toBeNull();
    reduced.unmount();
    vi.unstubAllGlobals();
    const off = render(
      <HeroScene room={room} settings={{ ...DEFAULT_ROOM_SETTINGS, animations: false }} />,
    );
    expect(off.container.querySelector('.qc-ambient')).toBeNull();
    off.unmount();
    const resting = render(<HeroScene room={room} active={false} />);
    expect(resting.container.querySelector('.qc-ambient')).toBeNull();
    resting.unmount();
  });

  it('an ambient room wakes with a burst of sparks on a tap; a preview has no touch', () => {
    vi.useFakeTimers();
    const { container, unmount } = render(
      <HeroScene room={{ ...roomBase, scene: 'ambient:forest' }} />,
    );
    expect(screen.getByText('Коснись комнаты — разбуди огоньки')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Оживить комнату' }));
    expect(container.querySelectorAll('.qc-ambient-burst i')).toHaveLength(8);
    expect(screen.queryByText('Коснись комнаты — разбуди огоньки')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(2200);
    });
    expect(container.querySelector('.qc-ambient-burst')).toBeNull();
    unmount();
    vi.useRealTimers();
    render(<HeroScene room={{ ...roomBase, scene: 'ambient:forest' }} preview />);
    expect(screen.queryByRole('button', { name: 'Оживить комнату' })).toBeNull();
  });

  it('the night hotel runs its touch and stops on a hidden tab', () => {
    const { container } = render(
      <HeroScene
        room={{
          ...roomBase,
          scene: 'night-hotel',
          assets: { layers: { candles: '/candles.webp', lightning: '/lightning.webp' } },
        }}
      />,
    );
    expect(screen.getByText('Коснись комнаты — она оживёт')).toBeInTheDocument();
    expect(container.querySelector('img[src="/candles.webp"]')).not.toBeNull();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(container.querySelector('.qc-room-touch')).toBeNull();
    expect(container.querySelector('img[src="/candles.webp"]')).toBeNull();
    expect(container.querySelector('.qc-scene')).toHaveAttribute('data-room-motion', 'off');
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(container.querySelector('.qc-room-touch')).not.toBeNull();
  });
});
