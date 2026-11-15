// @vitest-environment jsdom
// FEAT-038: interface sounds — priorities, one at a time, 900 ms load cut-off, 55% default
// volume, OGG with MP3 for iOS, preferences on the device.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SOUND_PREFERENCES,
  MAX_LOAD_DELAY_MS,
  preferredFormat,
  SOUND_STORAGE_KEY,
  SoundManager,
  type AudioContextLike,
  type AudioFormat,
  type SourceLike,
} from '../src/features/sound/SoundManager';
import { SoundProvider, useSound } from '../src/features/sound/useSound';

interface Deferred {
  resolve(): void;
  reject(): void;
}

function fakeAudio({ format = 'ogg' }: { format?: AudioFormat } = {}) {
  const started: string[] = [];
  const stopped: string[] = [];
  const requested: string[] = [];
  const pending = new Map<string, Deferred>();
  let now = 0;
  let hidden = false;
  const gain = {
    value: 1,
    setValueAtTime(value: number) {
      this.value = value;
    },
  };
  const context: AudioContextLike = {
    state: 'running',
    currentTime: 0,
    destination: {},
    resume: () => Promise.resolve(),
    close: () => Promise.resolve(),
    decodeAudioData: (data) => Promise.resolve({ name: new TextDecoder().decode(data) }),
    createGain: () => ({ gain, connect: () => {} }),
    createBufferSource: () => {
      const source: SourceLike = {
        buffer: null,
        onended: null,
        connect: () => {},
        disconnect: () => {},
        start: () => started.push((source.buffer as { name: string }).name),
        stop: () => stopped.push((source.buffer as { name: string }).name),
      };
      return source;
    },
  };
  const manager = new SoundManager({
    createContext: () => context,
    load: (url) => {
      requested.push(url);
      const name = url.replace(/^.*\/(.*)\.\w+$/, '$1');
      return new Promise<ArrayBuffer>((resolve, reject) => {
        pending.set(name, {
          resolve: () => resolve(new TextEncoder().encode(name).buffer),
          reject: () => reject(new Error('offline')),
        });
      });
    },
    isHidden: () => hidden,
    now: () => now,
    format,
  });
  const flush = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  return {
    manager,
    gain,
    started,
    stopped,
    requested,
    load: (name: string) => pending.get(name)!,
    tick: (ms: number) => {
      now += ms;
    },
    hide: (value: boolean) => {
      hidden = value;
    },
    flush,
  };
}

