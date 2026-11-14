import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, stat, statfs, truncate, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  DISK_RESERVE_BYTES,
  MAX_CHUNK_BYTES,
  type ImportMediaDto,
  type UploadResultDto,
} from '@questclass/shared/import/manifest';
import type { MediaFileRow, MediaRow } from '../../db/schema/media';
import { HttpError, badRequest, conflict, notFound } from '../../http/errors';
import type { MediaService } from '../media/service';
import { parseMediaPath, safePath, UnsafePathError } from '../media/safePath';

/** Free bytes on the volume holding `dir`. */
export type FreeSpaceProbe = (dir: string) => Promise<number>;

export const statfsFreeBytes: FreeSpaceProbe = async (dir) => {
  const info = await statfs(dir);
  return Number(info.bavail) * Number(info.bsize);
};

export interface CompletionInput {
  readonly durationSec?: number;
}

export interface Uploader {
  /** Declared files of a media with the bytes already received. */
  mediaDto(row: MediaRow): Promise<ImportMediaDto>;
  /** Appends one chunk at `offset` (which must equal the bytes already received). */
  putChunk(
    mediaId: number,
    rawPath: string,
    offset: number,
    body: ReadableStream<Uint8Array> | null,
  ): Promise<UploadResultDto>;
  /** Checks sizes and sha256 of every declared file; the media becomes `ready`. */
  complete(mediaId: number, input: CompletionInput): Promise<ImportMediaDto>;
}

export interface UploaderDeps {
  readonly media: MediaService;
  readonly freeBytes: FreeSpaceProbe;
}

const gone = () => new HttpError(410, 'media_deleted', 'Медиа уже удалено');
const invalidPath = () => badRequest('invalid_path', 'Недопустимый путь файла');

class ChunkTooLarge extends Error {}

async function sizeOf(file: string): Promise<number> {
  try {
    return (await stat(file)).size;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return 0;
    }
    throw err;
  }
}

/**
 * Appends the body to `file`, each piece written before the next is read, so that whatever
 * arrived before a broken connection is on disk. More than `limit` bytes → `ChunkTooLarge`
 * (the excess is never written).
 */
async function appendStream(
  file: string,
  body: ReadableStream<Uint8Array>,
  limit: number,
): Promise<number> {
  const handle = await open(file, 'a');
  const reader = body.getReader();
  let written = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return written;
      }
      if (written + value.length > limit) {
        throw new ChunkTooLarge();
      }
      await handle.write(value);
      written += value.length;
    }
  } finally {
    reader.releaseLock();
    await handle.close();
  }
}

async function sha256Of(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

/** Resumable, size-capped chunk upload into `DATA_DIR/media/<dir>/` and the final check. */
export function createUploader(deps: UploaderDeps): Uploader {
  const { media, freeBytes } = deps;
  /** Files being written right now (one request per file at a time). */
  const inFlight = new Set<string>();

  /** Media an import may write to (not admin uploads); 404 / 410 otherwise. */
  const importable = (mediaId: number): MediaRow => {
    const row = media.find(mediaId);
    if (!row || row.role === 'upload') {
      throw notFound('Медиа не найдено');
    }
    if (row.status === 'deleted') {
      throw gone();
    }
    return row;
  };

  const resolve = async (row: MediaRow, raw: string) => {
    try {
      return {
        relative: parseMediaPath(raw).relative,
        file: await safePath(media.dirOf(row), raw),
      };
    } catch (err) {
      if (err instanceof UnsafePathError) {
        throw invalidPath();
      }
      throw err;
    }
  };

  const fileDtos = async (row: MediaRow, files: readonly MediaFileRow[]) =>
    Promise.all(
      files.map(async (f) => ({
        path: f.path,
        size: f.sizeBytes,
        sha256: f.sha256,
        received: await sizeOf(path.join(media.dirOf(row), ...f.path.split('/'))),
      })),
    );

  const mediaDto = async (row: MediaRow): Promise<ImportMediaDto> => ({
    id: row.id,
    role: row.role === 'question_image' ? 'question_image' : 'video',
    kind: row.kind,
    status: row.status,
    files: await fileDtos(row, media.files(row.id)),
  });

  return {
    mediaDto,

    async putChunk(mediaId, rawPath, offset, body) {
      const row = importable(mediaId);
      if (row.status === 'ready') {
        throw conflict('media_ready', 'Медиа уже загружено и проверено');
      }
      const { relative, file } = await resolve(row, rawPath);
      const declared = media.files(mediaId).find((f) => f.path === relative);
      if (!declared) {
        throw notFound('Этого файла нет в манифесте');
      }
      const lock = `${mediaId}/${relative}`;
      if (inFlight.has(lock)) {
        throw conflict('upload_in_progress', 'Этот файл уже загружается');
      }
      inFlight.add(lock);
      try {
        const received = await sizeOf(file);
        if (offset !== received) {
          throw conflict('offset_mismatch', 'Смещение не совпадает с загруженным размером', {
            received,
          });
        }
        const remaining = declared.sizeBytes - received;
        const dir = media.dirOf(row);
        const free = await freeBytes(dir);
        if (free < remaining + DISK_RESERVE_BYTES) {
          throw new HttpError(507, 'insufficient_storage', 'На сервере мало места', {
            freeBytes: free,
            neededBytes: remaining + DISK_RESERVE_BYTES,
          });
        }
        if (row.status === 'pending') {
          media.markUploading(mediaId);
        }
        let written = 0;
        if (body) {
          const limit = Math.min(remaining, MAX_CHUNK_BYTES);
          await mkdir(path.dirname(file), { recursive: true });
          try {
            written = await appendStream(file, body, limit);
          } catch (err) {
            if (err instanceof ChunkTooLarge) {
              // Nothing of a refused chunk stays: the file is back at `offset`.
              await truncate(file, received);
              throw new HttpError(413, 'exceeds_declared_size', 'Больше заявленного размера', {
                received,
                maxBytes: limit,
              });
            }
            // A broken connection keeps what arrived: the client resumes at the new size.
            throw badRequest('upload_interrupted', 'Загрузка части прервалась', {
              received: await sizeOf(file),
            });
          }
        }
        const total = received + written;
        return { path: relative, received: total, complete: total === declared.sizeBytes };
      } finally {
        inFlight.delete(lock);
      }
    },

    async complete(mediaId, input) {
      const row = importable(mediaId);
      if (row.status === 'ready') {
        return mediaDto(row);
      }
      if (row.role === 'video' && input.durationSec === undefined) {
        throw badRequest('duration_required', 'Укажите длительность видео (durationSec)');
      }
      const problems: { path: string; problem: 'incomplete' | 'sha256'; received: number }[] = [];
      let total = 0;
      for (const declared of media.files(mediaId)) {
        const { file } = await resolve(row, declared.path);
        const received = await sizeOf(file);
        if (received !== declared.sizeBytes) {
          problems.push({ path: declared.path, problem: 'incomplete', received });
          continue;
        }
        if ((await sha256Of(file)) !== declared.sha256) {
          // A corrupted file is dropped so that it can be uploaded again from offset 0.
          await unlink(file);
          problems.push({ path: declared.path, problem: 'sha256', received: 0 });
          continue;
        }
        total += received;
      }
      if (problems.length > 0) {
        throw conflict('verification_failed', 'Файлы не совпали с манифестом', {
          files: problems,
        });
      }
      const ready = media.markReady(mediaId, {
        sizeBytes: total,
        durationSec: row.role === 'video' ? (input.durationSec ?? null) : null,
      });
      return mediaDto(ready);
    },
  };
}
