import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { DressEffect, type DressPhase } from './DressEffect';
import './Scene.css';

/** Where the hero's feet stand, in % of the 1536×1024 scene. */
export interface SceneFootAnchor {
  readonly x: number;
  readonly y: number;
}

/** The room of a scene (a still background for now; live scenes choose by `scene`). */
export interface SceneRoom {
  readonly image: string;
  readonly title: string;
  readonly footAnchor: SceneFootAnchor;
}

export interface HeroSceneProps {
  /** Null while unknown: an empty 3:2 frame. */
  readonly room: SceneRoom | null;
  /** The hero picture (an AnimatedHero). */
  readonly hero?: ReactNode;
  /** How far (in % of the hero picture height) the feet are above its bottom edge. */
  readonly footOffset?: number;
  readonly phase?: DressPhase;
  /** Things over the scene: hints, a «touch the room» button, warnings. */
  readonly children?: ReactNode;
  /** The background could not be loaded (the previous one stays). */
  readonly onBackdropError?: () => void;
}

/**
 * Keeps the previous background until the next one has loaded, so changing rooms never flashes
 * an empty frame (and a failed picture leaves the old room on screen).
 */
function useShownImage(wanted: string | null, onError?: () => void) {
  const [shown, setShown] = useState(wanted);
  const report = useRef(onError);
  useEffect(() => {
    report.current = onError;
  });
  const [state, setState] = useState<{ src: string | null; status: 'loading' | 'failed' }>({
    src: null,
    status: 'loading',
  });
  useEffect(() => {
    if (wanted === null || wanted === shown) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setShown(wanted);
    };
    image.onerror = () => {
      if (cancelled) return;
      setState({ src: wanted, status: 'failed' });
      report.current?.();
    };
    image.src = wanted;
    return () => {
      cancelled = true;
    };
  }, [wanted, shown]);
  const pending = wanted !== null && wanted !== shown;
  const failed = pending && state.src === wanted && state.status === 'failed';
  return { shown: shown ?? wanted, loading: pending && !failed, failed };
}

/**
 * The fitting-room scene: a 3:2 room (cover, pixel art kept sharp) with the hero standing on the
 * room's foot point (`footAnchor`); the hero moves, never the background.
 */
export function HeroScene({
  room,
  hero,
  footOffset = 4.4,
  phase = 'idle',
  children,
  onBackdropError,
}: HeroSceneProps) {
  const { shown, loading, failed } = useShownImage(room?.image ?? null, onBackdropError);
  const actorStyle = {
    '--qc-foot-x': `${room?.footAnchor.x ?? 50}%`,
    '--qc-foot-bottom': `${100 - (room?.footAnchor.y ?? 75)}%`,
    '--qc-foot-offset': `${footOffset}%`,
  } as CSSProperties;
  return (
    <div className="qc-scene" data-phase={phase}>
      {shown && (
        <img
          className="qc-scene-backdrop"
          src={shown}
          alt={room ? `Комната: ${room.title}` : ''}
          width={1536}
          height={1024}
          draggable={false}
        />
      )}
      {hero && (
        <div
          className="qc-scene-actor"
          style={actorStyle}
          aria-busy={phase !== 'idle' || undefined}
        >
          <div className="qc-scene-hero">{hero}</div>
          <DressEffect phase={phase} />
        </div>
      )}
      {children}
      {loading && (
        <span className="qc-scene-status" role="status">
          Загружаем комнату…
        </span>
      )}
      {failed && (
        <span className="qc-scene-status" role="alert">
          Фон не загрузился. Выбери другую комнату.
        </span>
      )}
    </div>
  );
}

export interface FittingRoomProps {
  /** «Примерка». */
  readonly title: ReactNode;
  /** Buttons on the right of the title (animations, rewards, settings). */
  readonly tools?: ReactNode;
  readonly scene: ReactNode;
  /** The name under the scene (the worn look or the room). */
  readonly caption?: ReactNode;
  /** Tabs and cards of the wardrobe. */
  readonly wardrobe: ReactNode;
  /** Error or saving status under the wardrobe. */
  readonly status?: ReactNode;
}

/** The «Герой» screen: the scene with its caption and the wardrobe (side by side when wide). */
export function FittingRoom({ title, tools, scene, caption, wardrobe, status }: FittingRoomProps) {
  return (
    <section className="qc-fitting" aria-label="Примерочная">
      <header className="qc-fitting-header">
        <h1 className="qc-fitting-title">{title}</h1>
        {tools && <div className="qc-fitting-tools">{tools}</div>}
      </header>
      <div className="qc-fitting-stage">
        {scene}
        {caption && <p className="qc-fitting-caption">{caption}</p>}
      </div>
      <div className="qc-fitting-wardrobe">
        {wardrobe}
        {status}
      </div>
    </section>
  );
}
