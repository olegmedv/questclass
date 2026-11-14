// The streak celebration is shown once per bonus and device. Only a presentation marker lives
// here; the reward itself is in the server ledger.

export const STREAK_CELEBRATION_PREFIX = 'quest-streak-celebration-v1:';

export interface MarkerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function deviceStorage(): MarkerStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function streakCelebrationKey(learnerId: number | string, bonusId: number | string): string {
  return `${STREAK_CELEBRATION_PREFIX}${learnerId}:${bonusId}`;
}

export function wasStreakCelebrated(key: string, storage = deviceStorage()): boolean {
  try {
    const value = storage?.getItem(key);
    return value !== null && value !== undefined;
  } catch {
    return false;
  }
}

export function markStreakCelebrated(key: string, storage = deviceStorage()): void {
  try {
    storage?.setItem(key, String(Date.now()));
  } catch {
    // Private mode: the celebration may show once more, which is harmless.
  }
}
