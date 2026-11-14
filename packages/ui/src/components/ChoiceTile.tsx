import { ArrowRight, Check, Lock } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../internal/cx';
import { UiLink } from './Link';
import './ChoiceTile.css';

export interface ChoiceTileProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'type'
> {
  /** Picture or icon on the left (subject icon). */
  readonly icon?: ReactNode;
  readonly label: ReactNode;
  /** The current choice of a filter (reported as pressed). */
  readonly selected?: boolean;
}

/** A tile of a choice grid: «Все предметы», «Математика»… */
export function ChoiceTile({ icon, label, selected = false, className, ...rest }: ChoiceTileProps) {
  return (
    <button
      type="button"
      className={cx('qc-choice', className)}
      aria-pressed={selected}
      data-selected={selected || undefined}
      {...rest}
    >
      {icon && (
        <span className="qc-choice-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="qc-choice-label">{label}</span>
    </button>
  );
}

export type ActionRowStatus = 'open' | 'done' | 'locked';

export interface ActionRowProps {
  readonly id: string;
  readonly title: ReactNode;
  /** «Математика · Можно открыть». */
  readonly description?: ReactNode;
  /** `done` shows a check, `locked` is not clickable, `open` shows an arrow. */
  readonly status?: ActionRowStatus;
  readonly href?: string;
  readonly onClick?: () => void;
}

const trailing: Record<ActionRowStatus, ReactNode> = {
  open: <ArrowRight aria-hidden="true" />,
  done: <Check aria-hidden="true" />,
  locked: <Lock aria-hidden="true" />,
};

function RowContent({ title, description, status = 'open' }: ActionRowProps) {
  return (
    <>
      <span className="qc-action-row-text">
        <span className="qc-action-row-title">{title}</span>
        {description && <span className="qc-action-row-description">{description}</span>}
      </span>
      <span className="qc-action-row-mark">{trailing[status]}</span>
    </>
  );
}

/** One row of an ActionList: a link, a button, or a disabled line. */
export function ActionRow(props: ActionRowProps) {
  const { status = 'open', href, onClick } = props;
  if (status !== 'locked' && href) {
    return (
      <UiLink href={href} className="qc-action-row" data-status={status}>
        <RowContent {...props} />
      </UiLink>
    );
  }
  if (status !== 'locked' && onClick) {
    return (
      <button type="button" className="qc-action-row" data-status={status} onClick={onClick}>
        <RowContent {...props} />
      </button>
    );
  }
  return (
    <div className="qc-action-row" data-status={status} aria-disabled={status === 'locked'}>
      <RowContent {...props} />
    </div>
  );
}

export interface ActionListProps {
  readonly label: string;
  readonly items: readonly ActionRowProps[];
  /** Shown instead of the list when there are no items. */
  readonly empty?: ReactNode;
}

/** A list of lessons or tasks with their status. */
export function ActionList({ label, items, empty }: ActionListProps) {
  if (items.length === 0) {
    return <p className="qc-action-list-empty">{empty}</p>;
  }
  return (
    <ul className="qc-action-list" aria-label={label}>
      {items.map((item) => (
        <li key={item.id}>
          <ActionRow {...item} />
        </li>
      ))}
    </ul>
  );
}
