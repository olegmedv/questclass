import { Play, Square } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { AmbientScene, type AmbientTheme } from '../scenes/Ambient';
import { AstroScene } from '../scenes/Astro';
import {
  DEFAULT_ROOM_SETTINGS,
  useRoomMotion,
  type LiveRoomProps,
  type RoomSceneAssets,
  type RoomSceneSettings,
} from '../scenes/common';
import { NightHotelScene } from '../scenes/NightHotel';
import { ReboundScene } from '../scenes/Rebound';
import { StaticScene } from '../scenes/Static';
import { DressEffect, type DressPhase } from './DressEffect';
import './Scene.css';

/** Where the hero's feet stand, in % of the 1536×1024 scene. */
export interface SceneFootAnchor {
  readonly x: number;
  readonly y: number;
}

/** The room of a scene; its live layers are chosen by `scene` (never by the room's id). */
export interface SceneRoom {
  readonly image: string;
  readonly title: string;
  readonly footAnchor: SceneFootAnchor;
  /** `static`, `ambient:<theme>`, `night-hotel`, `astro` or `rebound` (default `static`). */
  readonly scene?: string;
  /** Files of the scene as URLs. */
  readonly assets?: RoomSceneAssets;
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
  /** Room settings of this device (motion and sounds). */
  readonly settings?: RoomSceneSettings;
  /** False while something holds the room (settings dialog, dressing): it rests. */
  readonly active?: boolean;
  /** A preview: the room moves but has no touch and no sound. */
  readonly preview?: boolean;
}

const AMBIENT_THEMES: readonly AmbientTheme[] = ['embers', 'fairy', 'forest', 'water', 'clock'];

/** The live layers of a room, chosen by its scene type. */
export function RoomLayers({
  scene = 'static',
  ...props
}: LiveRoomProps & { readonly scene?: string }) {
  if (scene === 'night-hotel') return <NightHotelScene {...props} />;
  if (scene === 'astro') return <AstroScene {...props} />;
  if (scene === 'rebound' || scene === 'ambient:rebound') return <ReboundScene {...props} />;
  const theme = scene.startsWith('ambient:')
    ? (scene.slice('ambient:'.length) as AmbientTheme)
    : null;
  if (theme && AMBIENT_THEMES.includes(theme)) return <AmbientScene theme={theme} {...props} />;
  return <StaticScene {...props} />;
}

/** Whether a scene type moves at all (a still room without its own animation does not). */
const movesBy = (room: SceneRoom) =>
  (room.scene ?? 'static') !== 'static' || Boolean(room.assets?.motion);

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
  settings = DEFAULT_ROOM_SETTINGS,
  active = true,
  preview = false,
}: HeroSceneProps) {
  const { shown, loading, failed } = useShownImage(room?.image ?? null, onBackdropError);
  const ready = room !== null && !loading && !failed;
  const motion = useRoomMotion(active && ready, settings) && room !== null && movesBy(room);
  const actorStyle = {
    '--qc-foot-x': `${room?.footAnchor.x ?? 50}%`,
    '--qc-foot-bottom': `${100 - (room?.footAnchor.y ?? 75)}%`,
    '--qc-foot-offset': `${footOffset}%`,
  } as CSSProperties;
  return (
    <div
      className="qc-scene"
      data-phase={phase}
      data-room-scene={room?.scene ?? 'static'}
      data-room-motion={motion ? 'on' : 'off'}
    >
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
      {ready && (
        <RoomLayers
          key={room.image}
          scene={room.scene}
          assets={room.assets ?? {}}
          settings={settings}
          active={active}
          preview={preview}
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

export interface LiveRoomPreviewProps {
  /** The room with its scene; its still thumbnail shows until it plays. */
  readonly room: SceneRoom;
  readonly thumb: string;
  readonly alt: string;
  /** Decided by the app's animation manager: one animation at a time. */
  readonly playing: boolean;
  readonly onToggle: () => void;
  readonly settings?: RoomSceneSettings;
  readonly ref?: Ref<HTMLDivElement>;
}

/** A live room in the shop: the thumbnail, and the moving room (no touch, no sound) by «плей». */
export function LiveRoomPreview({
  room,
  thumb,
  alt,
  playing,
  onToggle,
  settings,
  ref,
}: LiveRoomPreviewProps) {
  const label = playing ? 'Остановить анимацию комнаты' : 'Посмотреть анимацию комнаты';
  return (
    <div ref={ref} className="qc-room-preview" data-playing={playing || undefined}>
      {playing ? (
        <HeroScene room={room} settings={settings} preview />
      ) : (
        <img className="qc-room-preview-thumb" src={thumb} alt={alt} draggable={false} />
      )}
      <button
        type="button"
        className="qc-room-preview-toggle"
        aria-pressed={playing}
        aria-label={label}
        title={label}
        onClick={onToggle}
      >
        {playing ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
      </button>
    </div>
  );
}
