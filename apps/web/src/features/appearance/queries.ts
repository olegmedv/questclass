// What the admin replaced in «Оформление» (FEAT-059/060). The files themselves come from their
// usual /assets URLs; this list adds what a URL cannot tell: the length of a replaced animation.
import type { AppearanceDto, AppearanceSlotDto } from '@questclass/shared/assets/appearance';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../../api/client';
import { shopKeys, uploadPicture } from '../admin-shop/queries';
import { builtinDurationMs } from '../tasks/assets';

import { appearanceKeys } from './keys';

export { appearanceKeys };

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

// ---- the admin's «Оформление» ------------------------------------------------------------

const slotPath = (key: string): string =>
  `/api/admin/appearance/${key.split('/').map(encodeURIComponent).join('/')}`;

/** Every replaceable built-in file with its replacement. */
export function useAdminAppearance() {
  return useQuery({
    queryKey: appearanceKeys.admin,
    queryFn: () => api<AppearanceSlotDto[]>('/api/admin/appearance'),
  });
}

function useRefresh() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: appearanceKeys.admin }),
      client.invalidateQueries({ queryKey: appearanceKeys.current }),
      client.invalidateQueries({ queryKey: shopKeys.uploads }),
    ]);
}

/** Uploads a file for the slot (its limits) and puts it in place of the built-in one. */
export function useReplaceWithFile() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ slot, file }: { slot: string; file: File }) => {
      const upload = await uploadPicture(file, slot);
      return api<AppearanceSlotDto>(slotPath(slot), {
        method: 'PUT',
        json: { uploadId: upload.id },
      });
    },
    onSuccess: refresh,
  });
}

/** Puts an earlier upload (e.g. the same logo for every icon size) in place of the built-in one. */
export function useReplaceWithUpload() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ slot, uploadId }: { slot: string; uploadId: number }) =>
      api<AppearanceSlotDto>(slotPath(slot), { method: 'PUT', json: { uploadId } }),
    onSuccess: refresh,
  });
}

export function useRestoreBuiltin() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (slot: string) => api<AppearanceSlotDto>(slotPath(slot), { method: 'DELETE' }),
    onSuccess: refresh,
  });
}

/** One file for several slots (the logo in every size): uploaded once, put in place of each. */
export function useReplaceAllWithFile() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ slots, file }: { slots: readonly string[]; file: File }) => {
      const [first] = slots;
      if (first === undefined) return;
      const upload = await uploadPicture(file, first);
      for (const slot of slots) {
        await api<AppearanceSlotDto>(slotPath(slot), {
          method: 'PUT',
          json: { uploadId: upload.id },
        });
      }
    },
    // A failure half-way leaves some slots replaced: show what is there.
    onSettled: refresh,
  });
}

/** Puts the built-in files of several slots back. */
export function useRestoreAll() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (slots: readonly string[]) => {
      for (const slot of slots) {
        await api<AppearanceSlotDto>(slotPath(slot), { method: 'DELETE' });
      }
    },
    // A failure half-way leaves some slots replaced: show what is there.
    onSettled: refresh,
  });
}
