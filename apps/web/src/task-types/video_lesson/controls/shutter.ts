// The strip over burnt-in subtitles: on/off and height are kept per video on this device
// (`quest-video-shutter:<mediaId>`, as in the original); the lesson's config gives the default
// height and whether the strip exists at all.
import type { ShutterState } from '@questclass/ui';
import { useCallback, useState } from 'react';

export const shutterKey = (mediaId: number) => `quest-video-shutter:${mediaId}`;

interface ShutterConfig {
  readonly enabled: boolean;
  readonly heightPct: number;
}

function read(mediaId: number, config: ShutterConfig): ShutterState {
  const fallback = { heightPct: config.heightPct, visible: true };
  try {
    const raw = localStorage.getItem(shutterKey(mediaId));
    const stored = raw ? (JSON.parse(raw) as Partial<ShutterState>) : null;
    return {
      heightPct: typeof stored?.heightPct === 'number' ? stored.heightPct : fallback.heightPct,
      visible: typeof stored?.visible === 'boolean' ? stored.visible : fallback.visible,
    };
  } catch {
    return fallback;
  }
}

/** Null when the parent switched the strip off for this lesson. */
export function useShutter(
  mediaId: number | null,
  config: ShutterConfig,
): [ShutterState | null, (next: ShutterState) => void] {
  const [state, setState] = useState<ShutterState | null>(() =>
    config.enabled && mediaId !== null ? read(mediaId, config) : null,
  );
  const update = useCallback(
    (next: ShutterState) => {
      setState(next);
      if (mediaId === null) return;
      try {
        localStorage.setItem(shutterKey(mediaId), JSON.stringify(next));
      } catch {
        // No storage (private mode): the choice lives until the page closes.
      }
    },
    [mediaId],
  );
  return [config.enabled ? state : null, update];
}