describe('SoundManager', () => {
  it('defaults to sounds on at 55% volume', () => {
    const audio = fakeAudio();
    audio.manager.prime();
    expect(DEFAULT_SOUND_PREFERENCES).toEqual({ enabled: true, volume: 0.55 });
    expect(audio.gain.value).toBe(0.55);
  });

  it('plays one sound at a time: a new one replaces the current', async () => {
    const audio = fakeAudio();
    audio.manager.prime();
    audio.load('packet-magic').resolve();
    audio.load('level-enchantment').resolve();
    audio.manager.play('packet');
    await audio.flush();
    expect(audio.started).toEqual(['packet-magic']);
    audio.manager.play('level');
    await audio.flush();
    expect(audio.stopped).toEqual(['packet-magic']);
    expect(audio.started).toEqual(['packet-magic', 'level-enchantment']);
  });

  it('a less important sound never interrupts a more important one', async () => {
    const audio = fakeAudio();
    audio.manager.prime();
    audio.load('collection-blessing').resolve();
    audio.load('packet-magic').resolve();
    audio.manager.play('complete');
    await audio.flush();
    audio.manager.play('packet');
    await audio.flush();
    expect(audio.started).toEqual(['collection-blessing']);
    expect(audio.stopped).toEqual([]);
  });

  it('a more important sound wins even while the other is still loading', async () => {
    const audio = fakeAudio();
    audio.manager.prime();
    audio.manager.play('packet');
    audio.manager.play('level');
    audio.load('level-enchantment').resolve();
    audio.load('packet-magic').resolve();
    await audio.flush();
    expect(audio.started).toEqual(['level-enchantment']);
  });

  it(`a sound that loaded longer than ${MAX_LOAD_DELAY_MS} ms is dropped`, async () => {
    const audio = fakeAudio();
    audio.manager.prime();
    audio.manager.play('element');
    audio.tick(MAX_LOAD_DELAY_MS + 50);
    audio.load('element-shimmer').resolve();
    await audio.flush();
    expect(audio.started).toEqual([]);
    // Nothing is playing now, so a lower priority sound may play.
    audio.load('packet-magic').resolve();
    audio.manager.play('packet');
    await audio.flush();
    expect(audio.started).toEqual(['packet-magic']);
  });

  it('is silent when switched off, at zero volume, on a hidden tab or before priming', async () => {
    const audio = fakeAudio();
    audio.manager.play('level');
    audio.manager.prime();
    audio.load('level-enchantment').resolve();
    audio.manager.configure({ enabled: false, volume: 0.55 });
    audio.manager.play('level');
    audio.manager.configure({ enabled: true, volume: 0 });
    audio.manager.play('level');
    audio.manager.configure({ enabled: true, volume: 0.55 });
    audio.hide(true);
    audio.manager.play('level');
    await audio.flush();
    expect(audio.started).toEqual([]);
  });

  it('loads OGG, or MP3 when the device needs it', () => {
    const ogg = fakeAudio({ format: 'ogg' });
    ogg.manager.prime();
    expect(ogg.requested).toContain('/assets/game/ui-audio/level-enchantment.ogg');
    const mp3 = fakeAudio({ format: 'mp3' });
    mp3.manager.prime();
    expect(mp3.requested).toContain('/assets/game/ui-audio/level-enchantment.mp3');
  });

  it('picks MP3 on iOS (iPhone, iPadOS) and OGG elsewhere when supported', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
    const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari';
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36';
    expect(preferredFormat({ userAgent: iphone, maxTouchPoints: 5, oggSupport: 'probably' })).toBe(
      'mp3',
    );
    expect(preferredFormat({ userAgent: ipad, maxTouchPoints: 5, oggSupport: 'maybe' })).toBe(
      'mp3',
    );
    expect(preferredFormat({ userAgent: ipad, maxTouchPoints: 0, oggSupport: '' })).toBe('mp3');
    expect(preferredFormat({ userAgent: chrome, maxTouchPoints: 0, oggSupport: 'probably' })).toBe(
      'ogg',
    );
  });
});

describe('SoundProvider', () => {
  function Settings() {
    const sound = useSound();
    return (
      <>
        <p>
          {sound.preferences.enabled ? 'вкл' : 'выкл'} {Math.round(sound.preferences.volume * 100)}%
        </p>
        <button type="button" onClick={() => sound.update({ volume: 0.3 })}>
          Тише
        </button>
        <button type="button" onClick={() => sound.update({ enabled: false })}>
          Выключить
        </button>
      </>
    );
  }

  it('restores the device preferences and saves changes', async () => {
    localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify({ enabled: true, volume: 0.8 }));
    const audio = fakeAudio();
    render(
      <SoundProvider manager={audio.manager}>
        <Settings />
      </SoundProvider>,
    );
    expect(screen.getByText('вкл 80%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Тише' }));
    expect(screen.getByText('вкл 30%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Выключить' }));
    expect(JSON.parse(localStorage.getItem(SOUND_STORAGE_KEY)!)).toEqual({
      enabled: false,
      volume: 0.3,
    });
    expect(audio.manager.getPreferences()).toEqual({ enabled: false, volume: 0.3 });
    localStorage.clear();
  });

  it('broken stored preferences fall back to the defaults', () => {
    localStorage.setItem(SOUND_STORAGE_KEY, '{oops');
    render(
      <SoundProvider manager={fakeAudio().manager}>
        <Settings />
      </SoundProvider>,
    );
    expect(screen.getByText('вкл 55%')).toBeInTheDocument();
    localStorage.clear();
  });
});
