import { useId, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../internal/cx';
import { Skeleton } from './Skeleton';
import './Card.css';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  readonly as?: 'section' | 'article' | 'div';
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  /** Buttons or links on the right of the title. */
  readonly actions?: ReactNode;
  readonly tone?: 'default' | 'raised' | 'accent' | 'danger';
  readonly padding?: 'none' | 'md' | 'lg';
  /** Placeholder lines instead of the content while data loads. */
  readonly loading?: boolean;
  readonly headingLevel?: 2 | 3 | 4;
  readonly children?: ReactNode;
}

export function Card({
  as: Tag = 'section',
  title,
  description,
  actions,
  tone = 'default',
  padding = 'md',
  loading = false,
  headingLevel = 2,
  className,
  children,
  ...rest
}: CardProps) {
  const titleId = useId();
  const Heading = `h${headingLevel}` as const;
  return (
    <Tag
      className={cx('qc-card', className)}
      data-tone={tone}
      data-padding={padding}
      aria-labelledby={title ? titleId : undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {(title || actions) && (
        <header className="qc-card-header">
          <div className="qc-card-titles">
            {title && (
              <Heading id={titleId} className="qc-card-title">
                {title}
              </Heading>
            )}
            {description && <p className="qc-card-description">{description}</p>}
          </div>
          {actions && <div className="qc-card-actions">{actions}</div>}
        </header>
      )}
      {loading ? <Skeleton lines={3} /> : children}
    </Tag>
  );
}
