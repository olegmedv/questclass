import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../internal/cx';
import './Layout.css';

export type Gap = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface LayoutProps extends HTMLAttributes<HTMLElement> {
  readonly as?: 'div' | 'section' | 'ul' | 'ol' | 'nav' | 'header' | 'footer';
  readonly gap?: Gap;
  readonly children?: ReactNode;
}

/** Vertical flow with a token gap. */
export function Stack({
  as: Tag = 'div',
  gap = 'md',
  align,
  className,
  ...rest
}: LayoutProps & { readonly align?: 'start' | 'center' | 'end' | 'stretch' }) {
  return <Tag className={cx('qc-stack', className)} data-gap={gap} data-align={align} {...rest} />;
}

/** Horizontal row that wraps; `justify` spreads items. */
export function Inline({
  as: Tag = 'div',
  gap = 'sm',
  justify,
  align = 'center',
  nowrap = false,
  className,
  ...rest
}: LayoutProps & {
  readonly justify?: 'start' | 'center' | 'end' | 'between';
  readonly align?: 'start' | 'center' | 'end' | 'baseline' | 'stretch';
  readonly nowrap?: boolean;
}) {
  return (
    <Tag
      className={cx('qc-inline', className)}
      data-gap={gap}
      data-justify={justify}
      data-align={align}
      data-nowrap={nowrap || undefined}
      {...rest}
    />
  );
}

/** Responsive grid of equal columns no narrower than `min`. */
export function Grid({
  as: Tag = 'div',
  gap = 'md',
  min = 'md',
  className,
  ...rest
}: LayoutProps & { readonly min?: 'xs' | 'sm' | 'md' | 'lg' }) {
  return <Tag className={cx('qc-grid', className)} data-gap={gap} data-min={min} {...rest} />;
}

/** Centres content and limits its width to one of the layout widths. */
export function Container({
  width = 'content',
  padded = false,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  readonly width?: 'content' | 'shell' | 'admin';
  /** Vertical page padding too (a page without a shell). */
  readonly padded?: boolean;
}) {
  return (
    <div
      className={cx('qc-container', className)}
      data-width={width}
      data-padded={padded || undefined}
      {...rest}
    />
  );
}
