import {
  builtinAssetUrl,
  type AppearanceDto,
  type AppearanceSlotDto,
} from '@questclass/shared/assets/appearance';
import {
  ASSET_SLOTS,
  assetSlot,
  assetSlotOfFile,
  type AssetSlot,
  type AssetSlotKind,
} from '@questclass/shared/assets/slots';
import type { AssetFileUse, AssetUseDto } from '@questclass/shared/assets/uses';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { assetOverrides, type AssetOverrideRow } from '../../db/schema/assetOverrides';
import { badRequest, notFound } from '../../http/errors';
import { auditPayload, defineAuditAction, type AuditService } from '../audit/service';
import type { MediaExtension } from '../media/safePath';
import type { UploadsService } from '../uploads/service';

export const assetReplaced = defineAuditAction(
  'asset.replaced',
  z.object({ slot: z.string(), uploadId: z.number(), previousUploadId: z.number().nullable() }),
);
export const assetRestored = defineAuditAction(
  'asset.restored',
  z.object({ slot: z.string(), uploadId: z.number() }),
);

/** The file the static server sends instead of a built-in one. */
export interface AssetReplacementFile {
  readonly file: string;
  readonly extension: MediaExtension;
  /** Strong validator: changes with the replacement. */
  readonly etag: string;
}

export interface AppearanceService {
  /**
   * The built-in files the app shows (and the replaced ones), with where each shows and its
   * replacement, for the admin. A file nothing shows is left out: replacing it changes nothing.
   */
  list(): AppearanceSlotDto[];
  /** Replaces a built-in file with an upload of the same kind (still, animation, sound). */
  replace(slotKey: string, uploadId: number, actorId: number | null): AppearanceSlotDto;
  /** Puts the built-in file back (no-op when it was not replaced). */
  restore(slotKey: string, actorId: number | null): AppearanceSlotDto;
  /** Replaced files for every client: versions (cache busting) and animation lengths. */
  current(): AppearanceDto;
  /** What to send for `/assets/<file>`, or undefined for the built-in file. */
  replacementOf(file: string): AssetReplacementFile | undefined;
  /** Length of a replaced animation, ms; undefined when the file is built-in. */
  durationOf(file: string): number | undefined;
}

export interface AppearanceDeps {
  readonly audit: AuditService;
  readonly uploads: UploadsService;
  /** Every use of a built-in file: shop items, subjects, the app itself (read on each list). */
  readonly uses?: () => readonly AssetFileUse[];
  readonly clock?: () => number;
}

const KIND_NEEDED: Record<AssetSlotKind, string> = {
  image: 'Нужна обычная картинка (PNG, JPEG или WebP без анимации)',
  animation: 'Нужна анимация: анимированный WebP',
  audio: 'Нужен звук: MP3 или OGG',
};

