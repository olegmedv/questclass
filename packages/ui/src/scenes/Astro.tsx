import { useEffect, useState } from 'react';
import { useRoomMotion, useRoomSound, type LiveRoomProps } from './common';
import { createRoomAudio, soundResolver } from './roomAudio';
import { RoomMotionLayer } from './Static';
import './scenes.css';

/** A star chimes this often while the room sounds. */
export const STAR_CHIME_EVERY_MS = 24_000;

/**
 * Astro's moon room (behaviour of the original `app/astro-room-audio.tsx`): the animated night
 * sky over the still room, and — when the room's sounds are on — a lullaby (music), night air
 * (atmosphere) and a star chime every 24 s.
 */
export function AstroScene({ assets, settings, active, preview = false }: LiveRoomProps) {
  const running = useRoomMotion(active, settings);
  const sound = useRoomSound(active, settings, preview);
  const [blocked, setBlocked] = useState(false);
  const { music, atmosphere } = settings;
  const files = [...(assets.ambient ?? []), ...(assets.events ?? [])].join('|');
  useEffect(() => {
    if (!sound) return;
    const bank = createRoomAudio({
      resolve: soundResolver(files.split('|')),
      onBlocked: () => setBlocked(true),
    });
    if (music) bank.loop('lullaby', 0.42);
    if (atmosphere) bank.loop('night-air', 0.22);
    const chime = setInterval(() => bank.effect('star-chime', 0.24), STAR_CHIME_EVERY_MS);
    return () => {
      clearInterval(chime);
      bank.dispose();
      setBlocked(false);
    };
  }, [sound, music, atmosphere, files]);
  return (
    <>
      {assets.motion && <RoomMotionLayer src={assets.motion} running={running} />}
      {blocked && (
        <span className="qc-room-warning" role="status">
          Переключи «Звуки комнаты», чтобы включить колыбельную.
        </span>
      )}
    </>
  );
}
