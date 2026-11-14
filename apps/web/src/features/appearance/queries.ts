// What the admin replaced in «Оформление» (FEAT-059/060). The files themselves come from their
// usual /assets URLs; this list adds what a URL cannot tell: the length of a replaced animation.
import type { AppearanceDto } from '@questclass/shared/assets/appearance';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../../api/client';
import { builtinDurationMs } from '../tasks/assets';

export const appearanceKeys = {
  current: ['appearance'] as const,
  admin: ['admin', 'appearance'] as const,
};

/** Public: replaced files with their versions and animation lengths. */
export function useAppearance() {
  return useQuery({
    queryKey: appearanceKeys.current,
    queryFn: () => api<AppearanceDto>('/api/appearance'),
    staleTime: 60_000,
  });
}

/** Length of a game animation (`game/x.webp`): the admin's replacement, else the built-in one. */
export type AssetDuration = (file: string) => number | undefined;

export function useAssetDuration(): AssetDuration {
  const files = useAppearance().data?.files;
  return useCallback(
    (file: string) => files?.[file]?.durationMs ?? builtinDurationMs(file),
    [files],
  );
}
