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
import { BrokenImage, IMAGE_TYPES, UnsupportedImage, inspectImage, type ImageInfo } from './webp';

export const uploadCreated = defineAuditAction(
  'upload.created',
  z.object({
    mime: z.string(),
    sizeBytes: z.number(),
    width: z.number(),
    height: z.number(),
    animated: z.boolean(),
  }),
);

/** Limits of spec/02 §2.7 (`app/api/images` of the original). */
export const UPLOAD_LIMITS = {
  stillBytes: 2 * 1024 * 1024,
  animationBytes: 5 * 1024 * 1024,
  /** Request body: the largest file plus headroom. */
  bodyBytes: 6 * 1000 * 1000,
  maxSide: 1024,
  maxDurationMs: 10_000,
  maxFrames: 120,
  minFrameMs: 40,
  maxUploads: 300,
} as const;

export interface UploadDto {
  readonly id: number;
  readonly url: string;
  readonly mime: string;
  readonly sizeBytes: number;
  readonly animated: boolean;
  /** Animated WebP only. */
  readonly durationMs: number | null;
  /** ISO 8601 */
  readonly createdAt: string;
}

/** What the upload answers right after it was stored. */
export interface CreatedUploadDto extends UploadDto {
  readonly width: number;
  readonly height: number;
  readonly frames: number | null;
}

export interface UploadFile {
  readonly file: string;
  readonly extension: MediaExtension;
}

export interface UploadsService {
  /** Checks and stores one picture (media `role = upload`). */
  create(bytes: Uint8Array, actorId: number | null): CreatedUploadDto;
  /** Stored uploads, newest first. */
  list(): UploadDto[];
  /** Facts the catalog needs (read from the file's headers); undefined if not a ready upload. */
  describe(id: number): UploadInfo | undefined;
  /** The file of a ready upload; 404 otherwise. */
  file(id: number): UploadFile;
}

export interface UploadsDeps {
  readonly audit: AuditService;
  readonly media: MediaService;
}

const FILE_NAME = 'image';

const tooLarge = (message: string) => new HttpError(413, 'file_too_large', message);
const invalidImage = (message: string) => new HttpError(422, 'invalid_image', message);

/** The limits of a still picture or an animation; throws the answer for the admin. */
export function checkLimits(info: ImageInfo, sizeBytes: number): void {
  const limit = info.animated ? UPLOAD_LIMITS.animationBytes : UPLOAD_LIMITS.stillBytes;
  if (sizeBytes > limit) {
    throw tooLarge(
      info.animated ? 'Анимация должна быть меньше 5 МБ' : 'Картинка должна быть меньше 2 МБ',
    );
  }
  if (info.width > UPLOAD_LIMITS.maxSide || info.height > UPLOAD_LIMITS.maxSide) {
    throw invalidImage('Размер — не больше 1024 × 1024. Рекомендуем 512 × 512');
  }
  if (!info.animated) {
    return;
  }
  if ((info.frames ?? 0) < 2) {
    throw invalidImage('В анимации должно быть хотя бы два кадра');
  }
  if ((info.minFrameMs ?? 0) < UPLOAD_LIMITS.minFrameMs) {
    throw invalidImage('Анимация слишком быстрая: используйте не больше 25 кадров в секунду');
  }
  if (
    (info.frames ?? 0) > UPLOAD_LIMITS.maxFrames ||
    (info.durationMs ?? 0) > UPLOAD_LIMITS.maxDurationMs
  ) {
    throw invalidImage('Используйте короткий цикл: до 10 секунд и до 120 кадров');
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

const extensionOf = (filePath: string): MediaExtension => path.extname(filePath) as MediaExtension;
const mimeOf = (extension: string): string =>
  Object.values(IMAGE_TYPES).find((t) => t.extension === extension)?.mime ??
  'application/octet-stream';

function toDto(row: MediaRow, filePath: string): UploadDto {
  return {
    id: row.id,
    url: `/api/uploads/${row.id}`,
    mime: mimeOf(path.extname(filePath)),
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

  return {
    create(bytes, actorId) {
      const info = inspect(bytes);
      checkLimits(info, bytes.length);
      const used = db.select({ n: count() }).from(media).where(liveUploads()).get()?.n ?? 0;
      if (used >= UPLOAD_LIMITS.maxUploads) {
        throw conflict(
          'uploads_full',
          'Можно загрузить до 300 картинок. Выберите одну из уже загруженных.',
        );
      }
      const fileName = `${FILE_NAME}${IMAGE_TYPES[info.type].extension}`;
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const created = mediaService.create({
        taskId: null,
        role: 'upload',
        kind: 'image',
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
        durationSec: info.animated ? (info.durationMs ?? 0) / 1000 : null,
      });
      const payload = auditPayload(uploadCreated, {
        mime: IMAGE_TYPES[info.type].mime,
        sizeBytes: bytes.length,
        width: info.width,
        height: info.height,
        animated: info.animated,
      });
      audit.record(actorId, uploadCreated, 'upload', row.id, payload);
      return {
        ...toDto(row, fileName),
        width: info.width,
        height: info.height,
        frames: info.frames ?? null,
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

    describe(id) {
      const found = ready(id);
      if (!found) {
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