export function createAppearanceService(db: Db, deps: AppearanceDeps): AppearanceService {
  const { audit, uploads, uses = () => [], clock = Date.now } = deps;

  /** Uses by slot key (a sound named by its `.ogg` goes to its `.mp3` slot), duplicates once. */
  const usesBySlot = (): Map<string, AssetUseDto[]> => {
    const found = new Map<string, AssetUseDto[]>();
    const seen = new Set<string>();
    for (const { file, ...use } of uses()) {
      const slot = assetSlotOfFile(file);
      const id = slot ? JSON.stringify([slot.key, use.owner, use.part, use.href]) : '';
      if (!slot || seen.has(id)) continue;
      seen.add(id);
      found.set(slot.key, [...(found.get(slot.key) ?? []), use]);
    }
    return found;
  };

  // One process serves the app: the rows are read once and re-read after every change.
  let cache: Map<string, AssetOverrideRow> | null = null;
  const rows = (): Map<string, AssetOverrideRow> => {
    cache ??= new Map(
      db
        .select()
        .from(assetOverrides)
        .all()
        .map((row) => [row.slot, row]),
    );
    return cache;
  };

  const requireSlot = (key: string): AssetSlot => {
    const slot = assetSlot(key);
    if (!slot) {
      throw notFound('Такого встроенного файла нет');
    }
    return slot;
  };

  const toDto = (slot: AssetSlot, slotUses: readonly AssetUseDto[]): AppearanceSlotDto => {
    const row = rows().get(slot.key);
    const upload = row ? uploads.get(row.uploadId) : undefined;
    const main = slot.files[0] ?? slot.key;
    return {
      key: slot.key,
      files: slot.files,
      kind: slot.kind,
      area: slotUses[0]?.area ?? 'unused',
      uses: slotUses,
      builtin: {
        width: slot.width,
        height: slot.height,
        bytes: slot.bytes,
        frames: slot.frames,
        durationMs: slot.durationMs,
      },
      url: `${builtinAssetUrl(main)}?v=${row?.uploadId ?? 0}`,
      replacement:
        row && upload
          ? {
              uploadId: row.uploadId,
              mime: upload.mime,
              sizeBytes: upload.sizeBytes,
              durationMs: upload.durationMs,
              updatedAt: new Date(row.updatedAt).toISOString(),
            }
          : null,
    };
  };

  return {
    list() {
      const found = usesBySlot();
      const replaced = rows();
      return ASSET_SLOTS.filter((slot) => found.has(slot.key) || replaced.has(slot.key)).map(
        (slot) => toDto(slot, found.get(slot.key) ?? []),
      );
    },

    replace(slotKey, uploadId, actorId) {
      const slot = requireSlot(slotKey);
      const kind = uploads.slotKind(uploadId);
      if (!kind) {
        throw badRequest('invalid_upload', 'Загрузка не найдена');
      }
      if (kind !== slot.kind) {
        throw badRequest('wrong_kind', KIND_NEEDED[slot.kind]);
      }
      const now = clock();
      db.transaction(() => {
        const previous = db
          .select()
          .from(assetOverrides)
          .where(eq(assetOverrides.slot, slot.key))
          .get();
        db.insert(assetOverrides)
          .values({ slot: slot.key, uploadId, updatedAt: now, updatedBy: actorId })
          .onConflictDoUpdate({
            target: assetOverrides.slot,
            set: { uploadId, updatedAt: now, updatedBy: actorId },
          })
          .run();
        const payload = auditPayload(assetReplaced, {
          slot: slot.key,
          uploadId,
          previousUploadId: previous?.uploadId ?? null,
        });
        audit.record(actorId, assetReplaced, 'asset', slot.key, payload);
      });
      cache = null;
      return toDto(slot, usesBySlot().get(slot.key) ?? []);
    },

    restore(slotKey, actorId) {
      const slot = requireSlot(slotKey);
      db.transaction(() => {
        const removed = db
          .delete(assetOverrides)
          .where(eq(assetOverrides.slot, slot.key))
          .returning()
          .get();
        if (removed) {
          const payload = auditPayload(assetRestored, {
            slot: slot.key,
            uploadId: removed.uploadId,
          });
          audit.record(actorId, assetRestored, 'asset', slot.key, payload);
        }
      });
      cache = null;
      return toDto(slot, usesBySlot().get(slot.key) ?? []);
    },

    current() {
      const files: Record<string, { version: number; durationMs: number | null }> = {};
      for (const row of rows().values()) {
        const slot = assetSlot(row.slot);
        if (!slot) continue;
        const durationMs =
          slot.kind === 'animation' ? (uploads.get(row.uploadId)?.durationMs ?? null) : null;
        for (const file of slot.files) {
          files[file] = { version: row.uploadId, durationMs };
        }
      }
      return { files };
    },

    replacementOf(file) {
      const slot = assetSlotOfFile(file);
      const row = slot ? rows().get(slot.key) : undefined;
      if (!row) {
        return undefined;
      }
      try {
        const found = uploads.file(row.uploadId);
        return { ...found, etag: `"r${row.uploadId}"` };
      } catch {
        return undefined;
      }
    },

    durationOf(file) {
      const slot = assetSlotOfFile(file);
      const row = slot?.kind === 'animation' ? rows().get(slot.key) : undefined;
      return row ? (uploads.get(row.uploadId)?.durationMs ?? undefined) : undefined;
    },
  };
}
