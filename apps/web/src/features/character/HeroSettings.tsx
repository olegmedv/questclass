// «Настройки героя»: the hero's name (saved on the server) and how the hero and its room behave on
// this device — motion of the hero and of the room, the room's sounds, atmosphere and music, and
// the interface sounds. Device settings apply at once and live in localStorage.
import type { CharacterDto } from '@questclass/shared/character/dto';
import { characterNameSchema } from '@questclass/shared/character/dto';
import {
  Button,
  Field,
  Heading,
  Modal,
  Notice,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput,
  usePrefersReducedMotion,
} from '@questclass/ui';
import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { useSound } from '../sound/useSound';
import { useCharacterName } from './useCharacter';

export interface HeroPreferences {
  /** The worn live hero moves by itself on the «Герой» screen. */
  readonly characterMotion: boolean;
  /** Live rooms move (ambient light, Night hotel events…). */
  readonly roomAnimations: boolean;
  /** The master switch of the room's sounds (atmosphere, events, music). */
  readonly roomSounds: boolean;
  readonly atmosphere: boolean;
  readonly music: boolean;
}

/** As in the original: sounds of rooms are off until the learner turns them on. */
export const DEFAULT_HERO_PREFERENCES: HeroPreferences = {
  characterMotion: true,
  roomAnimations: true,
  roomSounds: false,
  atmosphere: true,
  music: false,
};

export const HERO_PREFERENCES_KEY = 'quest-hero-preferences';

const KEYS = Object.keys(DEFAULT_HERO_PREFERENCES) as (keyof HeroPreferences)[];

export function normalizeHeroPreferences(value: unknown): HeroPreferences {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const result = { ...DEFAULT_HERO_PREFERENCES };
  for (const key of KEYS) {
    const flag = raw[key];
    if (typeof flag === 'boolean') result[key] = flag;
  }
  return result;
}

function read(): HeroPreferences {
  try {
    const raw = localStorage.getItem(HERO_PREFERENCES_KEY);
    return normalizeHeroPreferences(raw ? (JSON.parse(raw) as unknown) : null);
  } catch {
    return DEFAULT_HERO_PREFERENCES;
  }
}

// One snapshot for the whole app: every screen sees a change at once.
let snapshot: HeroPreferences | null = null;
const listeners = new Set<() => void>();

function current(): HeroPreferences {
  snapshot ??= read();
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const storage = (event: StorageEvent) => {
    if (event.key === HERO_PREFERENCES_KEY || event.key === null) {
      snapshot = read();
      listener();
    }
  };
  window.addEventListener('storage', storage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', storage);
  };
}

export function updateHeroPreferences(patch: Partial<HeroPreferences>): void {
  const next = normalizeHeroPreferences({ ...current(), ...patch });
  snapshot = next;
  try {
    localStorage.setItem(HERO_PREFERENCES_KEY, JSON.stringify(next));
  } catch {
    // Private mode: the choice lasts until the tab closes.
  }
  for (const listener of listeners) listener();
}

/** Forgets the cached snapshot (tests change localStorage between renders). */
export function resetHeroPreferencesCache(): void {
  snapshot = null;
}

export function useHeroPreferences(): HeroPreferences {
  return useSyncExternalStore(subscribe, current, () => DEFAULT_HERO_PREFERENCES);
}

export interface HeroSettingsProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly character: CharacterDto;
}

export function HeroSettings({ open, onClose, character }: HeroSettingsProps) {
  const prefs = useHeroPreferences();
  const sound = useSound();
  const reduced = usePrefersReducedMotion();
  const rename = useCharacterName();
  const [name, setName] = useState(character.name);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (rename.isPending) return;
    setName(character.name);
    setError(null);
    rename.reset();
    onClose();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = characterNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Проверь имя');
      return;
    }
    setError(null);
    if (parsed.data === character.name) {
      onClose();
      return;
    }
    rename.mutate(parsed.data, { onSuccess: () => onClose() });
  };
  const nameError = error ?? (rename.isError ? rename.error.message : undefined);

  return (
    <Modal
      open={open}
      onClose={close}
      title="Настройки героя"
      description="Имя, движение героя и комнаты, звуки."
      footer={
        <>
          <Button variant="primary" type="submit" form="hero-settings" loading={rename.isPending}>
            Сохранить
          </Button>
          <Button onClick={close} disabled={rename.isPending}>
            Закрыть
          </Button>
        </>
      }
    >
      <form id="hero-settings" onSubmit={submit} noValidate>
        <Stack gap="lg">
          <Field label="Имя героя" error={nameError}>
            <TextInput
              value={name}
              maxLength={30}
              placeholder="Придумай имя"
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </Field>
          <Stack gap="sm">
            <Heading level={3} size="sm">
              Движение
            </Heading>
            <Switch
              label="Герой двигается сам"
              description="Живой герой оживает на экране «Герой»."
              checked={prefs.characterMotion}
              onChange={(characterMotion) => updateHeroPreferences({ characterMotion })}
            />
            <Switch
              label="Анимации фона"
              description="Огоньки, молнии и другие чудеса живых комнат."
              checked={prefs.roomAnimations}
              onChange={(roomAnimations) => updateHeroPreferences({ roomAnimations })}
            />
            {reduced && (
              <Text size="sm" tone="muted">
                На устройстве уменьшено движение: герой и фон оживают только по кнопке.
              </Text>
            )}
          </Stack>
          <Stack gap="sm">
            <Heading level={3} size="sm">
              Звуки комнаты
            </Heading>
            <Switch
              label="Звуки комнаты"
              description="Общий выключатель атмосферы, событий и музыки."
              checked={prefs.roomSounds}
              onChange={(roomSounds) => updateHeroPreferences({ roomSounds })}
            />
            <Switch
              label="Атмосфера / дождь"
              checked={prefs.atmosphere}
              disabled={!prefs.roomSounds}
              onChange={(atmosphere) => updateHeroPreferences({ atmosphere })}
            />
            <Switch
              label="Музыка"
              checked={prefs.music}
              disabled={!prefs.roomSounds}
              onChange={(music) => updateHeroPreferences({ music })}
            />
          </Stack>
          <Stack gap="sm">
            <Heading level={3} size="sm">
              Волшебные звуки
            </Heading>
            <Switch
              label="Звуки интерфейса"
              description="Пакетики, новые элементы, уровни и собранные наборы."
              checked={sound.preferences.enabled}
              onChange={(enabled) => sound.update({ enabled })}
            />
            <Field label="Громкость">
              <Slider
                value={Math.round(sound.preferences.volume * 100)}
                onChange={(value) => sound.update({ volume: value / 100 })}
                step={5}
                format={(value) => `${value}%`}
                disabled={!sound.preferences.enabled}
              />
            </Field>
          </Stack>
          {rename.isError && !error && <Notice tone="danger">{rename.error.message}</Notice>}
        </Stack>
      </form>
    </Modal>
  );
}
