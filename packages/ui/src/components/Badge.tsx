import type { ReactNode } from 'react';
import './Badge.css';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'live' | 'gold';

export interface BadgeProps {
  readonly tone?: BadgeTone;
  readonly icon?: ReactNode;
  readonly children: ReactNode;
}

/** Short status label: «Живой», «Куплено», «Ждёт проверки», «Ждут выдачи: 1»… */
export function Badge({ tone = 'neutral', icon, children }: BadgeProps) {
  return (
    <span className="qc-badge" data-tone={tone}>
      {icon}
      {children}
    </span>
  );
}
