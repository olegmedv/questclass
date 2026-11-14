import { useEffect, useId, useState, type CSSProperties } from 'react';
import { useRoomMotion, useRoomSound, type LiveRoomProps } from './common';
import { createRoomAudio, soundResolver } from './roomAudio';
import './scenes.css';

// Coordinates match the 1536×1024 painting of Rebound's hotel; one shared 24 s gust.
const CANDLES: readonly (readonly [number, number])[] = [
  [636, 145],
  [708, 121],
  [838, 122],
  [895, 147],
  [133, 550],
  [170, 573],
  [1487, 573],
];

// Uneven arrivals and their own curved paths: leaves blow in through the broken window.
const LEAVES = [
  {
    at: 3.45,
    travel: 5.8,
    spin: 2.1,
    size: 1.05,
    path: 'M1390 424 C1320 335 1240 308 1150 392 C1000 500 1070 750 810 815',
  },
  {
    at: 4.3,
    travel: 6.7,
    spin: 3.4,
    size: 0.78,
    path: 'M1386 430 C1340 490 1150 560 1030 540 C870 520 900 835 640 855',
  },
  {
    at: 3.8,
    travel: 8.1,
    spin: 2.7,
    size: 1.2,
    path: 'M1393 427 C1270 360 1200 620 1020 670 C900 740 790 690 520 835',
  },
  {
    at: 5.1,
    travel: 6.2,
    spin: 1.8,
    size: 0.9,
    path: 'M1388 433 C1350 530 1240 625 1160 550 C1050 400 1000 430 1010 560 C1020 690 840 820 900 860',
  },
  {
    at: 4,
    travel: 8.8,
    spin: 3.8,
    size: 0.68,
    path: 'M1391 429 C1260 315 1100 275 940 470 C780 650 720 870 380 885',
  },
] as const;

const GUST_S = 24;
const phase = (seconds: number) => (seconds / GUST_S).toFixed(5);

/** Room sounds come this often while the room sounds. */
export const WOOD_CREAK_EVERY_MS = 31_000;
export const CURTAIN_RUSTLE_EVERY_MS = 19_000;

/**
 * Rebound's night hotel (behaviour of the original `app/rebound-room.tsx` and
 * `rebound-presence.tsx`): a gust every 24 s moves the torn curtain, blows the candles out and
 * lights them again, carries leaves in through the window; mist drifts over the floor. Sounds:
 * night music, night air, a creak and a rustle now and then.
 */
export function ReboundScene({ assets, settings, active, preview = false }: LiveRoomProps) {
  const running = useRoomMotion(active, settings);
  const sound = useRoomSound(active, settings, preview);
  const [blocked, setBlocked] = useState(false);
  const id = useId().replace(/:/g, '');
  const { music, atmosphere } = settings;
  const files = [...(assets.ambient ?? []), ...(assets.events ?? [])].join('|');
  useEffect(() => {
    if (!sound) return;
    const bank = createRoomAudio({
      resolve: soundResolver(files.split('|')),
      onBlocked: () => setBlocked(true),
    });
    if (music) bank.loop('night-music', 0.85);
    if (atmosphere) bank.loop('night-air', 0.5);
    const wood = setInterval(() => bank.effect('wood-creak', 0.7), WOOD_CREAK_EVERY_MS);
    const cloth = setInterval(() => bank.effect('curtain-rustle', 0.65), CURTAIN_RUSTLE_EVERY_MS);
    return () => {
      clearInterval(wood);
      clearInterval(cloth);
      bank.dispose();
      setBlocked(false);
    };
  }, [sound, music, atmosphere, files]);

  const curtain = assets.layers?.['curtain'];
  return (
    <>
      {running && (
        <div className="qc-room-layer qc-rebound" aria-hidden="true">
          <span className="qc-rebound-warmth" />
          {curtain && (
            <img className="qc-rebound-curtain" src={curtain} alt="" width={1536} height={1024} />
          )}
          <svg className="qc-rebound-svg" viewBox="0 0 1536 1024" preserveAspectRatio="none">
            <defs>
              <radialGradient id={`${id}-glow`}>
                <stop className="qc-rebound-glow-in" />
                <stop className="qc-rebound-glow-out" offset="1" />
              </radialGradient>
            </defs>
            {CANDLES.map(([x, y], i) => (
              <g
                key={i}
                transform={`translate(${x} ${y})`}
                style={{ '--qc-candle-delay': `${i * 0.08}s` } as CSSProperties}
              >
                <g className="qc-rebound-flame-life">
                  <ellipse cx="0" cy="-13" rx="53" ry="65" fill={`url(#${id}-glow)`} />
                  <g className="qc-rebound-flame">
                    <path
                      className="qc-rebound-flame-outer"
                      d="M0 0 C-10 -6 -8 -16 -2 -29 C-3 -17 12 -11 5 -3 Z"
                    />
                    <path
                      className="qc-rebound-flame-core"
                      d="M0 -2 C-5 -7 -3 -14 0 -19 C1 -12 6 -7 0 -2"
                    />
                  </g>
                </g>
                <path
                  className="qc-rebound-smoke"
                  d="M0 -3 C-14 -20 -29 -17 -35 -35 S-69 -51 -76 -76"
                />
              </g>
            ))}
          </svg>
          <span className="qc-rebound-draft" />
          <svg className="qc-rebound-svg" viewBox="0 0 1536 1024" preserveAspectRatio="none">
            {LEAVES.map((leaf, i) => (
              <g key={i} opacity="0">
                <animateMotion
                  path={leaf.path}
                  dur={`${GUST_S}s`}
                  repeatCount="indefinite"
                  calcMode="spline"
                  keyPoints="0;0;1;1"
                  keyTimes={`0;${phase(leaf.at)};${phase(leaf.at + leaf.travel)};1`}
                  keySplines="0 0 1 1;.15 .5 .45 1;0 0 1 1"
                />
                <animate
                  attributeName="opacity"
                  values="0;0;.9;.75;0;0"
                  dur={`${GUST_S}s`}
                  repeatCount="indefinite"
                  keyTimes={`0;${phase(leaf.at)};${phase(leaf.at + 0.22)};${phase(leaf.at + leaf.travel - 0.9)};${phase(leaf.at + leaf.travel)};1`}
                />
                <g transform={`scale(${leaf.size})`}>
                  <g
                    className="qc-rebound-leaf"
                    data-tone={i % 2 ? 'brown' : 'olive'}
                    style={{
                      animationDuration: `${leaf.spin}s`,
                      animationDelay: `${-i * 0.73}s`,
                      animationDirection: i % 2 ? 'reverse' : 'normal',
                    }}
                  >
                    <path d="M-18 0 Q-10 -14 6 -8 L19 -1 Q8 15 -7 8 Z" />
                    <path
                      className="qc-rebound-leaf-vein"
                      d="M-20 3 L15 -2 M-6 1 L-10 -7 M2 0 L5 7"
                    />
                  </g>
                </g>
              </g>
            ))}
          </svg>
          <span className="qc-rebound-mist" data-layer="one" />
          <span className="qc-rebound-mist" data-layer="two" />
        </div>
      )}
      {blocked && (
        <span className="qc-room-warning" role="status">
          Переключи «Звуки комнаты», чтобы включить звуки комнаты.
        </span>
      )}
    </>
  );
}
