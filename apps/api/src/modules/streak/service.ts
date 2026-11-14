import type { RewardDto, StreakDto } from '@questclass/shared/progress/dto';
import { dayKey } from '@questclass/shared/time/dayKey';
import { and, asc, desc, eq, gte, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { progressResets } from '../../db/schema/progressResets';
import { streakDays } from '../../db/schema/streakDays';
import { idemKey, type LedgerService } from '../ledger/service';
import type { SettingsService } from '../settings/service';

export interface RecordDayResult {
  readonly dayKey: string;
  /** False when the day was already counted. */
  readonly created: boolean;
  /** Streak bonus paid by this call (0/0 when none). */
  readonly reward: RewardDto;
}

export interface StreakService {
  /**
   * Counts today (server clock, installation time zone) as a study day and pays the bonus when
   * the streak completes a cycle. Runs inside the caller's transaction (attempt `finish`, admin
   * closure). There is deliberately no way to record another day.
   */
  recordDay(learnerId: number): RecordDayResult;
  /** Read-only view of the streak. */
  view(learnerId: number): StreakDto;
}

export interface StreakDeps {
  readonly settings: SettingsService;
  readonly ledger: LedgerService;
  readonly clock?: () => number;
}

const DAY_MS = 86_400_000;
/** How many recent days of the current run the view lists. */
const MAX_LISTED_DAYS = 60;
const ZERO: RewardDto = { xp: 0, coins: 0 };

/** Day number of a `YYYY-MM-DD` key (calendar arithmetic, no time zone involved). */
const ordinal = (day: string): number => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

/** Splits ascending day keys into runs of consecutive days. */
function runsOf(days: readonly string[]): string[][] {
  const runs: string[][] = [];
  for (const day of days) {
    const current = runs.at(-1);
    const previous = current?.at(-1);
    if (current && previous !== undefined && ordinal(day) - ordinal(previous) === 1) {
      current.push(day);
    } else {
      runs.push([day]);
    }
  }
  return runs;
}

export function createStreakService(db: Db, deps: StreakDeps): StreakService {
  const { settings, ledger, clock = Date.now } = deps;
  const today = (): string => dayKey(clock(), settings.get('timezone'));

  /**
   * Day keys that count: those since the last full progress reset (inclusive of its day).
   * Read from `progress_resets` directly, because the progress service itself records days here.
   */
  const countedDays = (learnerId: number): string[] => {
    const reset = db
      .select({ at: progressResets.at })
      .from(progressResets)
      .where(
        and(
          eq(progressResets.learnerId, learnerId),
          isNull(progressResets.taskId),
          eq(progressResets.kind, 'reset'),
        ),
      )
      .orderBy(desc(progressResets.id))
      .get();
    const from = reset ? dayKey(reset.at, settings.get('timezone')) : null;
    return db
      .select({ day: streakDays.dayKey })
      .from(streakDays)
      .where(
        and(
          eq(streakDays.learnerId, learnerId),
          from === null ? undefined : gte(streakDays.dayKey, from),
        ),
      )
      .orderBy(asc(streakDays.dayKey))
      .all()
      .map((row) => row.day);
  };

  /** The run that ends today or yesterday, if any. */
  const currentRun = (days: readonly string[], todayKey: string): string[] => {
    const last = runsOf(days).at(-1) ?? [];
    const end = last.at(-1);
    return end !== undefined && ordinal(todayKey) - ordinal(end) <= 1 ? last : [];
  };

  return {
    recordDay(learnerId) {
      return db.transaction(() => {
        const key = today();
        const created =
          db
            .insert(streakDays)
            .values({ learnerId, dayKey: key, at: clock() })
            .onConflictDoNothing()
            .run().changes > 0;
        const run = currentRun(countedDays(learnerId), key);
        const cycle = settings.get('streak.days');
        let reward = ZERO;
        if (run.at(-1) === key && run.length > 0 && run.length % cycle === 0) {
          const firstDay = run[run.length - cycle] ?? key;
          const bonus = {
            xp: settings.get('streak.rewardXp'),
            coins: settings.get('streak.rewardCoins'),
          };
          const paid = ledger.post({
            learnerId,
            ...bonus,
            sourceType: 'streak',
            sourceId: firstDay,
            idemKey: idemKey('streak', learnerId, firstDay),
            note: `Серия занятий: ${cycle} дней подряд`,
          });
          reward = paid.created ? bonus : ZERO;
        }
        return { dayKey: key, created, reward };
      });
    },

    view(learnerId) {
      const key = today();
      const days = countedDays(learnerId);
      const run = currentRun(days, key);
      const cycle = settings.get('streak.days');
      const current = run.length;
      return {
        current,
        best: Math.max(0, ...runsOf(days).map((r) => r.length)),
        days: run.slice(-MAX_LISTED_DAYS),
        todayDone: run.at(-1) === key,
        cycleDays: cycle,
        cycleProgress: current === 0 ? 0 : ((current - 1) % cycle) + 1,
        nextRewardAt: current - (current % cycle) + cycle,
        reward: { xp: settings.get('streak.rewardXp'), coins: settings.get('streak.rewardCoins') },
      };
    },
  };
}
