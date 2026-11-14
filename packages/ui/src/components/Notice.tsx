import { CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import './Notice.css';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

const icons: Record<NoticeTone, ReactNode> = {
  info: <Info aria-hidden="true" />,
  success: <CircleCheck aria-hidden="true" />,
  warning: <TriangleAlert aria-hidden="true" />,
  danger: <TriangleAlert aria-hidden="true" />,
};

export interface NoticeProps {
  readonly tone?: NoticeTone;
  readonly children: ReactNode;
  /** Optional link or button after the text. */
  readonly action?: ReactNode;
}

/** An inline message in a form or a page. Warnings and errors are announced at once. */
export function Notice({ tone = 'info', children, action }: NoticeProps) {
  const urgent = tone === 'danger' || tone === 'warning';
  return (
    <div className="qc-notice" data-tone={tone} role={urgent ? 'alert' : 'status'}>
      {icons[tone]}
      <div className="qc-notice-text">{children}</div>
      {action}
    </div>
  );
}
