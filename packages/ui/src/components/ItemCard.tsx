import type { ReactNode } from 'react';
import { cx } from '../internal/cx';
import { Skeleton } from './Skeleton';
import './ItemCard.css';

export interface ItemCardProps {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  /** Picture of the item: `{src, alt}` or any node (e.g. a Placeholder or a live hero). */
  readonly media?: { readonly src: string; readonly alt: string } | ReactNode;
  /** Pixel art keeps hard edges when scaled. */
  readonly pixelated?: boolean;
  /** Top-left label, e.g. a Badge «Живой». */
  readonly badge?: ReactNode;
  /** Bottom line: price, status chip… */
  readonly footer?: ReactNode;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  /** Makes the whole card a button. */
  readonly onClick?: () => void;
  /** Accessible name when the card is a button and the title is not enough. */
  readonly actionLabel?: string;
}

function isImage(media: ItemCardProps['media']): media is { src: string; alt: string } {
  return typeof media === 'object' && media !== null && 'src' in media && 'alt' in media;
}

/** Catalog tile: shop goods, heroes, rooms, rewards, wishes. */
export function ItemCard({
  title,
  subtitle,
  media,
  pixelated = false,
  badge,
  footer,
  selected = false,
  disabled = false,
  loading = false,
  onClick,
  actionLabel,
}: ItemCardProps) {
  const picture = loading ? (
    <Skeleton ratio="1 / 1" />
  ) : isImage(media) ? (
    <img src={media.src} alt={media.alt} loading="lazy" decoding="async" />
  ) : (
    (media as ReactNode)
  );
  const body = (
    <>
      <span className="qc-item-card-media" data-pixelated={pixelated || undefined}>
        {picture}
        {badge && !loading && <span className="qc-item-card-badge">{badge}</span>}
      </span>
      <span className="qc-item-card-body">
        {loading ? (
          <Skeleton lines={2} />
        ) : (
          <>
            <span className="qc-item-card-title">{title}</span>
            {subtitle && <span className="qc-item-card-subtitle">{subtitle}</span>}
          </>
        )}
      </span>
      {footer && !loading && <span className="qc-item-card-footer">{footer}</span>}
    </>
  );
  const className = cx('qc-item-card', selected && 'qc-item-card-selected');
  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        disabled={disabled || loading}
        aria-pressed={selected}
        aria-label={actionLabel}
        aria-busy={loading || undefined}
      >
        {body}
      </button>
    );
  }
  return (
    <article
      className={className}
      aria-disabled={disabled || undefined}
      aria-busy={loading || undefined}
    >
      {body}
    </article>
  );
}
