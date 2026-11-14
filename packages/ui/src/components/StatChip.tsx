import { Coins, Shield, Ticket, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../internal/cx';
import './StatChip.css';

export type StatKind = 'level' | 'xp' | 'coins' | 'wishes' | 'neutral';

const icons: Record<Exclude<StatKind, 'neutral'>, ReactNode> = {
  level: <Shield aria-hidden="true" />,
  xp: <Zap aria-hidden="true" />,
  coins: <Coins aria-hidden="true" />,
  wishes: <Ticket aria-hidden="true" />,
};

export interface StatChipProps {
  readonly kind: StatKind;
  readonly value: string | number;
  /** What the number means («Монеты»). Always announced; shown when `showLabel`. */
  readonly label: string;
  readonly showLabel?: boolean;
  readonly icon?: ReactNode;
  readonly loading?: boolean;
  /** Turns the chip into a button (e.g. opens «Мои желания»). */
  readonly onClick?: () => void;
  readonly disabled?: boolean;
}

/** One number of the learner: level, XP, coins, wishes. */
export function StatChip({
  kind,
  value,
  label,
  showLabel = false,
  icon,
  loading = false,
  onClick,
  disabled,
}: StatChipProps) {
  const content = (
    <>
      {icon ?? (kind === 'neutral' ? null : icons[kind])}
      <span className="qc-visually-hidden">{label}: </span>
      <b className="qc-stat-value" aria-hidden={loading || undefined}>
        {loading ? '…' : value}
      </b>
      {loading && <span className="qc-visually-hidden">загрузка</span>}
      {showLabel && (
        <span className="qc-stat-label" aria-hidden="true">
          {label}
        </span>
      )}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        className={cx('qc-stat', 'qc-stat-button')}
        data-kind={kind}
        aria-label={loading ? `${label}: загрузка` : `${label}: ${value}`}
        onClick={onClick}
        disabled={disabled || loading}
      >
        {content}
      </button>
    );
  }
  return (
    <span className="qc-stat" data-kind={kind} aria-busy={loading || undefined}>
      {content}
    </span>
  );
}
