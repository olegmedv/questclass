import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../internal/cx';
import './Typography.css';

export type HeadingLevel = 1 | 2 | 3 | 4;

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  readonly level?: HeadingLevel;
  /** Visual size, independent of the document level. */
  readonly size?: 'display' | 'xl' | 'lg' | 'md' | 'sm';
  readonly children: ReactNode;
}

const defaultSize: Record<HeadingLevel, NonNullable<HeadingProps['size']>> = {
  1: 'xl',
  2: 'lg',
  3: 'md',
  4: 'sm',
};

export function Heading({ level = 2, size, className, ...rest }: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <Tag className={cx('qc-heading', className)} data-size={size ?? defaultSize[level]} {...rest} />
  );
}

export interface TextProps extends HTMLAttributes<HTMLElement> {
  readonly as?: 'p' | 'span' | 'small' | 'strong' | 'div';
  readonly tone?:
    'default' | 'muted' | 'subtle' | 'accent' | 'blue' | 'danger' | 'success' | 'gold';
  readonly size?: 'xs' | 'sm' | 'md' | 'base' | 'lg';
  readonly weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  readonly children?: ReactNode;
}

export function Text({
  as: Tag = 'p',
  tone = 'default',
  size,
  weight,
  className,
  ...rest
}: TextProps) {
  return (
    <Tag
      className={cx('qc-text', className)}
      data-tone={tone}
      data-size={size}
      data-weight={weight}
      {...rest}
    />
  );
}

/** Text that only screen readers announce. */
export function VisuallyHidden({ children }: { readonly children: ReactNode }) {
  return <span className="qc-visually-hidden">{children}</span>;
}
