import type { ImgHTMLAttributes } from 'react';
import { cx } from '../internal/cx';
import './IconImage.css';

/** `fill` takes the box of its container (tiles, cards); the rest are fixed squares (tokens). */
export type IconImageSize = 'fill' | 'sm' | 'md' | 'lg';

export interface IconImageProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'alt' | 'width' | 'height'
> {
  readonly src: string;
  /** Empty for a decorative picture next to its text. */
  readonly alt?: string;
  readonly size?: IconImageSize;
  /** Pixel art keeps hard edges; drawings and photos are smoothed. */
  readonly pixelated?: boolean;
}

/** A square picture of a fixed size: a subject icon in a list, a tile of an icon picker. */
export function IconImage({
  src,
  alt = '',
  size = 'fill',
  pixelated = false,
  className,
  ...rest
}: IconImageProps) {
  return (
    <img
      className={cx('qc-icon-image', className)}
      src={src}
      alt={alt}
      data-size={size}
      data-pixelated={pixelated || undefined}
      loading="lazy"
      decoding="async"
      {...rest}
    />
  );
}
