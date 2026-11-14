// «Оформление» (FEAT-059): built-in files the admin replaced with own uploads.
import { z } from 'zod';
import type { AssetGroupId, AssetSlotKind } from './slots';

export interface AssetReplacementDto {
  readonly uploadId: number;
  readonly mime: string;
  readonly sizeBytes: number;
  /** Animations only. */
  readonly durationMs: number | null;
  /** ISO 8601 */
  readonly updatedAt: string;
}

/** One replaceable built-in file as the admin sees it. */
export interface AppearanceSlotDto {
  readonly key: string;
  /** Files it stands for (a sound: `.mp3` and `.ogg`). */
  readonly files: readonly string[];
  readonly kind: AssetSlotKind;
  readonly group: AssetGroupId;
  /** The built-in file. */
  readonly builtin: {
    readonly width: number | null;
    readonly height: number | null;
    readonly bytes: number;
    readonly frames: number | null;
    readonly durationMs: number | null;
  };
  /** What the app shows now, cache-busted by the replacement (`/assets/…?v=12`). */
  readonly url: string;
  readonly replacement: AssetReplacementDto | null;
}

/** Replaced files by served file key (`game/x.webp`), for everyone (also before signing in). */
export interface AppearanceDto {
  readonly files: Readonly<
    Record<string, { readonly version: number; readonly durationMs: number | null }>
  >;
}

export const appearanceReplaceSchema = z.object({
  uploadId: z.number().int().positive(),
});
export type AppearanceReplaceRequest = z.infer<typeof appearanceReplaceSchema>;

/** `/assets/<file>` with every path segment encoded. */
export const builtinAssetUrl = (file: string): string =>
  `/assets/${file.split('/').map(encodeURIComponent).join('/')}`;
