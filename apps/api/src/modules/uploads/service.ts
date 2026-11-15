import type { AssetSlot, AssetSlotKind } from '@questclass/shared/assets/slots';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { and, count, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { media, mediaFiles, type MediaRow } from '../../db/schema/media';
import { HttpError, conflict, notFound } from '../../http/errors';
import { auditPayload, defineAuditAction, type AuditService } from '../audit/service';
import type { UploadInfo } from '../catalog/service';
import type { MediaService } from '../media/service';
import type { MediaExtension } from '../media/safePath';
import { AUDIO_TYPES, inspectAudio } from './audio';
import { BrokenImage, IMAGE_TYPES, UnsupportedImage, inspectImage, type ImageInfo } from './webp';

export const uploadCreated = defineAuditAction(
  'upload.created',
  z.object({
    mime: z.string(),
    sizeBytes: z.number(),
    width: z.number().optional(),
    height: z.number().optional(),
    animated: z.boolean(),
    /** The built-in file it was uploaded to replace (raised limits, sounds). */
    slot: z.string().optional(),
  }),
);

/** Limits of spec/02 §2.7 (`app/api/images` of the original). */
export const UPLOAD_LIMITS = {
  stillBytes: 2 * 1024 * 1024,
  animationBytes: 5 * 1024 * 1024,
  audioBytes: 2 * 1024 * 1024,
  /** Request body: the largest file (a replacement of a big built-in one) plus headroom. */
  bodyBytes: 20 * 1000 * 1000,
  maxSide: 1024,
  maxDurationMs: 10_000,
  maxFrames: 120,
  minFrameMs: 40,
  maxUploads: 300,
} as const;

export interface UploadLimits {
  readonly stillBytes: number;
  readonly animationBytes: number;
  readonly audioBytes: number;
  readonly maxSide: number;
  readonly maxDurationMs: number;
  readonly maxFrames: number;
  readonly minFrameMs: number;
}

/** A replacement may be as big as twice the built-in file it replaces, within the body limit. */
const FILE_CAP = 19 * 1000 * 1000;
const SIDE_CAP = 4096;

/**
 * Limits of an upload: the general ones, or — for a replacement of a built-in file (`slot`) —
 * raised so that a file like the built-in one (a 1536 × 1024 room, a 6 MB movie) always fits.
 */
export function uploadLimits(slot?: AssetSlot): UploadLimits {
  const base = UPLOAD_LIMITS;
  if (!slot) {
    return base;
  }
  const twice = (limit: number, builtin: number) =>
    Math.min(FILE_CAP, Math.max(limit, builtin * 2));
  return {
    stillBytes: slot.kind === 'image' ? twice(base.stillBytes, slot.bytes) : base.stillBytes,
    animationBytes:
      slot.kind === 'animation' ? twice(base.animationBytes, slot.bytes) : base.animationBytes,
    audioBytes: slot.kind === 'audio' ? twice(base.audioBytes, slot.bytes) : base.audioBytes,
    maxSide: Math.min(
      SIDE_CAP,
      Math.max(base.maxSide, 2 * (slot.width ?? 0), 2 * (slot.height ?? 0)),
    ),
    maxDurationMs: Math.max(base.maxDurationMs, (slot.durationMs ?? 0) + 1000),
    maxFrames: Math.max(base.maxFrames, slot.frames ?? 0),
    minFrameMs: base.minFrameMs,
  };
}

export interface UploadDto {
  readonly id: number;
  readonly url: string;
  readonly mime: string;
  /** A sound is uploaded only to replace a built-in sound (FEAT-058). */
  readonly kind: 'image' | 'audio';
  readonly sizeBytes: number;
  readonly animated: boolean;
  /** Animated WebP only. */
  readonly durationMs: number | null;
  /** ISO 8601 */
  readonly createdAt: string;
}

/** What the upload answers right after it was stored. */
export interface CreatedUploadDto extends UploadDto {
  /** Null for a sound. */
  readonly width: number | null;
  readonly height: number | null;
  readonly frames: number | null;
}

export interface UploadFile {
  readonly file: string;
  readonly extension: MediaExtension;
}

export interface UploadOptions {
  /** The built-in file this upload is meant to replace: raises the limits, allows a sound. */
  readonly slot?: AssetSlot;
}

export interface UploadsService {
  /** Checks and stores one picture or (for a sound slot) one sound (media `role = upload`). */
  create(bytes: Uint8Array, actorId: number | null, options?: UploadOptions): CreatedUploadDto;
  /** Stored uploads, newest first. */
  list(): UploadDto[];
  /** One ready upload; undefined when there is none. */
  get(id: number): UploadDto | undefined;
  /** Facts the catalog needs (read from the file's headers); undefined if not a ready upload. */
  describe(id: number): UploadInfo | undefined;
  /** What a ready upload can replace: a still, an animation or a sound; undefined otherwise. */
  slotKind(id: number): AssetSlotKind | undefined;
  /** The file of a ready upload; 404 otherwise. */
  file(id: number): UploadFile;
}

export interface UploadsDeps {
  readonly audit: AuditService;
  readonly media: MediaService;
}

const FILE_NAME = { image: 'image', audio: 'sound' } as const;

const tooLarge = (message: string) => new HttpError(413, 'file_too_large', message);
const invalidImage = (message: string) => new HttpError(422, 'invalid_image', message);

/** The limits of a still picture or an animation; throws the answer for the admin. */
const megabytes = (bytes: number): string => `${Math.round((bytes / 1024 / 1024) * 10) / 10} МБ`;

export function checkLimits(
  info: ImageInfo,
  sizeBytes: number,
  limits: UploadLimits = UPLOAD_LIMITS,
): void {
  const limit = info.animated ? limits.animationBytes : limits.stillBytes;
  if (sizeBytes > limit) {
    throw tooLarge(
      info.animated
        ? `Анимация должна быть меньше ${megabytes(limit)}`
        : `Картинка должна быть меньше ${megabytes(limit)}`,
    );
  }
  if (info.width > limits.maxSide || info.height > limits.maxSide) {
    throw invalidImage(
      limits.maxSide === UPLOAD_LIMITS.maxSide
        ? 'Размер — не больше 1024 × 1024. Рекомендуем 512 × 512'
        : `Размер — не больше ${limits.maxSide} × ${limits.maxSide}`,
    );
  }
  if (!info.animated) {
    return;
  }
  if ((info.frames ?? 0) < 2) {
    throw invalidImage('В анимации должно быть хотя бы два кадра');
  }
  if ((info.minFrameMs ?? 0) < limits.minFrameMs) {
    throw invalidImage('Анимация слишком быстрая: используйте не больше 25 кадров в секунду');
  }
  if ((info.frames ?? 0) > limits.maxFrames || (info.durationMs ?? 0) > limits.maxDurationMs) {
    throw invalidImage(
      `Используйте короткий цикл: до ${Math.round(limits.maxDurationMs / 1000)} секунд и до ${limits.maxFrames} кадров`,
    );
  }
}

function inspect(bytes: Uint8Array): ImageInfo {
  try {
    return inspectImage(bytes);
  } catch (err) {
    if (err instanceof UnsupportedImage) {
      throw new HttpError(415, 'unsupported_type', err.message);
    }
    if (err instanceof BrokenImage) {
      throw invalidImage(`Файл повреждён: ${err.message}`);
    }
    throw err;
  }
}

interface CheckedFile {
  readonly kind: 'image' | 'audio';
  readonly fileName: string;
  readonly mime: string;
  /** Null for a sound. */
  readonly image: ImageInfo | null;
}

/** Recognises the file and checks it against the limits (of its slot, if it replaces one). */
function checkFile(bytes: Uint8Array, slot: AssetSlot | undefined): CheckedFile {
  const limits = uploadLimits(slot);
  const sound = inspectAudio(bytes);
  if (slot?.kind === 'audio') {
    if (!sound) {
      throw new HttpError(415, 'unsupported_type', 'Нужен звук: MP3 или OGG');
    }
    if (bytes.length > limits.audioBytes) {
      throw tooLarge(`Звук должен быть меньше ${megabytes(limits.audioBytes)}`);
    }
    const type = AUDIO_TYPES[sound];
    return {
      kind: 'audio',
      fileName: `${FILE_NAME.audio}${type.extension}`,
      mime: type.mime,
      image: null,
    };
  }
  if (sound) {
    throw new HttpError(
      415,
      'unsupported_type',
      'Звук загружается только на замену встроенного звука (раздел «Оформление»)',
    );
  }
  const info = inspect(bytes);
  checkLimits(info, bytes.length, limits);
  const type = IMAGE_TYPES[info.type];
  return {
    kind: 'image',
    fileName: `${FILE_NAME.image}${type.extension}`,
    mime: type.mime,
    image: info,
  };
}

const extensionOf = (filePath: string): MediaExtension => path.extname(filePath) as MediaExtension;
const mimeOf = (extension: string): string =>
  [...Object.values(IMAGE_TYPES), ...Object.values(AUDIO_TYPES)].find(
    (t) => t.extension === extension,
  )?.mime ?? 'application/octet-stream';

function toDto(row: MediaRow, filePath: string): UploadDto {
  return {
    id: row.id,
    url: `/api/uploads/${row.id}`,
    mime: mimeOf(path.extname(filePath)),
    kind: row.kind === 'audio' ? 'audio' : 'image',
    sizeBytes: row.sizeBytes ?? 0,
    animated: row.durationSec !== null,
    durationMs: row.durationSec === null ? null : Math.round(row.durationSec * 1000),
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

export function createUploadsService(db: Db, deps: UploadsDeps): UploadsService {
  const { audit, media: mediaService } = deps;

  const liveUploads = () => and(eq(media.role, 'upload'), ne(media.status, 'deleted'));

  /** A ready upload and its single file. */
  const ready = (id: number) => {
    const row = mediaService.find(id);
    if (row?.role !== 'upload' || row.status !== 'ready') {
      return undefined;
    }
    const [declared] = mediaService.files(id);
    return declared ? { row, filePath: declared.path } : undefined;
  };

  /** Headers of a ready picture; undefined for a sound, a broken file or no such upload. */
  const describe = (id: number): UploadInfo | undefined => {
    const found = ready(id);
    if (found?.row.kind !== 'image') {
      return undefined;
    }
    try {
      const info = inspectImage(
        readFileSync(path.join(mediaService.dirOf(found.row), found.filePath)),
      );
      return {
        animated: info.animated,
        width: info.width,
        height: info.height,
        ...(info.durationMs !== undefined && { durationMs: info.durationMs }),
      };
    } catch {
      return undefined;
    }
  };

  return {
    create(bytes, actorId, options = {}) {
      const stored = checkFile(bytes, options.slot);
      const used = db.select({ n: count() }).from(media).where(liveUploads()).get()?.n ?? 0;
      if (used >= UPLOAD_LIMITS.maxUploads) {
        throw conflict(
          'uploads_full',
          'Можно загрузить до 300 картинок. Выберите одну из уже загруженных.',
        );
      }
      const { fileName, image } = stored;
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const created = mediaService.create({
        taskId: null,
        role: 'upload',
        kind: stored.kind,
        files: [{ path: fileName, sizeBytes: bytes.length, sha256 }],
      });
      try {
        writeFileSync(path.join(mediaService.dirOf(created), fileName), bytes);
      } catch (err) {
        mediaService.markDeleted(created.id);
        throw err;
      }
      const row = mediaService.markReady(created.id, {
        sizeBytes: bytes.length,
        durationSec: image?.animated ? (image.durationMs ?? 0) / 1000 : null,
      });
      const payload = auditPayload(uploadCreated, {
        mime: stored.mime,
        sizeBytes: bytes.length,
        ...(image && { width: image.width, height: image.height }),
        animated: image?.animated ?? false,
        ...(options.slot && { slot: options.slot.key }),
      });
      audit.record(actorId, uploadCreated, 'upload', row.id, payload);
      return {
        ...toDto(row, fileName),
        width: image?.width ?? null,
        height: image?.height ?? null,
        frames: image?.frames ?? null,
      };
    },

    list() {
      const rows = db
        .select({ row: media, filePath: mediaFiles.path })
        .from(media)
        .innerJoin(mediaFiles, eq(mediaFiles.mediaId, media.id))
        .where(and(eq(media.role, 'upload'), eq(media.status, 'ready')))
        .orderBy(desc(media.createdAt), desc(media.id))
        .all();
      return rows.map(({ row, filePath }) => toDto(row, filePath));
    },

    get(id) {
      const found = ready(id);
      return found ? toDto(found.row, found.filePath) : undefined;
    },

    describe,

    slotKind(id) {
      if (ready(id)?.row.kind === 'audio') {
        return 'audio';
      }
      const info = describe(id);
      if (!info) {
        return undefined;
      }
      return info.animated ? 'animation' : 'image';
    },

    file(id) {
      const found = ready(id);
      if (!found) {
        throw notFound('Картинка не найдена');
      }
      return {
        file: path.join(mediaService.dirOf(found.row), found.filePath),
        extension: extensionOf(found.filePath),
      };
    },
  };
}
