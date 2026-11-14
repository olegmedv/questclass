import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import {
  media,
  mediaFiles,
  type MediaFileRow,
  type MediaKind,
  type MediaRole,
  type MediaRow,
} from '../../db/schema/media';
import { HttpError, notFound } from '../../http/errors';
import type { Actor } from '../../http/route';
import type { TasksService } from '../tasks/service';
import { parseMediaPath, safePath, UnsafePathError, type MediaPath } from './safePath';

/** Media live under `DATA_DIR/media/<dir>/`. */
export const MEDIA_DIRNAME = 'media';

export interface MediaFileInput {
  /** Relative path inside the media directory (checked with `parseMediaPath`). */
  readonly path: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface MediaCreateInput {
  readonly taskId: number | null;
  readonly role: MediaRole;
  readonly kind: MediaKind;
  /** Files the upload will bring (declared up front, see `media_files`). */
  readonly files?: readonly MediaFileInput[];
}

export interface ReadyInput {
  readonly sizeBytes: number;
  readonly durationSec?: number | null;
}

/** A file of a media resolved for a request. */
export interface ResolvedMediaFile {
  readonly media: MediaRow;
  /** Absolute path on disk. */
  readonly file: string;
  readonly path: MediaPath;
}

export interface MediaService {
  /** `DATA_DIR/media`. */
  readonly root: string;
  /** A new `pending` media with a fresh directory (and its declared files). */
  create(input: MediaCreateInput): MediaRow;
  find(id: number): MediaRow | undefined;
  /** Declared files in path order. */
  files(mediaId: number): MediaFileRow[];
  /** Absolute directory of a media. */
  dirOf(row: MediaRow): string;
  /** The first chunk arrived. */
  markUploading(id: number): MediaRow;
  /** Every file is in place and verified. */
  markReady(id: number, input: ReadyInput): MediaRow;
  /** Retention may delete the files after `at` (epoch ms); null cancels. */
  scheduleDeletion(id: number, at: number | null): MediaRow;
  /** Removes the files; the row stays as history with `status = deleted`. */
  markDeleted(id: number): MediaRow;
  /**
   * The file a caller asks for, or an HttpError: unknown media, a learner asking for media of a
   * task they cannot see, an unsafe path or a media that is not ready → 404; deleted → 410.
   */
  resolveFile(actor: Actor, mediaId: number, rawPath: string): Promise<ResolvedMediaFile>;
}

export interface MediaDeps {
  readonly dataDir: string;
  readonly tasks: TasksService;
  readonly clock?: () => number;
}

const gone = () => new HttpError(410, 'media_deleted', 'Видео уже удалено с сервера');
const notReady = () => new HttpError(404, 'media_not_ready', 'Файл ещё не загружен');

export function createMediaService(db: Db, deps: MediaDeps): MediaService {
  const { tasks, clock = Date.now } = deps;
  const root = path.join(deps.dataDir, MEDIA_DIRNAME);

  const requireRow = (id: number): MediaRow => {
    const row = db.select().from(media).where(eq(media.id, id)).get();
    if (!row) {
      throw notFound('Файл не найден');
    }
    return row;
  };

  const update = (id: number, set: Partial<MediaRow>): MediaRow => {
    requireRow(id);
    return db.update(media).set(set).where(eq(media.id, id)).returning().get() ?? requireRow(id);
  };

  const dirOf = (row: MediaRow): string => path.join(root, row.dir);

  return {
    root,

    create(input) {
      const files = (input.files ?? []).map((file) => ({
        ...file,
        path: parseMediaPath(file.path).relative,
      }));
      const dir = randomBytes(12).toString('hex');
      const row = db.transaction(() => {
        const created = db
          .insert(media)
          .values({
            taskId: input.taskId,
            role: input.role,
            kind: input.kind,
            dir,
            status: 'pending',
            createdAt: clock(),
          })
          .returning()
          .get();
        for (const file of files) {
          db.insert(mediaFiles)
            .values({
              mediaId: created.id,
              path: file.path,
              sizeBytes: file.sizeBytes,
              sha256: file.sha256.toLowerCase(),
            })
            .run();
        }
        return created;
      });
      mkdirSync(dirOf(row), { recursive: true });
      return row;
    },

    find: (id) => db.select().from(media).where(eq(media.id, id)).get(),

    files: (mediaId) =>
      db
        .select()
        .from(mediaFiles)
        .where(eq(mediaFiles.mediaId, mediaId))
        .orderBy(asc(mediaFiles.path))
        .all(),

    dirOf,

    markUploading: (id) => update(id, { status: 'uploading' }),

    markReady: (id, input) =>
      update(id, {
        status: 'ready',
        sizeBytes: input.sizeBytes,
        durationSec: input.durationSec ?? null,
        readyAt: clock(),
      }),

    scheduleDeletion: (id, at) => update(id, { deleteAfter: at }),

    markDeleted(id) {
      const row = requireRow(id);
      if (row.status === 'deleted') {
        return row;
      }
      // Files first: if that fails the row keeps its status and the next run retries.
      rmSync(dirOf(row), { recursive: true, force: true, maxRetries: 3 });
      return update(id, { status: 'deleted', deletedAt: clock() });
    },

    async resolveFile(actor, mediaId, rawPath) {
      const row = db.select().from(media).where(eq(media.id, mediaId)).get();
      if (!row) {
        throw notFound('Файл не найден');
      }
      if (actor.role !== 'admin') {
        if (actor.role !== 'learner' || row.taskId === null) {
          throw notFound('Файл не найден');
        }
        // 404 unless the task is published, released and meant for this learner.
        tasks.visibleTask(actor.id, row.taskId);
      }
      if (row.status === 'deleted') {
        throw gone();
      }
      if (row.status !== 'ready') {
        throw notReady();
      }
      try {
        const parsed = parseMediaPath(rawPath);
        const file = await safePath(dirOf(row), rawPath);
        return { media: row, file, path: parsed };
      } catch (err) {
        if (err instanceof UnsafePathError) {
          throw notFound('Файл не найден');
        }
        throw err;
      }
    },
  };
}
