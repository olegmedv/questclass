import { useId, type ReactNode } from 'react';
import { Skeleton } from './Skeleton';
import { StepList, type Step } from './StepList';
import './LessonCard.css';

export interface LessonCardProps {
  /** Subject of the lesson: its name and a small icon (picture or Placeholder). */
  readonly subject?: { readonly name: string; readonly icon?: ReactNode };
  readonly title: ReactNode;
  /** Line under the title: «Урок от 12.11.2026», «Задание от родителя». */
  readonly meta?: ReactNode;
  /** The learner's hero on the right (a live hero). */
  readonly hero?: ReactNode;
  /** The big call to action («Начать урок»). */
  readonly action?: ReactNode;
  /** Steps of the lesson as icons: video → test → reward. */
  readonly steps?: readonly Step[];
  readonly loading?: boolean;
  readonly headingLevel?: 2 | 3;
}

/** The next lesson on the learner's home: subject, big title, hero, CTA and steps. */
export function LessonCard({
  subject,
  title,
  meta,
  hero,
  action,
  steps,
  loading = false,
  headingLevel = 2,
}: LessonCardProps) {
  const titleId = useId();
  const Heading = `h${headingLevel}` as const;
  return (
    <article
      className="qc-lesson"
      aria-labelledby={loading ? undefined : titleId}
      aria-label={loading ? 'Загружаем урок' : undefined}
      aria-busy={loading || undefined}
    >
      {subject && !loading && (
        <p className="qc-lesson-subject">
          {subject.icon && (
            <span className="qc-lesson-subject-icon" aria-hidden="true">
              {subject.icon}
            </span>
          )}
          <span>{subject.name}</span>
        </p>
      )}
      <div className="qc-lesson-body">
        <div className="qc-lesson-text">
          {loading ? (
            <Skeleton lines={3} />
          ) : (
            <Heading id={titleId} className="qc-lesson-title">
              {title}
            </Heading>
          )}
          {meta && !loading && <p className="qc-lesson-meta">{meta}</p>}
        </div>
        {hero && <div className="qc-lesson-hero">{hero}</div>}
      </div>
      {action && !loading && <div className="qc-lesson-action">{action}</div>}
      {steps && steps.length > 0 && !loading && (
        <StepList steps={steps} label="Шаги урока" compact />
      )}
    </article>
  );
}
