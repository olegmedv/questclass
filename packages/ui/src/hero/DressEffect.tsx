import type { CSSProperties } from 'react';
import './DressEffect.css';

/**
 * Changing clothes (spec/02 §2.8): `saving` — the choice is being saved (the old hero stays);
 * `cover` — a pixel puff hides the old hero (260 ms); `reveal` — the new hero shows and the puff
 * fades (380 ms). Without motion the app skips `cover` and `reveal`.
 */
export type DressPhase = 'idle' | 'saving' | 'cover' | 'reveal';

export const DRESS_COVER_MS = 260;
export const DRESS_REVEAL_MS = 380;

const PARTICLES = Array.from({ length: 12 }, (_, i) => ({
  left: `${30 + (i % 4) * 13}%`,
  top: `${21 + Math.floor(i / 4) * 23}%`,
  '--qc-dx': `${((i % 4) - 1.5) * 35}px`,
  '--qc-dy': `${(Math.floor(i / 4) - 1) * 40}px`,
  '--qc-delay': `${(i % 3) * 20}ms`,
})) as CSSProperties[];

/** The pixel puff over the hero while it changes clothes (decorative). */
export function DressEffect({ phase }: { readonly phase: DressPhase }) {
  if (phase !== 'cover' && phase !== 'reveal') return null;
  return (
    <div className="qc-dress" data-phase={phase} aria-hidden="true">
      <span className="qc-dress-core" />
      {PARTICLES.map((style, index) => (
        <i key={index} className="qc-dress-pixel" style={style} />
      ))}
    </div>
  );
}
