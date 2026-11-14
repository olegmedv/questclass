import {
  Eye,
  EyeOff,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { cx } from '../../internal/cx';
import { Spinner } from '../Spinner';
import { attachSource, type MediaSource } from './attach';
import './MediaPlayer.css';

export type { MediaSource } from './attach';

/** Limits of the black strip over burnt-in subtitles (spec/01 §2.12). */
export const SHUTTER_MIN_PCT = 4;
export const SHUTTER_MAX_PCT = 40;
/** Seconds of «↺ 10 сек» / «↻ 10 сек». */
export const SKIP_SECONDS = 10;

export interface ShutterState {
  /** Height in percent of the video. */
  readonly heightPct: number;
  /** The strip covers the bottom of the video. */
  readonly visible: boolean;
}

export interface MediaClip {
  /** Seconds: playback starts here… */
  readonly start: number;
  /** …and stops here (by the media's own time, not by a timer). */
  readonly end: number;
  readonly onEnd: () => void;
}

export interface MediaPlayerProps {
  readonly source: MediaSource;
  /** Accessible name of the player («Видео урока»). */
  readonly label: string;
  /** Where to start (the resume point), seconds. */
  readonly startAt?: number;
  /** The strip over the subtitles; omitted = no strip and no button. */
  readonly shutter?: ShutterState | null;
  readonly onShutterChange?: (shutter: ShutterState) => void;
  /** Play only a fragment (a hint) and report its end. */
  readonly clip?: MediaClip | null;
  /** Start playing as soon as the video can (a clip opened by a tap). */
  readonly autoPlay?: boolean;
  /** Receives the `<video>` element (and null when it goes), for watch tracking. */
  readonly onVideo?: (video: HTMLVideoElement | null) => void;
}

/** «1:05». */
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

const clampShutter = (value: number) =>
  Math.min(SHUTTER_MAX_PCT, Math.max(SHUTTER_MIN_PCT, Math.round(value)));

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}
interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

