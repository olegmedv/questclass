// Live heroes: only one animation plays at a time in the whole app. Autoplay respects
// prefers-reduced-motion, a hidden tab and the hero being off screen; a tap always works.
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import { useInViewport, watchPageHidden, watchReducedMotion } from './useVisibility';

/**
 * - `autoplay` — starts by itself and keeps moving while on screen (the «Герой» screen);
 * - `autoplay-3s` — starts once by itself for 3 s after the animation has loaded (home);
 * - `on-demand` — only by the play button (shop cards, galleries).
 */
export type PlaybackMode = 'autoplay' | 'autoplay-3s' | 'on-demand';

export const AUTOPLAY_PREVIEW_MS = 3000;

export interface Clock {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realClock: Clock = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

interface Slot {
  readonly mode: PlaybackMode;
  visible: boolean;
  /** `autoplay-3s` plays by itself only once per mount. */
  previewed: boolean;
}

export class AnimationManager {
  private readonly slots = new Map<string, Slot>();
  private readonly listeners = new Set<() => void>();
  private active: string | null = null;
  private startedByUser = false;
  private timer: unknown = null;
  private reducedMotion = false;
  private pageHidden = false;

  constructor(private readonly clock: Clock = realClock) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Id of the hero that moves now, if any. */
  getActive(): string | null {
    return this.active;
  }

  isPlaying(id: string): boolean {
    return this.active === id;
  }

  /** A hero appeared. It counts as off screen until `setVisible(id, true)`. */
  register(id: string, mode: PlaybackMode): () => void {
    this.slots.set(id, { mode, visible: false, previewed: false });
    return () => this.unregister(id);
  }

  unregister(id: string): void {
    this.slots.delete(id);
    if (this.active === id) this.stop(id);
  }

  setVisible(id: string, visible: boolean): void {
    const slot = this.slots.get(id);
    if (!slot) return;
    slot.visible = visible;
    if (!visible) {
      if (this.active === id) this.stop(id);
    } else {
      this.autoplay(id);
    }
  }

  setPageHidden(hidden: boolean): void {
    this.pageHidden = hidden;
    if (hidden) {
      this.stop();
      return;
    }
    for (const id of this.slots.keys()) {
      if (this.active !== null) break;
      this.autoplay(id);
    }
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced && this.active !== null && !this.startedByUser) this.stop();
  }

  /** The animated picture of the active hero has loaded: timed previews count from here. */
  loaded(id: string): void {
    const slot = this.slots.get(id);
    if (this.active !== id || !slot || this.startedByUser || slot.mode !== 'autoplay-3s') return;
    this.clearTimer();
    this.timer = this.clock.setTimeout(() => this.stop(id), AUTOPLAY_PREVIEW_MS);
  }

  /** A tap on «Оживить героя»: works even with reduced motion, stops whoever moves now. */
  play(id: string): void {
    if (!this.slots.has(id) || this.pageHidden) return;
    this.start(id, true);
  }

  /** Stops the given hero (or whoever moves). Other heroes do not restart by themselves. */
  stop(id?: string): void {
    if (this.active === null || (id !== undefined && this.active !== id)) return;
    this.clearTimer();
    this.active = null;
    this.startedByUser = false;
    this.emit();
  }

  toggle(id: string): void {
    if (this.active === id) this.stop(id);
    else this.play(id);
  }

  private autoplay(id: string): void {
    const slot = this.slots.get(id);
    if (!slot || slot.mode === 'on-demand' || !slot.visible) return;
    if (slot.mode === 'autoplay-3s' && slot.previewed) return;
    if (this.reducedMotion || this.pageHidden || this.active !== null) return;
    if (slot.mode === 'autoplay-3s') slot.previewed = true;
    this.start(id, false);
  }

  private start(id: string, byUser: boolean): void {
    this.clearTimer();
    this.active = id;
    this.startedByUser = byUser;
    this.emit();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.clock.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

const ManagerContext = createContext<AnimationManager | null>(null);

/** One manager for the whole app, following the tab visibility and the motion preference. */
export function AnimationProvider({
  manager,
  children,
}: {
  readonly manager?: AnimationManager;
  readonly children: ReactNode;
}) {
  const [instance] = useState(() => manager ?? new AnimationManager());
  useEffect(() => {
    const stopPage = watchPageHidden((hidden) => instance.setPageHidden(hidden));
    const stopMotion = watchReducedMotion((reduced) => instance.setReducedMotion(reduced));
    return () => {
      stopPage();
      stopMotion();
    };
  }, [instance]);
  return createElement(ManagerContext.Provider, { value: instance }, children);
}

export function useAnimationManager(): AnimationManager {
  const manager = useContext(ManagerContext);
  if (!manager) throw new Error('useAnimationManager() needs an <AnimationProvider> above it');
  return manager;
}

export interface HeroPlayback {
  readonly playing: boolean;
  readonly toggle: () => void;
  readonly onLoaded: () => void;
  readonly onError: () => void;
}

/** Connects one hero on screen (its root element in `ref`) to the manager. */
export function useHeroAnimation(
  ref: RefObject<Element | null>,
  mode: PlaybackMode,
  animated = true,
): HeroPlayback {
  const manager = useAnimationManager();
  const id = useId();
  const visible = useRef(false);
  useEffect(() => {
    if (!animated) return;
    const unregister = manager.register(id, mode);
    // A re-registration (new mode) keeps the last known visibility.
    if (visible.current) manager.setVisible(id, true);
    return unregister;
  }, [manager, id, mode, animated]);
  useInViewport(ref, (isVisible) => {
    visible.current = isVisible;
    manager.setVisible(id, isVisible);
  });
  const playing = useSyncExternalStore(
    manager.subscribe,
    () => manager.isPlaying(id),
    () => false,
  );
  return {
    playing,
    toggle: () => manager.toggle(id),
    onLoaded: () => manager.loaded(id),
    onError: () => manager.stop(id),
  };
}
