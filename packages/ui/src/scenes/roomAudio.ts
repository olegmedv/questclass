// Sounds of a live room: looping beds (atmosphere, music) and ONE effects channel. A room owns its
// bank; hiding, muting or leaving the room disposes it at once (spec/02 §2.8, behaviour of the
// original `lib/room-audio.ts`). URLs come resolved from the app (OGG or MP3 per device).

export interface AudioElementLike {
  src: string;
  loop: boolean;
  volume: number;
  preload: string;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface RoomAudio {
  /** Starts a looping bed once (repeated calls with the same name do nothing). */
  loop(name: string, volume: number): void;
  /** Plays an effect on the single effects channel (replaces the one playing). */
  effect(name: string, volume: number): void;
  /** Loads effects ahead (resolves after at most 2.5 s per sound). */
  prepare(names: readonly string[]): Promise<void>;
  stopEffects(): void;
  dispose(): void;
}

export interface RoomAudioOptions {
  /** URL of a sound by its name (`thunder_01`); null when the room has no such sound. */
  readonly resolve: (name: string) => string | null;
  /** The browser refused to play (no user gesture yet, or blocked). */
  readonly onBlocked?: () => void;
  readonly createAudio?: (src: string) => AudioElementLike;
}

const PREPARE_TIMEOUT_MS = 2500;

const browserAudio = (src: string): AudioElementLike => new Audio(src);

export function createRoomAudio({
  resolve,
  onBlocked,
  createAudio = browserAudio,
}: RoomAudioOptions): RoomAudio {
  const loops = new Map<string, AudioElementLike>();
  const prepared = new Map<string, AudioElementLike>();
  const pending = new Set<() => void>();
  let current: AudioElementLike | null = null;
  let disposed = false;

  const release = (audio: AudioElementLike) => {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  };
  const play = (audio: AudioElementLike) => {
    audio.play().catch(() => {
      if (audio.src) onBlocked?.();
    });
  };
  const make = (name: string): AudioElementLike | null => {
    const url = resolve(name);
    return url ? createAudio(url) : null;
  };

  return {
    loop(name, volume) {
      if (disposed || loops.has(name)) return;
      const audio = make(name);
      if (!audio) return;
      audio.loop = true;
      audio.volume = volume;
      loops.set(name, audio);
      play(audio);
    },
    effect(name, volume) {
      if (disposed) return;
      if (current) release(current);
      const audio = prepared.get(name) ?? make(name);
      prepared.delete(name);
      current = audio;
      if (!audio) return;
      audio.volume = volume;
      play(audio);
    },
    prepare(names) {
      return Promise.all(
        names.map(
          (name) =>
            new Promise<void>((done) => {
              if (disposed || prepared.has(name)) {
                done();
                return;
              }
              const audio = make(name);
              if (!audio) {
                done();
                return;
              }
              audio.preload = 'auto';
              prepared.set(name, audio);
              const finish = () => {
                clearTimeout(timer);
                pending.delete(finish);
                audio.removeEventListener('canplaythrough', finish);
                audio.removeEventListener('error', finish);
                done();
              };
              const timer = setTimeout(finish, PREPARE_TIMEOUT_MS);
              pending.add(finish);
              audio.addEventListener('canplaythrough', finish, { once: true });
              audio.addEventListener('error', finish, { once: true });
              audio.load();
            }),
        ),
      ).then(() => undefined);
    },
    stopEffects() {
      for (const finish of [...pending]) finish();
      if (current) {
        release(current);
        current = null;
      }
      for (const audio of prepared.values()) release(audio);
      prepared.clear();
    },
    dispose() {
      disposed = true;
      this.stopEffects();
      for (const audio of loops.values()) release(audio);
      loops.clear();
    },
  };
}

/**
 * Sounds of a room by name: `night-air` → the file of `sceneAssets.audio` whose name is
 * `night-air` (any folder and extension).
 */
export function soundResolver(urls: readonly string[]): (name: string) => string | null {
  const byName = new Map<string, string>();
  for (const url of urls) {
    const file = url.split('/').pop() ?? '';
    byName.set(file.replace(/\.[a-z0-9]+$/i, ''), url);
  }
  return (name) => byName.get(name) ?? null;
}