function fullscreenElement(): Element | null {
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/** Element fullscreen exists (desktop, Android, iPad); an iPhone only has the video's own. */
function canFullscreenElement(element: HTMLElement | null): boolean {
  return (
    element !== null && ('requestFullscreen' in element || 'webkitRequestFullscreen' in element)
  );
}

interface IosVideo extends HTMLVideoElement {
  webkitEnterFullscreen(): void;
}

/** An iPhone can put only the `<video>` itself into fullscreen. */
function canFullscreenVideo(video: HTMLVideoElement | null): video is IosVideo {
  return video !== null && 'webkitEnterFullscreen' in video;
}

/**
 * The lesson video with its own controls: ±10 s, play/pause, timeline, volume, the strip over
 * the subtitles (drag or keyboard) and fullscreen of the whole frame (video + strip). HLS goes
 * through hls.js with retries, Safari plays HLS natively, MP4 is the fallback format.
 */
export function MediaPlayer({
  source,
  label,
  startAt = 0,
  shutter,
  onShutterChange,
  clip,
  autoPlay = false,
  onVideo,
}: MediaPlayerProps) {
  /** The whole player (video, strip and controls) is what goes fullscreen. */
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [iphone, setIphone] = useState(false);
  const resumeAt = useRef(startAt);
  const clipRef = useRef(clip);
  const clipArmed = useRef(false);
  const titleId = useId();

  useEffect(() => {
    clipRef.current = clip;
  });

  const setVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      videoEl.current = el;
      onVideo?.(el);
    },
    [onVideo],
  );

  // Source: hls.js, native HLS or MP4. A reload keeps the position.
  const { kind, src } = source;
  useEffect(() => {
    const video = videoEl.current;
    if (!video) return;
    setError(null);
    setWaiting(true);
    const detach = attachSource(video, { kind, src }, (message) => {
      setError(message);
      setWaiting(false);
    });
    return detach;
  }, [kind, src, reloadKey]);

  useEffect(() => {
    setIphone(!canFullscreenElement(rootRef.current) && canFullscreenVideo(videoEl.current));
  }, []);

  // The tab is hidden: the lesson pauses (spec/01 §2.11).
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) videoEl.current?.pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(fullscreenElement() === rootRef.current);
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const play = useCallback(() => {
    const video = videoEl.current;
    if (!video) return;
    video.play().catch(() => setNotice('Нажми «Смотреть», чтобы запустить видео.'));
  }, []);

  const onLoadedMetadata = () => {
    const video = videoEl.current;
    if (!video) return;
    setDuration(video.duration);
    const target = clipRef.current
      ? Math.max(0, clipRef.current.start - 3)
      : resumeAt.current > 0 && resumeAt.current < video.duration - 2
        ? resumeAt.current
        : 0;
    if (target > 0) video.currentTime = target;
    clipArmed.current = false;
    if (autoPlay || clipRef.current) play();
  };

  const onTimeUpdate = () => {
    const video = videoEl.current;
    if (!video) return;
    setTime(video.currentTime);
    resumeAt.current = video.currentTime;
    const current = clipRef.current;
    if (!current) return;
    // Armed only once the position is really near the fragment (a seek may report the old time).
    if (!clipArmed.current) {
      if (video.currentTime >= current.start - 4 && video.currentTime <= current.start + 10) {
        clipArmed.current = true;
      }
      return;
    }
    if (video.currentTime >= current.end) {
      clipArmed.current = false;
      video.pause();
      current.onEnd();
    }
  };

  const seekBy = (delta: number) => {
    const video = videoEl.current;
    if (!video) return;
    const end = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = Math.min(end, Math.max(0, video.currentTime + delta));
  };

  const toggleFullscreen = () => {
    const frame = rootRef.current as FullscreenElement | null;
    const doc = document as FullscreenDocument;
    if (fullscreenElement()) {
      void (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.());
      return;
    }
    if (frame?.requestFullscreen) {
      frame.requestFullscreen().catch(() => setNotice('Полный экран недоступен в этом браузере.'));
    } else if (frame?.webkitRequestFullscreen) {
      void frame.webkitRequestFullscreen();
    } else {
      // iPhone: only the video itself can go fullscreen (without the strip).
      const video = videoEl.current;
      if (video && canFullscreenVideo(video)) video.webkitEnterFullscreen();
      else setNotice('Полный экран недоступен в этом браузере.');
    }
  };

  const setShutter = (patch: Partial<ShutterState>) => {
    if (!shutter || !onShutterChange) return;
    onShutterChange({
      heightPct: clampShutter(patch.heightPct ?? shutter.heightPct),
      visible: patch.visible ?? shutter.visible,
    });
  };

  const onShutterKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!shutter) return;
    const steps: Record<string, number> = {
      ArrowUp: 1,
      ArrowRight: 1,
      ArrowDown: -1,
      ArrowLeft: -1,
    };
    if (event.key in steps) setShutter({ heightPct: shutter.heightPct + (steps[event.key] ?? 0) });
    else if (event.key === 'Home') setShutter({ heightPct: SHUTTER_MIN_PCT });
    else if (event.key === 'End') setShutter({ heightPct: SHUTTER_MAX_PCT });
    else return;
    event.preventDefault();
  };

  const drag = useRef<{ startY: number; startPct: number } | null>(null);
  const onHandleDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!shutter) return;
    drag.current = { startY: event.clientY, startPct: shutter.heightPct };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onHandleMove = (event: PointerEvent<HTMLDivElement>) => {
    const frame = frameRef.current;
    if (!drag.current || !frame || !shutter) return;
    const height = frame.querySelector('video')?.clientHeight ?? frame.clientHeight;
    if (height <= 0) return;
    const delta = ((drag.current.startY - event.clientY) / height) * 100;
    setShutter({ heightPct: drag.current.startPct + delta });
  };
  const onHandleUp = () => {
    drag.current = null;
  };

  const showStrip = Boolean(shutter?.visible);
  return (
    <div
      ref={rootRef}
      className="qc-media"
      role="group"
      aria-labelledby={titleId}
      data-fullscreen={fullscreen || undefined}
    >
      <span id={titleId} className="qc-visually-hidden">
        {label}
      </span>
      <div ref={frameRef} className="qc-media-frame">
        <video
          key={reloadKey}
          ref={setVideo}
          className="qc-media-video"
          playsInline
          preload="metadata"
          onClick={() => (playing ? videoEl.current?.pause() : play())}
          onLoadedMetadata={onLoadedMetadata}
          onDurationChange={() => setDuration(videoEl.current?.duration ?? 0)}
          onTimeUpdate={onTimeUpdate}
          onPlay={() => {
            setPlaying(true);
            setNotice(null);
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onWaiting={() => setWaiting(true)}
          onCanPlay={() => setWaiting(false)}
          onPlaying={() => setWaiting(false)}
          onVolumeChange={() => {
            setVolume(videoEl.current?.volume ?? 1);
            setMuted(videoEl.current?.muted ?? false);
          }}
        />
        {showStrip && shutter && (
          <div
            className="qc-media-shutter"
            style={{ height: `${shutter.heightPct}%` }}
            data-testid="shutter"
          >
            <div
              className="qc-media-shutter-handle"
              role="slider"
              tabIndex={0}
              aria-label="Высота чёрной полосы"
              aria-valuemin={SHUTTER_MIN_PCT}
              aria-valuemax={SHUTTER_MAX_PCT}
              aria-valuenow={shutter.heightPct}
              aria-valuetext={`${shutter.heightPct}%`}
              title="Потяни, чтобы изменить высоту"
              onKeyDown={onShutterKey}
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
            >
              <span className="qc-media-shutter-grip" aria-hidden="true" />
            </div>
            <button
              type="button"
              className="qc-media-shutter-open"
              aria-label="Открыть низ"
              title="Открыть низ"
              onClick={() => setShutter({ visible: false })}
            >
              <Eye aria-hidden="true" />
            </button>
          </div>
        )}
        {waiting && !error && (
          <div className="qc-media-status">
            <Spinner size="lg" label="Подключаем видео…" />
          </div>
        )}
        {error && (
          <div className="qc-media-status" role="alert">
            <p>{error}</p>
            <button
              type="button"
              className="qc-media-reload"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Загрузить видео заново
            </button>
          </div>
        )}
      </div>

      <div className="qc-media-timeline">
        <span className="qc-media-time" aria-hidden="true">
          {formatTime(time)}
        </span>
        <input
          type="range"
          className="qc-media-range"
          aria-label="Перемотка"
          min={0}
          max={duration > 0 ? Math.floor(duration) : 0}
          step={1}
          value={Math.floor(time)}
          aria-valuetext={`${formatTime(time)} из ${formatTime(duration)}`}
          disabled={!(duration > 0)}
          onChange={(event) => {
            const video = videoEl.current;
            if (video) video.currentTime = Number(event.target.value);
          }}
        />
        <span className="qc-media-time" aria-hidden="true">
          {formatTime(duration)}
        </span>
      </div>

      <div className="qc-media-controls" data-row="main">
        <button type="button" className="qc-media-btn" onClick={() => seekBy(-SKIP_SECONDS)}>
          <RotateCcw aria-hidden="true" />
          <span>
            10 сек <span className="qc-visually-hidden">назад</span>
          </span>
        </button>
        <button
          type="button"
          className={cx('qc-media-btn', 'qc-media-play')}
          onClick={() => (playing ? videoEl.current?.pause() : play())}
          disabled={Boolean(error)}
        >
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          <span>{playing ? 'Пауза' : 'Смотреть'}</span>
        </button>
        <button type="button" className="qc-media-btn" onClick={() => seekBy(SKIP_SECONDS)}>
          <RotateCw aria-hidden="true" />
          <span>
            10 сек <span className="qc-visually-hidden">вперёд</span>
          </span>
        </button>
      </div>
      <div className="qc-media-controls">
        <button
          type="button"
          className="qc-media-btn"
          aria-pressed={muted}
          onClick={() => {
            const video = videoEl.current;
            if (video) video.muted = !video.muted;
          }}
        >
          {muted || volume === 0 ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
          <span>{muted ? 'Включить звук' : 'Звук'}</span>
        </button>
        <input
          type="range"
          className="qc-media-range qc-media-volume"
          aria-label="Громкость"
          min={0}
          max={100}
          step={5}
          value={Math.round((muted ? 0 : volume) * 100)}
          onChange={(event) => {
            const video = videoEl.current;
            if (!video) return;
            video.volume = Number(event.target.value) / 100;
            video.muted = video.volume === 0;
          }}
        />
        {shutter && (
          <button
            type="button"
            className="qc-media-btn"
            onClick={() => setShutter({ visible: !shutter.visible })}
          >
            {shutter.visible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
            <span>{shutter.visible ? 'Открыть низ' : 'Скрыть низ'}</span>
          </button>
        )}
        <button type="button" className="qc-media-btn" onClick={toggleFullscreen}>
          {fullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
          <span>{fullscreen ? 'Свернуть' : 'На весь экран'}</span>
        </button>
      </div>
      {shutter && iphone && (
        <p className="qc-media-note">
          На iPhone видео на весь экран открывается без чёрной полосы: так устроен браузер.
        </p>
      )}
      {notice && (
        <p className="qc-media-note" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
