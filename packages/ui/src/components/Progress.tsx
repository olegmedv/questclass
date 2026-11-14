import type { ReactNode } from 'react';
import './Progress.css';

export type ProgressTone = 'blue' | 'accent' | 'success' | 'xp';

function clampRatio(value: number, max: number): number {
  if (!(max > 0)) return 0;
  return Math.min(1, Math.max(0, value / max));
}

export interface ProgressBarProps {
  /** Omit while the value is unknown (indeterminate bar). */
  readonly value?: number;
  readonly max?: number;
  /** Accessible name; shown above the bar when `showLabel`. */
  readonly label: string;
  readonly showLabel?: boolean;
  /** Text on the right, e.g. «3 из 8». */
  readonly valueText?: string;
  readonly tone?: ProgressTone;
  readonly size?: 'sm' | 'md';
}

export function ProgressBar({
  value,
  max = 100,
  label,
  showLabel = false,
  valueText,
  tone = 'blue',
  size = 'md',
}: ProgressBarProps) {
  const ratio = value === undefined ? null : clampRatio(value, max);
  return (
    <div className="qc-progress" data-tone={tone} data-size={size}>
      {(showLabel || valueText) && (
        <div className="qc-progress-caption" aria-hidden="true">
          {showLabel && <span>{label}</span>}
          {valueText && <span className="qc-progress-value">{valueText}</span>}
        </div>
      )}
      <div
        className="qc-progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value === undefined ? undefined : Math.min(max, Math.max(0, value))}
        aria-valuetext={valueText}
        aria-busy={ratio === null || undefined}
      >
        <span
          className="qc-progress-fill"
          data-indeterminate={ratio === null || undefined}
          style={ratio === null ? undefined : { width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

export interface ProgressRingProps {
  readonly value: number;
  readonly max?: number;
  readonly label: string;
  readonly size?: number;
  readonly tone?: ProgressTone;
  /** Content in the middle (a number, an icon). */
  readonly children?: ReactNode;
}

export function ProgressRing({
  value,
  max = 100,
  label,
  size = 64,
  tone = 'blue',
  children,
}: ProgressRingProps) {
  const stroke = Math.max(4, Math.round(size / 10));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = clampRatio(value, max);
  return (
    <div
      className="qc-ring"
      data-tone={tone}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(max, Math.max(0, value))}
      style={{ width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle
          className="qc-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
        />
        <circle
          className="qc-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
      {children !== undefined && <span className="qc-ring-center">{children}</span>}
    </div>
  );
}
