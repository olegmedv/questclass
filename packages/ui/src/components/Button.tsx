import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../internal/cx';
import { Spinner } from './Spinner';
import './Button.css';

export type ButtonVariant = 'primary' | 'start' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonStyle {
  /** primary — warm accent; start — the big yellow «Начать»; secondary — raised blue. */
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Full width of the container. */
  readonly block?: boolean;
}

/** Class name of a button, for links (react-router `<Link>`) that must look like one. */
export function buttonClassName({ variant = 'secondary', size = 'md', block }: ButtonStyle = {}) {
  return cx('qc-btn', `qc-btn-${variant}`, `qc-btn-${size}`, block && 'qc-btn-block');
}

export interface ButtonProps extends ButtonStyle, ButtonHTMLAttributes<HTMLButtonElement> {
  /** Shows a spinner, keeps the label and blocks clicks. */
  readonly loading?: boolean;
  readonly icon?: ReactNode;
  readonly iconAfter?: ReactNode;
  readonly children: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  block,
  loading = false,
  icon,
  iconAfter,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(buttonClassName({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size="sm" label="" /> : icon}
      <span className="qc-btn-label">{children}</span>
      {iconAfter}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name (also the tooltip): an icon alone says nothing to a screen reader. */
  readonly label: string;
  readonly icon: ReactNode;
  readonly variant?: 'ghost' | 'secondary';
  readonly size?: 'sm' | 'md';
  /** Toggle buttons report their state. */
  readonly pressed?: boolean;
  /** Small counter on the corner (e.g. new items). */
  readonly badge?: ReactNode;
  readonly loading?: boolean;
}

export function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  pressed,
  badge,
  loading = false,
  disabled,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cx('qc-icon-btn', className)}
      data-variant={variant}
      data-size={size}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner size="sm" label="" /> : icon}
      {badge !== undefined && badge !== null && (
        <span className="qc-icon-btn-badge" aria-hidden="true">
          {badge}
        </span>
      )}
    </button>
  );
}
