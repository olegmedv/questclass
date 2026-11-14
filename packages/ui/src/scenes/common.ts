// What every live room shares: the room's files, the device settings, and the signals that stop
// a room (hidden tab, reduced motion, «Анимации фона» off) or keep it silent (no gesture yet).
import { useSyncExternalStore } from 'react';
import { usePrefersReducedMotion } from '../internal/useReducedMotion';

/** Files of a room's scene, as URLs (resolved by the app from `sceneAssets`). */
export interface RoomSceneAssets {
  /** Layers by name: candles, event clips, a curtain… */
  readonly layers?: Readonly<Record<string, string>>;
  /** Looping beds (atmosphere, music). */
  readonly ambient?: readonly string[];
  /** One-shot effects. */
  readonly events?: readonly string[];
  /** An animated WebP of the whole room (Astro, or an admin's upload). */
  readonly motion?: string | null;
}

/** The learner's room settings on this device («Настройки героя»). */
export interface RoomSceneSettings {
  /** «Анимации фона». */
  readonly animations: boolean;
  /** «Звуки комнаты»: the master switch. */
  readonly sounds: boolean;
  /** «Атмосфера / дождь». */
  readonly atmosphere: boolean;
  readonly music: boolean;
}

export const DEFAULT_ROOM_SETTINGS: RoomSceneSettings = {
  animations: true,
  sounds: false,
  atmosphere: true,
  music: false,
};

export interface LiveRoomProps {
  readonly assets: RoomSceneAssets;
  readonly settings: RoomSceneSettings;
  /** The room is the one on screen and nothing (a dialog, the dressing) holds it. */
  readonly active: boolean;
  /** A preview (shop card): no touch, no sound. */
  readonly preview?: boolean;
}

function subscribeVisibility(callback: () => void): () => void {
  document.addEventListener('visibilitychange', callback);
  window.addEventListener('pagehide', callback);
  window.addEventListener('pageshow', callback);
  return () => {
    document.removeEventListener('visibilitychange', callback);
    window.removeEventListener('pagehide', callback);
    window.removeEventListener('pageshow', callback);
  };
}

/** The tab is visible (rooms stop on a hidden tab). */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => !document.hidden,
    () => false,
  );
}

let gestured = false;
const gestureListeners = new Set<() => void>();

function onGesture() {
  if (gestured) return;
  gestured = true;
  for (const listener of gestureListeners) listener();
}

function subscribeGesture(callback: () => void): () => void {
  gestureListeners.add(callback);
  window.addEventListener('pointerdown', onGesture, true);
  window.addEventListener('keydown', onGesture, true);
  return () => {
    gestureListeners.delete(callback);
    if (gestureListeners.size === 0) {
      window.removeEventListener('pointerdown', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
    }
  };
}

/** The learner has touched the page or pressed a key: browsers allow sound from now on. */
export function useUserGesture(): boolean {
  return useSyncExternalStore(
    subscribeGesture,
    () => gestured,
    () => false,
  );
}

/** Forgets the gesture (tests). */
export function resetUserGesture(): void {
  gestured = false;
}

/** Whether a room may move now. */
export function useRoomMotion(active: boolean, settings: RoomSceneSettings): boolean {
  const visible = usePageVisible();
  const reduced = usePrefersReducedMotion();
  return active && visible && settings.animations && !reduced;
}

/** Whether a room may sound now. */
export function useRoomSound(
  active: boolean,
  settings: RoomSceneSettings,
  preview = false,
): boolean {
  const visible = usePageVisible();
  const gesture = useUserGesture();
  return active && visible && settings.sounds && gesture && !preview;
}
