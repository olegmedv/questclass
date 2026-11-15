// Interface sounds (spec/02 §2.15): four short effects with priorities, one at a time. A sound
// that took longer than 900 ms to load is dropped rather than announcing an old event late.
// Sounds never change progress; they only follow what the app already decided.
import { APP_ASSETS, assetStem } from '@questclass/shared/assets/uses';

export type InterfaceSound = 'packet' | 'element' | 'level' | 'complete';
export type AudioFormat = 'ogg' | 'mp3';

/** Asset key without extension (OGG and MP3 lie side by side) and priority (higher wins). */
export const INTERFACE_SOUNDS: Readonly<
  Record<InterfaceSound, { file: string; priority: number }>
> = {
  packet: { file: 'game/ui-audio/packet-magic', priority: 1 },
  element: { file: 'game/ui-audio/element-shimmer', priority: 2 },
  level: { file: 'game/ui-audio/level-enchantment', priority: 3 },
  complete: { file: assetStem(APP_ASSETS.rewardSound.file), priority: 4 },
};

export const MAX_LOAD_DELAY_MS = 900;

export interface SoundPreferences {
  readonly enabled: boolean;
  /** 0…1 */
  readonly volume: number;
}

export const DEFAULT_SOUND_PREFERENCES: SoundPreferences = { enabled: true, volume: 0.55 };

/** Stored on the device (same key as the original app). */
export const SOUND_STORAGE_KEY = 'quest-interface-sounds';

export function normalizePreferences(value: unknown): SoundPreferences {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<SoundPreferences>;
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_SOUND_PREFERENCES.enabled,
    volume:
      typeof raw.volume === 'number' && Number.isFinite(raw.volume)
        ? Math.min(1, Math.max(0, raw.volume))
        : DEFAULT_SOUND_PREFERENCES.volume,
  };
}

export interface PlatformInfo {
  readonly userAgent: string;
  readonly maxTouchPoints: number;
  /** `audio.canPlayType('audio/ogg; codecs="vorbis"')` */
  readonly oggSupport: string;
}

/** iPhone/iPad (including iPadOS that reports itself as a Mac) get MP3; others OGG if they can. */
export function preferredFormat(platform: PlatformInfo): AudioFormat {
  const ios =
    /iPad|iPhone|iPod/.test(platform.userAgent) ||
    (/Macintosh/.test(platform.userAgent) && platform.maxTouchPoints > 1);
  if (ios) return 'mp3';
  return platform.oggSupport === '' ? 'mp3' : 'ogg';
}

export function browserFormat(): AudioFormat {
  const probe = typeof document === 'undefined' ? null : document.createElement('audio');
  return preferredFormat({
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    maxTouchPoints: typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
    oggSupport: probe?.canPlayType?.('audio/ogg; codecs="vorbis"') ?? '',
  });
}

export function soundUrl(file: string, format: AudioFormat): string {
  return `/assets/${file}.${format}`;
}

/** The parts of Web Audio the manager uses (a fake one is injected in tests). */
export interface AudioContextLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  resume(): Promise<void>;
  close(): Promise<void>;
  decodeAudioData(data: ArrayBuffer): Promise<unknown>;
  createGain(): GainLike;
  createBufferSource(): SourceLike;
}

export interface GainLike {
  readonly gain: { value: number; setValueAtTime(value: number, time: number): void };
  connect(target: unknown): void;
}

export interface SourceLike {
  buffer: unknown;
  onended: (() => void) | null;
  connect(target: unknown): void;
  disconnect(): void;
  start(): void;
  stop(): void;
}

export interface SoundDependencies {
  createContext(): AudioContextLike | null;
  load(url: string): Promise<ArrayBuffer>;
  isHidden(): boolean;
  now(): number;
  format: AudioFormat;
}

