// A live room of the shop: its still thumbnail, and the moving room by «плей» (one animation at
// a time in the whole app, as for live heroes).
import type { PurchaseSnapshot } from '@questclass/shared/shop/dto';
import { LiveRoomPreview } from '@questclass/ui';
import { useMemo, useRef } from 'react';
import { useHeroAnimation } from '../animation/AnimationManager';
import { useAssetDuration } from '../appearance/queries';
import { sceneAssetUrls } from '../character/useCharacter';
import { browserFormat } from '../sound/SoundManager';

type RoomArt = NonNullable<PurchaseSnapshot['room']>;

export function RoomPreview({
  room,
  animation,
  title,
}: {
  readonly room: RoomArt;
  readonly animation: PurchaseSnapshot['animation'];
  readonly title: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const playback = useHeroAnimation(ref, 'on-demand');
  const durationOf = useAssetDuration();
  const scene = useMemo(
    () => ({
      image: room.image,
      title,
      footAnchor: room.footAnchor,
      scene: room.scene,
      assets: sceneAssetUrls(room.sceneAssets, animation?.src ?? null, browserFormat(), durationOf),
    }),
    [room, animation, title, durationOf],
  );
  return (
    <LiveRoomPreview
      ref={ref}
      room={scene}
      thumb={room.thumb || room.image}
      alt={title}
      playing={playback.playing}
      onToggle={playback.toggle}
    />
  );
}
