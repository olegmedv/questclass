/** Level progress derived from total XP (spec/02 §2.1): level = floor(max(0, XP) / perLevel) + 1. */
export interface LevelProgress {
  readonly level: number;
  /** XP collected inside the current level (0 … perLevel − 1). */
  readonly levelXp: number;
  /** XP still missing to the next level (1 … perLevel). */
  readonly xpToNext: number;
}

export function levelProgress(xp: number, xpPerLevel: number): LevelProgress {
  if (!Number.isInteger(xpPerLevel) || xpPerLevel <= 0) {
    throw new RangeError(`xpPerLevel must be a positive integer, got ${xpPerLevel}`);
  }
  const earned = Math.max(0, Math.trunc(xp));
  const levelXp = earned % xpPerLevel;
  return {
    level: Math.floor(earned / xpPerLevel) + 1,
    levelXp,
    xpToNext: xpPerLevel - levelXp,
  };
}
