// React side of the interface sounds: one manager for the app, preferences on the device.
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  browserDependencies,
  normalizePreferences,
  SOUND_STORAGE_KEY,
  SoundManager,
  type AudioFormat,
  type InterfaceSound,
  type SoundPreferences,
} from './SoundManager';

export interface SoundApi {
  readonly preferences: SoundPreferences;
  readonly format: AudioFormat;
  update(patch: Partial<SoundPreferences>): void;
  play(name: InterfaceSound): () => void;
  prime(): void;
  stop(): void;
}

const SoundContext = createContext<SoundApi | null>(null);

function readStored(): SoundPreferences {
  try {
    const raw = localStorage.getItem(SOUND_STORAGE_KEY);
    return normalizePreferences(raw ? (JSON.parse(raw) as unknown) : null);
  } catch {
    return normalizePreferences(null);
  }
}

/**
 * Creates the manager, restores the device preferences, primes audio on the first tap or key
 * press and goes silent when the tab is hidden.
 */
export function SoundProvider({
  manager: injected,
  children,
}: {
  readonly manager?: SoundManager;
  readonly children: ReactNode;
}) {
  const [manager] = useState(() => injected ?? new SoundManager(browserDependencies()));
  const [preferences, setPreferences] = useState<SoundPreferences>(readStored);

  useEffect(() => {
    manager.configure(preferences);
  }, [manager, preferences]);

  useEffect(() => {
    const prime = () => manager.prime();
    const visibility = () => {
      if (document.hidden) manager.stop();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === SOUND_STORAGE_KEY || event.key === null) setPreferences(readStored());
    };
    window.addEventListener('pointerdown', prime, true);
    window.addEventListener('keydown', prime, true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('pointerdown', prime, true);
      window.removeEventListener('keydown', prime, true);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('storage', storage);
    };
  }, [manager]);

  // StrictMode mounts twice: the cleanup only silences; `dispose()` is for owners of a manager.
  useEffect(() => () => manager.stop(), [manager]);

  const update = useCallback(
    (patch: Partial<SoundPreferences>) => {
      const next = normalizePreferences({ ...preferences, ...patch });
      try {
        localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Private mode: the choice lasts until the tab closes.
      }
      manager.configure(next);
      if (next.enabled) manager.prime();
      setPreferences(next);
    },
    [manager, preferences],
  );

  const api = useMemo<SoundApi>(
    () => ({
      preferences,
      format: manager.format,
      update,
      play: (name) => manager.play(name),
      prime: () => manager.prime(),
      stop: () => manager.stop(),
    }),
    [manager, preferences, update],
  );
  return createElement(SoundContext.Provider, { value: api }, children);
}

export function useSound(): SoundApi {
  const api = useContext(SoundContext);
  if (!api) throw new Error('useSound() needs a <SoundProvider> above it');
  return api;
}
