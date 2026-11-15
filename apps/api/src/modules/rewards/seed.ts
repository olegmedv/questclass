import { rewardTextKey } from '@questclass/shared/rewards/dto';
import type { Db } from '../../db/client';
import { rewardReasons } from '../../db/schema/rewardReasons';

export interface SeedRewardReason {
  readonly seedKey: string;
  readonly name: string;
  readonly xp: number;
  readonly coins: number;
}

/** The two default reasons of the original (spec/02 §2.3). */
export const SEED_REWARD_REASONS: readonly SeedRewardReason[] = [
  { seedKey: 'attendance', name: 'Присутствие на уроке', xp: 50, coins: 10 },
  { seedKey: 'homework', name: 'Домашняя работа', xp: 50, coins: 10 },
];

/**
 * Inserts the default reasons whose `seed_key` is missing (or whose name an active reason
 * already has). Existing rows are never changed, so the admin's renames and archiving survive
 * restarts. Returns the number of inserted reasons.
 */
export function seedRewardReasons(db: Db, now: number = Date.now()): number {
  return db.transaction(() => {
    let inserted = 0;
    for (const reason of SEED_REWARD_REASONS) {
      const result = db
        .insert(rewardReasons)
        .values({ ...reason, nameKey: rewardTextKey(reason.name), createdAt: now, updatedAt: now })
        .onConflictDoNothing()
        .run();
      inserted += result.changes;
    }
    return inserted;
  });
}
