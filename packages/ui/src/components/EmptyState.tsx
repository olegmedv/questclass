import { useId, type ReactNode } from 'react';
import './EmptyState.css';

export interface EmptyStateProps {
  /** Icon or small artwork above the title. */
  readonly art?: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Buttons or links. */
  readonly actions?: ReactNode;
  /** `error` is announced at once (role=alert). */
  readonly tone?: 'default' | 'error';
  readonly headingLevel?: 1 | 2 | 3;
  /** Without a frame, e.g. as the content of a whole screen. */
  readonly plain?: boolean;
}

/** «Здесь пока пусто», «Не получилось загрузить», «Нет доступа». */
export function EmptyState({
  art,
  title,
  description,
  actions,
  tone = 'default',
  headingLevel = 2,
  plain = false,
}: EmptyStateProps) {
  const titleId = useId();
  const Heading = `h${headingLevel}` as const;
  return (
    <section
      className="qc-empty"
      data-tone={tone}
      data-plain={plain || undefined}
      role={tone === 'error' ? 'alert' : undefined}
      aria-labelledby={titleId}
    >
      {art && <div className="qc-empty-art">{art}</div>}
      <Heading id={titleId} className="qc-empty-title">
        {title}
      </Heading>
      {description && <p className="qc-empty-description">{description}</p>}
      {actions && <div className="qc-empty-actions">{actions}</div>}
    </section>
  );
}
