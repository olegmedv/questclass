import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRoomMotion, type LiveRoomProps } from './common';
import './scenes.css';

/** Light themes of ambient rooms (the colour of the glow and the motes). */
export type AmbientTheme = 'embers' | 'fairy' | 'forest' | 'water' | 'clock';

const MOTES = Array.from({ length: 10 }, (_, i) => ({
  left: `${10 + ((i * 29) % 81)}%`,
  top: `${15 + ((i * 17) % 57)}%`,
  '--qc-mote-delay': `${-i * 0.7}s`,
  '--qc-mote-drift': `${i % 2 ? 9 : -9}px`,
})) as CSSProperties[];

const SPARKS = Array.from({ length: 8 }, (_, i) => ({
  left: `${15 + i * 10}%`,
  top: `${35 + (i % 3) * 12}%`,
  animationDelay: `${i * 0.06}s`,
})) as CSSProperties[];

/** How long the sparks of a tap fly. */
export const AMBIENT_BURST_MS = 2200;

/**
 * An ambient room (behaviour of the original `app/ambient-room.tsx`): the painting stays still,
 * two soft lights breathe and ten motes drift in the theme's colour; a tap sends up a burst of
 * sparks. Stops on a hidden tab, with reduced motion and with «Анимации фона» off.
 */
export function AmbientScene({
  theme,
  settings,
  active,
  preview = false,
}: LiveRoomProps & { readonly theme: AmbientTheme }) {
  const running = useRoomMotion(active, settings);
  const [burst, setBurst] = useState(0);
  const [hint, setHint] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  if (!running) return null;
  const wake = () => {
    setBurst((n) => n + 1);
    setHint(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setBurst(0), AMBIENT_BURST_MS);
  };
  return (
    <>
      <div className="qc-room-layer qc-ambient" data-theme={theme} aria-hidden="true">
        <span className="qc-ambient-light" data-side="left" />
        <span className="qc-ambient-light" data-side="right" />
        {MOTES.map((style, i) => (
          <i key={i} className="qc-ambient-mote" style={style} />
        ))}
        {burst > 0 && (
          <span key={burst} className="qc-ambient-burst">
            {SPARKS.map((style, i) => (
              <i key={i} style={style} />
            ))}
          </span>
        )}
      </div>
      {!preview && (
        <button type="button" className="qc-room-touch" aria-label="Оживить комнату" onClick={wake}>
          {hint && <span className="qc-room-hint">Коснись комнаты — разбуди огоньки</span>}
        </button>
      )}
    </>
  );
}
