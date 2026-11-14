import { useState, type CSSProperties, type Ref } from 'react';
import { Play, Square } from 'lucide-react';
import { cx } from '../../internal/cx';
import { Spinner } from '../Spinner';
import './AnimatedHero.css';

/** Motion drawn with CSS on the still picture (heroes without an animated WebP). */
export type HeroMotion = 'bounce' | 'float' | 'pendulum' | 'sway';

/** A cell of a sprite sheet used as the still picture. */
export interface HeroSprite {
  readonly cols: number;
  readonly rows: number;
  readonly col: number;
  readonly row: number;
}

export interface AnimatedHeroProps {
  /** Still picture, shown until the animation has loaded (and whenever it is stopped). */
  readonly poster: string;
  readonly sprite?: HeroSprite;
  /** Animated WebP. Without it and without `motion` the hero is simply static. */
  readonly src?: string;
  readonly motion?: HeroMotion;
  readonly alt: string;
  /** Decided by the animation manager: only one hero moves at a time. */
  readonly playing: boolean;
  /** Shows the «Оживить героя» / «Остановить героя» button. */
  readonly onToggle?: () => void;
  /** The animated picture has loaded (the manager starts its timers from here). */
  readonly onLoaded?: () => void;
  readonly onError?: () => void;
  /** Motion is switched off on this device: the button stays but is disabled. */
  readonly disabled?: boolean;
  readonly pixelated?: boolean;
  readonly ref?: Ref<HTMLElement>;
}

function spriteStyle(poster: string, sprite: HeroSprite): CSSProperties {
  const x = sprite.cols > 1 ? (sprite.col / (sprite.cols - 1)) * 100 : 0;
  const y = sprite.rows > 1 ? (sprite.row / (sprite.rows - 1)) * 100 : 0;
  return {
    backgroundImage: `url("${poster}")`,
    backgroundSize: `${sprite.cols * 100}% ${sprite.rows * 100}%`,
    backgroundPosition: `${x}% ${y}%`,
  };
}

/** A hero picture that can come alive. Presentational: playback is decided outside. */
export function AnimatedHero({
  poster,
  sprite,
  src,
  motion,
  alt,
  playing,
  onToggle,
  onLoaded,
  onError,
  disabled = false,
  pixelated = true,
  ref,
}: AnimatedHeroProps) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const animated = Boolean(src || motion);
  const showMotionImage = playing && Boolean(src) && failedSrc !== src;
  const loaded = showMotionImage && loadedSrc === src;
  const moving = playing && (src ? loaded : Boolean(motion));
  const failed = Boolean(src) && failedSrc === src;
  const busy = playing && Boolean(src) && !loaded && !failed;
  const label = disabled ? 'Движение выключено' : playing ? 'Остановить героя' : 'Оживить героя';

  return (
    <figure
      ref={ref}
      className={cx('qc-hero', pixelated && 'qc-hero-pixelated')}
      data-playing={playing || undefined}
      data-moving={moving || undefined}
      data-loaded={loaded || undefined}
      data-motion={playing && !src ? motion : undefined}
    >
      <div className="qc-hero-frame">
        {sprite ? (
          <span
            className="qc-hero-poster qc-hero-sprite"
            role="img"
            aria-label={loaded ? undefined : alt}
            aria-hidden={loaded || undefined}
            style={spriteStyle(poster, sprite)}
          />
        ) : (
          <img
            className="qc-hero-poster"
            src={poster}
            alt={loaded ? '' : alt}
            decoding="async"
            draggable={false}
          />
        )}
        {showMotionImage && (
          <img
            className="qc-hero-motion"
            src={src}
            alt={loaded ? alt : ''}
            draggable={false}
            onLoad={() => {
              setLoadedSrc(src ?? null);
              onLoaded?.();
            }}
            onError={() => {
              setFailedSrc(src ?? null);
              onError?.();
            }}
          />
        )}
      </div>
      {animated && onToggle && (
        <button
          type="button"
          className="qc-hero-toggle"
          aria-pressed={playing}
          aria-label={label}
          title={label}
          aria-busy={busy || undefined}
          disabled={disabled}
          onClick={() => {
            setFailedSrc(null);
            onToggle();
          }}
        >
          {busy ? (
            <Spinner size="sm" label="" />
          ) : playing ? (
            <Square aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" />
          )}
        </button>
      )}
      {failed && (
        <figcaption className="qc-hero-error" role="status">
          Не удалось загрузить анимацию. Нажми ещё раз.
        </figcaption>
      )}
    </figure>
  );
}
