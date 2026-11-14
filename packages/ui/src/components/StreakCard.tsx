import { ChevronDown, Coins, Flame, Gift, Star, Zap } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import './StreakCard.css';

export interface StreakCardProps {
  /** Days of the current cycle, 0…cycleDays («3/5»). */
  readonly progress: number;
  readonly cycleDays: number;
  /** Bonus of a full cycle. */
  readonly reward: { readonly coins: number; readonly xp: number };
  readonly expanded: boolean;
  readonly onToggle: () => void;
  /** The bonus of this cycle has been paid (the cycle is complete today). */
  readonly completed?: boolean;
  /** The rule and the actions of the expanded card. */
  readonly children?: ReactNode;
  readonly loading?: boolean;
}

const number = (value: number) => value.toLocaleString('ru-RU');

/** «Серия занятий N/5»: a compact row with the days, expanding to the rule and the bonus. */
export function StreakCard({
  progress,
  cycleDays,
  reward,
  expanded,
  onToggle,
  completed = false,
  children,
  loading = false,
}: StreakCardProps) {
  const titleId = useId();
  const panelId = useId();
  const days = Array.from({ length: cycleDays }, (_, index) => index + 1);
  const done = Math.min(Math.max(progress, 0), cycleDays);
  return (
    <div
      className="qc-streak-card"
      data-expanded={expanded || undefined}
      aria-busy={loading || undefined}
    >
      <h2 className="qc-streak-card-heading">
        <button
          type="button"
          className="qc-streak-card-toggle"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
          disabled={loading}
        >
          <Flame className="qc-streak-card-flame" aria-hidden="true" />
          <span id={titleId} className="qc-streak-card-title">
            Серия занятий
          </span>
          <span className="qc-streak-card-count">
            {loading ? (
              <>
                <span aria-hidden="true">…</span>
                <span className="qc-visually-hidden">: загрузка</span>
              </>
            ) : (
              <>
                <span aria-hidden="true">
                  {done}/{cycleDays}
                </span>
                <span className="qc-visually-hidden">
                  : {done} из {cycleDays} дней
                </span>
              </>
            )}
          </span>
          <span className="qc-streak-card-dots" aria-hidden="true">
            {days.slice(0, -1).map((day) => (
              <span key={day} className="qc-streak-card-dot" data-done={day <= done || undefined} />
            ))}
            <Gift className="qc-streak-card-gift" data-done={done >= cycleDays || undefined} />
          </span>
          <ChevronDown className="qc-streak-card-chevron" aria-hidden="true" />
        </button>
      </h2>
      <div
        id={panelId}
        className="qc-streak-card-panel"
        role="region"
        aria-labelledby={titleId}
        hidden={!expanded}
      >
        <ol className="qc-streak-card-days">
          {days.map((day) => (
            <li key={day} className="qc-streak-card-day" data-done={day <= done || undefined}>
              <span className="qc-streak-card-day-mark" aria-hidden="true">
                {day === cycleDays ? <Star /> : day}
              </span>
              <span className="qc-streak-card-day-label">
                День {day}
                {day <= done && <span className="qc-visually-hidden">: засчитан</span>}
              </span>
            </li>
          ))}
        </ol>
        <div className="qc-streak-card-bonus">
          <strong>{completed ? 'Бонус получен!' : `За ${cycleDays} дней подряд`}</strong>
          <span className="qc-streak-card-prize">
            <span className="qc-streak-card-coins">
              <Coins aria-hidden="true" />+{number(reward.coins)}
              <span className="qc-visually-hidden"> монет</span>
            </span>
            <span className="qc-streak-card-xp">
              <Zap aria-hidden="true" />+{number(reward.xp)} XP
            </span>
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
