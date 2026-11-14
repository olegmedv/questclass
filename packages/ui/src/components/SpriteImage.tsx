import type { CSSProperties } from 'react';
import { cx } from '../internal/cx';
import './SpriteImage.css';

/** A cell of a sprite sheet (columns and rows from 0). */
export interface SpriteCell {
  readonly cols: number;
  readonly rows: number;
  readonly col: number;
  readonly row: number;
}

export interface SpriteImageProps {
  readonly src: string;
  /** Show one cell of a sprite sheet instead of the whole picture. */
  readonly sprite?: SpriteCell | null;
  /** Empty for a decorative picture. */
  readonly alt: string;
  /** Pixel art keeps hard edges when scaled (default). */
  readonly pixelated?: boolean;
  readonly className?: string;
}

function cellStyle(src: string, sprite: SpriteCell): CSSProperties {
  const x = sprite.cols > 1 ? (sprite.col / (sprite.cols - 1)) * 100 : 0;
  const y = sprite.rows > 1 ? (sprite.row / (sprite.rows - 1)) * 100 : 0;
  return {
    backgroundImage: `url("${src}")`,
    backgroundSize: `${sprite.cols * 100}% ${sprite.rows * 100}%`,
    backgroundPosition: `${x}% ${y}%`,
  };
}

/** A game picture (ticket, hero, prize): the whole file or one cell of a sprite sheet. */
export function SpriteImage({ src, sprite, alt, pixelated = true, className }: SpriteImageProps) {
  const classes = cx('qc-sprite-image', pixelated && 'qc-sprite-image-pixelated', className);
  if (sprite) {
    return (
      <span
        className={classes}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        style={cellStyle(src, sprite)}
      />
    );
  }
  return <img className={classes} src={src} alt={alt} decoding="async" draggable={false} />;
}
