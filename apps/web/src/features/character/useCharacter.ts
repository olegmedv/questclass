// The learner's hero (`GET /api/me/character`, `PUT /api/me/character/{look,room,name}`) and the
// changing of clothes: save first, then the puff hides the old hero (260 ms), the new one shows
// (380 ms). A failed save leaves the old hero on screen.
import type { SceneAssets } from '@questclass/shared/catalog/dto';
import type { CharacterDto, OwnedItemDto } from '@questclass/shared/character/dto';
import {
  DRESS_COVER_MS,
  DRESS_REVEAL_MS,
  type AnimatedHeroProps,
  type DressPhase,
  type RoomSceneAssets,
  type SceneRoom,
} from '@questclass/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { api } from '../../api/client';
import type { AssetDuration } from '../appearance/queries';
import { browserFormat, type AudioFormat } from '../sound/SoundManager';

export const characterKeys = { character: ['me', 'character'] as const };

export function useCharacter() {
  return useQuery({
    queryKey: characterKeys.character,
    queryFn: () => api<CharacterDto>('/api/me/character'),
  });
}

function useCharacterChange<T>(path: (value: T) => { url: string; json: unknown }) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (value: T) => {
      const { url, json } = path(value);
      return api<CharacterDto>(url, { method: 'PUT', json });
    },
    onSuccess: (character) => client.setQueryData(characterKeys.character, character),
  });
}

export const useEquipLook = () =>
  useCharacterChange((itemId: number) => ({ url: '/api/me/character/look', json: { itemId } }));

export const useEquipRoom = () =>
  useCharacterChange((itemId: number) => ({ url: '/api/me/character/room', json: { itemId } }));

export const useCharacterName = () =>
  useCharacterChange((name: string) => ({ url: '/api/me/character/name', json: { name } }));

/** How a look is drawn: its still picture and, for a live one, the animation. */
export type LookArt = Pick<AnimatedHeroProps, 'poster' | 'sprite' | 'src' | 'motion' | 'alt'> & {
  readonly live: boolean;
  readonly footOffset: number;
};

export function lookArt(look: OwnedItemDto): LookArt | null {
  const { hero, animation } = look;
  if (!hero) return null;
  const poster = animation?.poster || hero.image;
  if (!poster) return null;
  return {
    poster,
    sprite: (animation ? animation.posterSprite : hero.sprite) ?? undefined,
    src: animation?.src ?? undefined,
    motion: animation?.motion ?? undefined,
    alt: look.title,
    live: Boolean(animation),
    footOffset: hero.footOffset,
  };
}

/** Files of a live room as URLs; sounds in the device's format (MP3 on iPhone and iPad). */
export function sceneAssetUrls(
  assets: SceneAssets | null,
  motion: string | null,
  format: AudioFormat = browserFormat(),
  durationOf: AssetDuration = () => undefined,
): RoomSceneAssets {
  const sound = (key: string) => `/assets/${format === 'mp3' ? key.replace(/.ogg$/, '.mp3') : key}`;
  const layers = Object.entries(assets?.layers ?? {});
  // A clip the admin replaced keeps the room busy for its own length.
  const durations = layers.flatMap(([name, key]) => {
    const ms = durationOf(key);
    return ms === undefined ? [] : [[name, ms] as const];
  });
  return {
    layers: Object.fromEntries(layers.map(([name, key]) => [name, `/assets/${key}`])),
    ...(durations.length > 0 && { layerDurations: Object.fromEntries(durations) }),
    ambient: (assets?.audio?.ambient ?? []).map(sound),
    events: (assets?.audio?.events ?? []).map(sound),
    motion,
  };
}

/** The room of a wardrobe entry as the scene needs it (null without art). */
export function roomOf(
  room: OwnedItemDto | null,
  durationOf?: AssetDuration,
): (SceneRoom & { readonly thumb: string }) | null {
  if (!room?.room?.image) return null;
  return {
    image: room.room.image,
    thumb: room.room.thumb || room.room.image,
    title: room.title,
    footAnchor: room.room.footAnchor,
    scene: room.room.scene,
    assets: sceneAssetUrls(
      room.room.sceneAssets,
      room.animation?.src ?? null,
      browserFormat(),
      durationOf,
    ),
  };
}

export type Wait = (ms: number) => Promise<void>;

const realWait: Wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export interface Dressing<T> {
  readonly phase: DressPhase;
  /** What the scene shows: the old look until the new one is revealed. */
  readonly shown: T;
  /** Saves, then plays the effect; rejects (and keeps the old look) when the save fails. */
  readonly dress: (save: () => Promise<unknown>) => Promise<void>;
}

/**
 * Changing clothes in the order of the original (`lib/fitting-room.ts#dressCharacter`): the save
 * comes first; only then the puff covers the old hero, the new one shows and the puff fades.
 * Without motion the effect is skipped.
 */
export function useDressing<T>(
  current: T,
  { motion, wait = realWait }: { readonly motion: boolean; readonly wait?: Wait },
): Dressing<T> {
  const [state, setState] = useState<{ phase: DressPhase; frozen: { value: T } | null }>({
    phase: 'idle',
    frozen: null,
  });
  const busy = useRef(false);
  const dress = useCallback(
    async (save: () => Promise<unknown>) => {
      if (busy.current) return;
      busy.current = true;
      const frozen = { value: current };
      setState({ phase: 'saving', frozen });
      try {
        await save();
        if (motion) {
          setState({ phase: 'cover', frozen });
          await wait(DRESS_COVER_MS);
          setState({ phase: 'reveal', frozen: null });
          await wait(DRESS_REVEAL_MS);
        }
        setState({ phase: 'idle', frozen: null });
      } catch (error) {
        setState({ phase: 'idle', frozen: null });
        throw error;
      } finally {
        busy.current = false;
      }
    },
    [current, motion, wait],
  );
  return { phase: state.phase, shown: state.frozen ? state.frozen.value : current, dress };
}
