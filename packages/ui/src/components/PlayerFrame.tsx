import { ArrowLeft } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { UiLink } from './Link';
import './Button.css';
import './PlayerFrame.css';

export interface PlayerFrameProps {
  readonly title: ReactNode;
  /** Above the title: the subject. */
  readonly eyebrow?: ReactNode;
  /** Where «Назад» leads. */
  readonly backHref: string;
  readonly backLabel?: string;
  /** StepList of the task. */
  readonly steps?: ReactNode;
  /** Overall progress (ProgressBar). */
  readonly progress?: ReactNode;
  /** Video, picture or scene above the content. */
  readonly media?: ReactNode;
  readonly children?: ReactNode;
  /** Buttons pinned to the bottom of the screen («Перейти к вопросам», «Я сделал»). */
  readonly actions?: ReactNode;
}

/** Full-screen frame of any task: header, steps, media, content, action bar. */
export function PlayerFrame({
  title,
  eyebrow,
  backHref,
  backLabel = 'Назад',
  steps,
  progress,
  media,
  children,
  actions,
}: PlayerFrameProps) {
  const titleId = useId();
  return (
    <div className="qc-player" data-has-actions={actions ? true : undefined}>
      <header className="qc-player-header">
        <UiLink
          href={backHref}
          className="qc-icon-btn qc-player-back"
          aria-label={backLabel}
          title={backLabel}
        >
          <ArrowLeft aria-hidden="true" />
        </UiLink>
        <div className="qc-player-titles">
          {eyebrow && <span className="qc-player-eyebrow">{eyebrow}</span>}
          <h1 id={titleId} className="qc-player-title">
            {title}
          </h1>
        </div>
      </header>
      <main className="qc-player-main" aria-labelledby={titleId}>
        {steps}
        {progress}
        {media && <div className="qc-player-media">{media}</div>}
        {children}
      </main>
      {actions && <div className="qc-player-actions">{actions}</div>}
    </div>
  );
}
