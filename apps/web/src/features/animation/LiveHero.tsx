import { AnimatedHero, type AnimatedHeroProps } from '@questclass/ui';
import { useRef } from 'react';
import { useHeroAnimation, type PlaybackMode } from './AnimationManager';

export interface LiveHeroProps extends Omit<
  AnimatedHeroProps,
  'playing' | 'onToggle' | 'onLoaded' | 'onError' | 'ref'
> {
  readonly mode?: PlaybackMode;
  /** Show the «Оживить героя» button (default). */
  readonly controls?: boolean;
}

/** AnimatedHero driven by the app's animation manager (one moving hero at a time). */
export function LiveHero({ mode = 'on-demand', controls = true, ...hero }: LiveHeroProps) {
  const ref = useRef<HTMLElement>(null);
  const playback = useHeroAnimation(ref, mode, Boolean(hero.src || hero.motion));
  return (
    <AnimatedHero
      ref={ref}
      {...hero}
      playing={playback.playing}
      onToggle={controls ? playback.toggle : undefined}
      onLoaded={playback.onLoaded}
      onError={playback.onError}
    />
  );
}
