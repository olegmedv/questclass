import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../internal/useReducedMotion';
import { usePageVisible, useUserGesture, type LiveRoomProps } from './common';
import {
  IDLE_VIEW,
  NIGHT_HOTEL_EVENTS,
  NightHotelDirector,
  type NightHotelConditions,
  type NightHotelView,
} from './eventScheduler';
import { createRoomAudio, soundResolver } from './roomAudio';
import './scenes.css';

/** The candles flicker all the time; every other layer is an event. */
const CANDLES = 'candles';

function hintOf(view: NightHotelView): string {
  if (view.state === 'loading') return 'Кто-то просыпается…';
  if (view.state === 'playing') return 'Смотри, что происходит…';
  if (view.tapWait > 0) return `Ещё сюрприз через ${view.tapWait} с`;
  return 'Коснись комнаты — она оживёт';
}

/**
 * «Ночной отель» (behaviour of the original `app/night-hotel-room.tsx`): flickering candles and
 * random events with sounds, a tap wakes the room (not more often than every 8 s). The events
 * and their timing live in `eventScheduler.ts`; this component shows the layers.
 */
export function NightHotelScene({ assets, settings, active, preview = false }: LiveRoomProps) {
  const visible = usePageVisible();
  const reduced = usePrefersReducedMotion();
  const gesture = useUserGesture();
  const [view, setView] = useState<NightHotelView>(IDLE_VIEW);
  const [candlesFailed, setCandlesFailed] = useState(false);
  const director = useRef<NightHotelDirector | null>(null);

  const conditions: NightHotelConditions = {
    active,
    visible,
    animations: settings.animations,
    reduced,
    sounds: settings.sounds && !preview,
    atmosphere: settings.atmosphere,
    music: settings.music,
    gesture,
  };
  const latest = useRef(conditions);
  useEffect(() => {
    latest.current = conditions;
  });

  // One director per set of files; it starts under the current conditions.
  const files = JSON.stringify(assets);
  useEffect(() => {
    const parsed = JSON.parse(files) as LiveRoomProps['assets'];
    const layers = { ...parsed.layers };
    delete layers[CANDLES];
    const resolve = soundResolver([...(parsed.ambient ?? []), ...(parsed.events ?? [])]);
    const durations = parsed.layerDurations ?? {};
    const instance: NightHotelDirector = new NightHotelDirector({
      layers,
      events: NIGHT_HOTEL_EVENTS.map((event) => ({
        ...event,
        durationMs: durations[event.id] ?? event.durationMs,
      })),
      createAudio: () => createRoomAudio({ resolve, onBlocked: () => instance.audioBlocked() }),
      onChange: setView,
    });
    director.current = instance;
    instance.update(latest.current);
    return () => {
      instance.dispose();
      director.current = null;
    };
  }, [files]);

  const { active: on, visible: shown, animations, sounds, atmosphere, music } = conditions;
  useEffect(() => {
    director.current?.update(latest.current);
  }, [on, shown, animations, reduced, sounds, atmosphere, music, gesture]);

  const candles = assets.layers?.[CANDLES];
  const clip = view.clip;
  return (
    <>
      {view.running && candles && !candlesFailed && (
        <img
          className="qc-room-layer qc-hotel-layer"
          src={candles}
          alt=""
          width={1536}
          height={1024}
          draggable={false}
          onError={() => {
            setCandlesFailed(true);
            director.current?.candlesFailed();
          }}
        />
      )}
      {view.running && clip && (
        <img
          key={clip.url}
          className="qc-room-layer qc-hotel-layer"
          data-event={clip.event.id}
          src={clip.url}
          alt=""
          width={1536}
          height={1024}
          draggable={false}
          onLoad={() => director.current?.clipShown(clip.event.id)}
          onError={() => director.current?.clipFailed(clip.event.id)}
        />
      )}
      {view.running && !preview && (
        <button
          type="button"
          className="qc-room-touch"
          aria-label="Оживить комнату: случайная анимация"
          aria-disabled={view.state !== 'idle' || view.tapWait > 0}
          aria-busy={view.state === 'loading' || undefined}
          data-state={view.state}
          onClick={() => director.current?.tap()}
        >
          <span className="qc-room-hint">{hintOf(view)}</span>
        </button>
      )}
      {view.warning && (
        <span className="qc-room-warning" role="status">
          {view.warning}
        </span>
      )}
    </>
  );
}
