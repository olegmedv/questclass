import { useState } from 'react';
import { cx } from '../internal/cx';
import { useRoomMotion, type LiveRoomProps } from './common';
import './scenes.css';

/**
 * The animated WebP of a whole room over its still picture (Astro, or an admin's animated room):
 * it appears only once loaded, so the room never blinks; a failed file leaves the still room.
 */
export function RoomMotionLayer({
  src,
  running,
}: {
  readonly src: string;
  readonly running: boolean;
}) {
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  if (!running || failed === src) return null;
  return (
    <img
      className={cx('qc-room-layer', 'qc-room-motion', loaded === src && 'qc-room-motion-loaded')}
      src={src}
      alt=""
      width={1536}
      height={1024}
      draggable={false}
      onLoad={() => setLoaded(src)}
      onError={() => setFailed(src)}
    />
  );
}

/** A still room: nothing over the background, unless the room has an animation of its own. */
export function StaticScene({ assets, settings, active }: LiveRoomProps) {
  const running = useRoomMotion(active, settings);
  return assets.motion ? <RoomMotionLayer src={assets.motion} running={running} /> : null;
}
