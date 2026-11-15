// «Серия занятий» on the learner's home: the compact row with the days of the cycle, expanding
// to the rule, the bonus and a preview of the bonus celebration (nothing is paid in the preview).
import { Button, Celebration, Inline, Play, StreakCard, Text } from '@questclass/ui';
import { APP_ASSETS, assetStem } from '@questclass/shared/assets/uses';
import type { StreakDto } from '@questclass/shared/progress/dto';
import { useState } from 'react';
import { useAssetDuration } from '../appearance/queries';
import { useSound } from '../sound/useSound';
import { STREAK_MOVIE, STREAK_MOVIE_FILE } from '../tasks/assets';
import { useWallet } from '../wallet/queries';
import { useStreak } from './queries';

/** The card stays expanded or compact on this device (as in the original). */
export const STREAK_EXPANDED_KEY = 'quest-streak-expanded';

function readExpanded(): boolean {
  try {
    return localStorage.getItem(STREAK_EXPANDED_KEY) === '1';
  } catch {
    return false;
  }
}

function storeExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(STREAK_EXPANDED_KEY, expanded ? '1' : '0');
  } catch {
    // Storage may be unavailable (private mode): the choice lives until the page reloads.
  }
}

/** The bonus of this cycle has been paid today: the cycle is complete. */
export function streakCompleted(streak: StreakDto): boolean {
  return streak.todayDone && streak.cycleProgress === streak.cycleDays;
}

/** The line under the rule: what to do next. */
export function streakNote(streak: StreakDto): string {
  if (streakCompleted(streak)) return 'Серия завершена! С завтрашнего дня можно начать новую.';
  if (streak.current === 0) {
    return `Начни новую серию в любой день. После старта — ${streak.cycleDays} дней подряд.`;
  }
  if (streak.todayDone) return 'Сегодня день уже засчитан. Приходи завтра!';
  return 'Заверши урок сегодня, чтобы серия не прервалась.';
}

export function StreakPanel() {
  const streak = useStreak();
  const wallet = useWallet();
  const sound = useSound();
  // A movie the admin replaced plays for its own length.
  const durationOf = useAssetDuration();
  const [expanded, setExpanded] = useState(readExpanded);
  const [preview, setPreview] = useState(false);
  // The streak is a bonus on the home: if it cannot load, the lessons still can.
  if (streak.isError) return null;
  const data = streak.data;
  const reward = data?.reward ?? { coins: 0, xp: 0 };
  return (
    <>
      <StreakCard
        progress={data?.cycleProgress ?? 0}
        cycleDays={data?.cycleDays ?? 5}
        reward={reward}
        completed={data ? streakCompleted(data) : false}
        expanded={expanded && Boolean(data)}
        loading={!data}
        onToggle={() => {
          setExpanded(!expanded);
          storeExpanded(!expanded);
        }}
      >
        <Text tone="muted" size="sm">
          День засчитывается, когда ты завершаешь тест урока. Ошибки не мешают серии.
        </Text>
        {data && (
          <Text tone="muted" size="sm">
            {streakNote(data)}
          </Text>
        )}
        <Inline>
          <Button
            size="sm"
            variant="ghost"
            icon={<Play aria-hidden="true" />}
            onClick={() => setPreview(true)}
          >
            Предпросмотр награды за серию
          </Button>
        </Inline>
      </StreakCard>
      <Celebration
        variant="streak"
        preview
        open={preview}
        onClose={() => setPreview(false)}
        reward={reward}
        totals={{
          coins: (wallet.data?.coins ?? 0) + reward.coins,
          xp: (wallet.data?.xp ?? 0) + reward.xp,
        }}
        movie={{
          ...STREAK_MOVIE,
          durationMs: durationOf(STREAK_MOVIE_FILE) ?? STREAK_MOVIE.durationMs,
          audio: `/assets/${assetStem(APP_ASSETS.streakSound.file)}.${sound.format}`,
        }}
        volume={sound.preferences.volume}
        onReward={() => sound.play('complete')}
      />
    </>
  );
}
