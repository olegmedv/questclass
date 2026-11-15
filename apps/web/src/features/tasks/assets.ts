// Built-in game assets (FEAT-026) used by the learner screens, resolved through the manifest so a
// missing file is a build-time error, not a broken picture.
import manifestJson from '@questclass/shared/assets/manifest.json';
import { APP_ASSETS } from '@questclass/shared/assets/uses';

interface ManifestEntry {
  readonly kind: string;
  readonly animated?: boolean;
  readonly durationMs?: number;
}

const manifest = manifestJson as Record<string, ManifestEntry>;

/** URL of a manifest asset (`game/x.webp` → `/assets/game/x.webp`); throws for unknown keys. */
export function assetUrl(key: string): string {
  if (!manifest[key]) throw new Error(`Asset is not in the manifest: ${key}`);
  return `/assets/${key}`;
}

/** Length of a built-in animated file (undefined for a still or an unknown file). */
export function builtinDurationMs(key: string): number | undefined {
  return manifest[key]?.durationMs;
}

/** Length of an animated asset from the manifest. */
export function assetDurationMs(key: string): number {
  const duration = manifest[key]?.durationMs;
  if (duration === undefined) throw new Error(`Asset has no duration: ${key}`);
  return duration;
}

/**
 * Icon of a subject: its `icon` is an asset key without extension (`game/subjects-pixel/math`).
 * Null when the subject has no icon or the key is not a built-in picture (admin-created subject).
 */
export function subjectIconUrl(icon: string | null): string | null {
  if (!icon) return null;
  const key = `${icon}.webp`;
  return manifest[key]?.kind === 'image' ? `/assets/${key}` : null;
}

/** The logo of the header and the sign-in screen (the admin may replace it in «Оформление»). */
export const LOGO_URL = assetUrl(APP_ASSETS.logo.file);

/**
 * The hero on the home card while the learner's character is still loading (or has no look):
 * the blue explorer with its live greeting.
 */
export const STARTER_HERO = {
  poster: assetUrl(APP_ASSETS.starterHeroCover.file),
  src: assetUrl(APP_ASSETS.starterHero.file),
  alt: 'Твой герой',
} as const;

/** The streak bonus movie (FEAT-038): its file, the admin may replace it («Оформление»). */
export const STREAK_MOVIE_FILE = APP_ASSETS.streakMovie.file;

/** The streak bonus movie (FEAT-038) for the preview on the streak card. */
export const STREAK_MOVIE = {
  src: assetUrl(STREAK_MOVIE_FILE),
  poster: assetUrl(APP_ASSETS.streakPoster.file),
  durationMs: assetDurationMs(STREAK_MOVIE_FILE),
} as const;