export function browserDependencies(): SoundDependencies {
  return {
    createContext: () => {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      return Ctor ? (new Ctor() as unknown as AudioContextLike) : null;
    },
    load: async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Audio unavailable: ${url}`);
      return res.arrayBuffer();
    },
    isHidden: () => document.hidden,
    now: () => performance.now(),
    format: browserFormat(),
  };
}

export class SoundManager {
  private context: AudioContextLike | null = null;
  private master: GainLike | null = null;
  private resuming: Promise<void> = Promise.resolve();
  private preferences: SoundPreferences = DEFAULT_SOUND_PREFERENCES;
  private readonly buffers = new Map<InterfaceSound, Promise<unknown>>();
  private readonly sources = new Set<SourceLike>();
  /** Bumped on every stop/play: a late load of an older request is ignored. */
  private serial = 0;
  /** Priority of the sound that is playing or loading, -1 when silent. */
  private priority = -1;
  private disposed = false;

  constructor(private readonly deps: SoundDependencies) {}

  get format(): AudioFormat {
    return this.deps.format;
  }

  getPreferences(): SoundPreferences {
    return this.preferences;
  }

  configure(value: SoundPreferences): void {
    this.preferences = normalizePreferences(value);
    if (this.master && this.context) {
      this.master.gain.setValueAtTime(
        this.preferences.enabled ? this.preferences.volume : 0,
        this.context.currentTime,
      );
    }
    if (!this.preferences.enabled || this.preferences.volume === 0) this.stop();
  }

  /** Must run inside a user gesture once: browsers only start audio after one. */
  prime(): void {
    if (this.disposed || !this.audible() || this.deps.isHidden()) return;
    try {
      if (!this.context) {
        this.context = this.deps.createContext();
        if (!this.context) return;
        this.master = this.context.createGain();
        this.master.gain.value = this.preferences.volume;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') {
        this.resuming = this.context.resume().catch(() => undefined);
      }
      for (const name of Object.keys(INTERFACE_SOUNDS) as InterfaceSound[]) {
        this.buffer(name).catch(() => undefined);
      }
    } catch {
      // No audio on this device: stay silent.
    }
  }

  /**
   * Plays an effect unless a more important one is playing. Returns a function that stops it.
   * Lower priority never interrupts higher; equal or higher replaces the current sound.
   */
  play(name: InterfaceSound): () => void {
    const priority = INTERFACE_SOUNDS[name].priority;
    if (
      this.disposed ||
      !this.audible() ||
      this.deps.isHidden() ||
      !this.context ||
      priority < this.priority
    ) {
      return () => {};
    }
    this.stop();
    const token = this.serial;
    const context = this.context;
    const started = this.deps.now();
    this.priority = priority;
    void Promise.all([this.buffer(name), this.resuming]).then(
      ([buffer]) => {
        if (this.disposed || token !== this.serial) return;
        const late = this.deps.now() - started > MAX_LOAD_DELAY_MS;
        if (late || !this.audible() || this.deps.isHidden() || context.state !== 'running') {
          this.priority = -1;
          return;
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.master);
        this.sources.add(source);
        source.onended = () => {
          this.sources.delete(source);
          source.disconnect();
          if (token === this.serial) this.priority = -1;
        };
        source.start();
      },
      () => {
        if (token === this.serial) this.priority = -1;
      },
    );
    return () => {
      if (token === this.serial) this.stop();
    };
  }

  stop(): void {
    this.serial += 1;
    this.priority = -1;
    for (const source of this.sources) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Already finished.
      }
    }
    this.sources.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.buffers.clear();
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.master = null;
  }

  private audible(): boolean {
    return this.preferences.enabled && this.preferences.volume > 0;
  }

  private buffer(name: InterfaceSound): Promise<unknown> {
    let pending = this.buffers.get(name);
    if (!pending) {
      const context = this.context;
      if (!context) return Promise.reject(new Error('Audio is not primed'));
      pending = this.deps
        .load(soundUrl(INTERFACE_SOUNDS[name].file, this.deps.format))
        .then((data) => context.decodeAudioData(data));
      this.buffers.set(name, pending);
      pending.catch(() => this.buffers.delete(name));
    }
    return pending;
  }
}
