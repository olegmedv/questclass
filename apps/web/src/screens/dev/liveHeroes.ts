// Demo data of the gallery: every live hero and the 9 action animations of the original
// (QuestClass-Source lib/game-assets.ts `builtinAnimations`, lib/action-animations.ts), resolved
// against the asset manifest. The real catalog (prices, ownership) comes from the API (FEAT-017).
import manifestJson from '@questclass/shared/assets/manifest.json';
import type { HeroMotion, HeroSprite } from '@questclass/ui';

interface ManifestEntry {
  readonly kind: string;
  readonly animated?: boolean;
  readonly frames?: number;
  readonly durationMs?: number;
}

const manifest = manifestJson as Record<string, ManifestEntry>;

function asset(key: string): string {
  if (!manifest[key]) throw new Error(`Asset is not in the manifest: ${key}`);
  return `/assets/${key}`;
}

export interface LiveHeroDemo {
  readonly id: string;
  readonly name: string;
  readonly group: 'live' | 'action';
  readonly poster: string;
  readonly src?: string;
  readonly motion?: HeroMotion;
  readonly sprite?: HeroSprite;
  readonly frames?: number;
  readonly durationMs?: number;
}

interface Definition {
  readonly id: string;
  readonly name: string;
  readonly poster: string;
  readonly animation?: string;
  readonly motion?: HeroMotion;
  readonly sprite?: HeroSprite;
  /** Duration of CSS motions (animated WebP take theirs from the manifest). */
  readonly durationMs?: number;
}

const LIVE: readonly Definition[] = [
  {
    id: 'astro-idle',
    name: 'Астро · лунное парение',
    poster: 'game/characters/astro.webp',
    animation: 'game/characters/astro-idle.webp',
  },
  {
    id: 'rebound-float',
    name: 'Рибаунд · исчезновение',
    poster: 'game/characters/rebound-face.webp',
    animation: 'game/characters/rebound-float.webp',
  },
  {
    id: 'rebound-boy-idle',
    name: 'Мальчик-Рибаунд · живой костюм',
    poster: 'game/characters/rebound-boy-flight-cover.webp',
    animation: 'game/characters/rebound-boy-flight.webp',
  },
  {
    id: 'cadence-pendulum',
    name: 'Cadence · ритм времени',
    poster: 'game/characters/cadence-clock.webp',
    motion: 'pendulum',
    durationMs: 3200,
  },
  {
    id: 'blue-idle',
    name: 'Синий исследователь · приветствие',
    poster: 'game/animated/repaired/blue-idle-cover.webp',
    animation: 'game/animated/repaired/blue-idle.webp',
  },
  {
    id: 'dozer-drowsy',
    name: 'Мальчик-Дозер · сонное приветствие',
    poster: 'game/characters/dozer-boy.webp',
    animation: 'game/animated/dozer-drowsy.webp',
  },
  {
    id: 'mart-bounce',
    name: 'Март · прыжок и покачивание',
    poster: 'game/characters/mart-round.webp',
    motion: 'bounce',
    durationMs: 2800,
  },
  {
    id: 'mart-boy-wave',
    name: 'Мальчик-Март · приветствие',
    poster: 'game/characters/mart-boy.webp',
    animation: 'game/animated/mart-boy-wave.webp',
  },
  {
    id: 'vampire-cape',
    name: 'Вампир · оживший плащ',
    poster: 'game/characters/vampire-boy.webp',
    animation: 'game/animated/vampire-cape.webp',
  },
  {
    id: 'fairy-float',
    name: 'Фея · волшебный полёт',
    poster: 'game/characters/fairy-boy.webp',
    motion: 'float',
    durationMs: 3400,
  },
  {
    id: 'seek-sway',
    name: 'Сик · движение тени',
    poster: 'game/special.webp',
    sprite: { cols: 2, rows: 2, col: 1, row: 0 },
    motion: 'sway',
    durationMs: 3000,
  },
];

const ACTIONS: readonly (readonly [string, string])[] = [
  ['hero-punch', 'Супергерой · удар'],
  ['hero-hair', 'Супергерой · куда делись волосы?'],
  ['claw-show', 'Когтистый герой · показывает когти'],
  ['fairy-swing', 'Фея · взмах топориком'],
  ['fairy-magic', 'Фея · волшебные искры'],
  ['vampire-juice', 'Вампир · красный сок'],
  ['vampire-bat', 'Вампир · летучая мышь'],
  ['vampire-awakening', 'Вампир · пробуждение'],
  ['boy-fairy', 'Мальчик · превращение в фею'],
];

function resolve(definition: Definition, group: LiveHeroDemo['group']): LiveHeroDemo {
  const entry = definition.animation ? manifest[definition.animation] : undefined;
  if (definition.animation && !entry?.animated) {
    throw new Error(`Not an animated asset: ${definition.animation}`);
  }
  return {
    id: definition.id,
    name: definition.name,
    group,
    poster: asset(definition.poster),
    ...(definition.animation && { src: asset(definition.animation) }),
    ...(definition.motion && { motion: definition.motion }),
    ...(definition.sprite && { sprite: definition.sprite }),
    ...(entry?.frames !== undefined && { frames: entry.frames }),
    durationMs: entry?.durationMs ?? definition.durationMs,
  };
}

export const LIVE_HEROES: readonly LiveHeroDemo[] = [
  ...LIVE.map((definition) => resolve(definition, 'live')),
  ...ACTIONS.map(([id, name]) => {
    // «Красный сок» kept the id of an older file; its frames were redrawn as vampire-drink-v2.
    const file =
      id === 'vampire-juice' ? 'game/animated/vampire-drink-v2' : `game/animated/repaired/${id}`;
    return resolve({ id, name, poster: `${file}-cover.webp`, animation: `${file}.webp` }, 'action');
  }),
];

export function describeHero(hero: LiveHeroDemo): string {
  const seconds = ((hero.durationMs ?? 0) / 1000).toLocaleString('ru-RU', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return hero.frames !== undefined
    ? `${hero.frames} кадров · ${seconds} с`
    : `CSS-движение · ${seconds} с`;
}
