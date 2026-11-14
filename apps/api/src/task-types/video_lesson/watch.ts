import {
  MEDIA_ENTRY,
  VIDEO_LESSON_TYPE,
  type VideoLessonConfig,
} from '@questclass/shared/task-types/video_lesson/contract';
import type {
  WatchBatch,
  WatchProgressDto,
  WatchSessionDto,
} from '@questclass/shared/task-types/video_lesson/dto';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client';
import type { MediaRow } from '../../db/schema/media';
import { watchProgress, type WatchProgressRow } from '../../db/schema/watchProgress';
import { watchSessions, type WatchSessionRow } from '../../db/schema/watchSessions';
import { HttpError, conflict, notFound } from '../../http/errors';
import { auditPayload, defineAuditAction, type AuditService } from '../../modules/audit/service';
import type { MediaService } from '../../modules/media/service';
import type { ProgressService } from '../../modules/progress/service';
import type { SettingsService } from '../../modules/settings/service';
import type { TasksService } from '../../modules/tasks/service';
import type { UsersService } from '../../modules/users/service';
import type { TaskRecord } from '../registry';
import { findWatchRow, requiredPercent, watchSatisfied } from './canStart';
import {
  capToBudget,
  clipToDuration,
  mergeSpans,
  percentOf,
  totalLength,
  type Span,
} from './intervals';

export const watchConfirmed = defineAuditAction(
  'watch.confirmed',
  z.object({ taskId: z.number(), mediaId: z.number() }),
);

/** More disjoint spans than any real watching produces: the batch is refused. */
export const MAX_STORED_SPANS = 2000;

export interface ConfirmResult {
  readonly progress: WatchProgressDto;
  /** False when the watching was already confirmed. */
  readonly created: boolean;
}

export interface WatchService {
  /** Opens the lesson video; an open session of the same learner and task is closed. */
  startSession(learnerId: number, taskId: number): WatchSessionDto;
  /** Credits a batch of played intervals of the open session. */
  recordBatch(
    learnerId: number,
    taskId: number,
    sessionId: number,
    batch: WatchBatch,
  ): WatchProgressDto;
  /** The admin confirms by hand that the learner watched the lesson's current video. */
  confirm(learnerId: number, taskId: number, actorId: number | null): ConfirmResult;
  /**
   * Lessons in `manual` mode whose current video an active learner has opened and that wait for
   * the admin's confirmation (the lesson is visible and not done yet). Read-only.
   */
  pendingConfirmations(): { learnerId: number; taskId: number }[];
}

export interface WatchDeps {
  readonly audit: AuditService;
  readonly settings: SettingsService;
  readonly users: UsersService;
  readonly tasks: TasksService;
  readonly progress: ProgressService;
  readonly media: MediaService;
  readonly clock?: () => number;
}

interface PlayableVideo {
  readonly media: MediaRow;
  readonly kind: 'hls' | 'mp4';
  readonly durationSec: number;
}

const videoNotReady = () => conflict('video_not_ready', 'Видео урока ещё не готово');
const gone = () => new HttpError(410, 'media_deleted', 'Видео уже удалено с сервера');

export function createWatchService(db: Db, deps: WatchDeps): WatchService {
  const { audit, settings, users, tasks, progress, media } = deps;
  const now = deps.clock ?? (() => Date.now());

  /** The task as a video lesson; 404 for anything else. */
  const lessonOf = (taskId: number): TaskRecord<VideoLessonConfig> => {
    const task = tasks.record(taskId);
    if (task?.type !== VIDEO_LESSON_TYPE) {
      throw notFound('Видеоурок не найден');
    }
    return task as TaskRecord<VideoLessonConfig>;
  };

  const playable = (mediaId: number | null): PlayableVideo => {
    const row = mediaId === null ? undefined : media.find(mediaId);
    if (row?.status === 'deleted') {
      throw gone();
    }
    if (!row || row.status !== 'ready' || row.kind === 'image' || !row.durationSec) {
      throw videoNotReady();
    }
    return { media: row, kind: row.kind, durationSec: row.durationSec };
  };

  /** 404 unless the learner can see the task now. */
  const requireVisible = (learnerId: number, taskId: number) => {
    const standing = progress.standing(learnerId, taskId);
    if (!standing.visible) {
      throw notFound('Видеоурок не найден');
    }
    return standing;
  };

  const ensureRow = (learnerId: number, taskId: number, mediaId: number): WatchProgressRow => {
    const found = findWatchRow(db, learnerId, taskId, mediaId);
    if (found) {
      return found;
    }
    const at = now();
    return db
      .insert(watchProgress)
      .values({ learnerId, taskId, mediaId, intervals: [], createdAt: at, updatedAt: at })
      .returning()
      .get();
  };

  const progressDto = (
    task: TaskRecord<VideoLessonConfig>,
    mediaId: number,
    durationSec: number,
    row: WatchProgressRow | undefined,
  ): WatchProgressDto => ({
    taskId: task.id,
    mediaId,
    mode: task.config.watchMode,
    durationSec,
    watchedSec: row?.watchedSec ?? 0,
    percent: row?.percent ?? 0,
    requiredPercent:
      task.config.watchMode === 'percent' ? requiredPercent(task.config, settings) : null,
    lastPosition: Math.min(row?.lastPosition ?? 0, durationSec),
    confirmed: (row?.confirmedAt ?? null) !== null,
    satisfied: watchSatisfied(task.config, row, settings),
  });

  const openSession = (learnerId: number, taskId: number): WatchSessionRow | undefined =>
    db
      .select()
      .from(watchSessions)
      .where(
        and(
          eq(watchSessions.learnerId, learnerId),
          eq(watchSessions.taskId, taskId),
          isNull(watchSessions.closedAt),
        ),
      )
      .get();

  return {
    startSession(learnerId, taskId) {
      return db.transaction(() => {
        const standing = requireVisible(learnerId, taskId);
        const task = lessonOf(taskId);
        if (!standing.available) {
          throw conflict('task_locked', 'Этот урок ещё не открыт');
        }
        const video = playable(task.config.mediaId);
        const at = now();
        const previous = openSession(learnerId, taskId);
        if (previous) {
          db.update(watchSessions)
            .set({ closedAt: at })
            .where(eq(watchSessions.id, previous.id))
            .run();
        }
        const session = db
          .insert(watchSessions)
          .values({ learnerId, taskId, mediaId: video.media.id, startedAt: at, lastBatchAt: at })
          .returning()
          .get();
        const row = ensureRow(learnerId, taskId, video.media.id);
        progress.markStarted(learnerId, taskId, at);
        return {
          sessionId: session.id,
          media: {
            id: video.media.id,
            kind: video.kind,
            durationSec: video.durationSec,
            src: `/api/media/${video.media.id}/${MEDIA_ENTRY[video.kind]}`,
          },
          progress: progressDto(task, video.media.id, video.durationSec, row),
        };
      });
    },

    recordBatch(learnerId, taskId, sessionId, batch) {
      return db.transaction(() => {
        const session = db
          .select()
          .from(watchSessions)
          .where(eq(watchSessions.id, sessionId))
          .get();
        if (session?.learnerId !== learnerId || session.taskId !== taskId) {
          throw notFound('Сессия просмотра не найдена');
        }
        requireVisible(learnerId, taskId);
        if (session.closedAt !== null) {
          throw conflict('session_closed', 'Видео открыто в другом окне. Открой урок снова.');
        }
        const task = lessonOf(taskId);
        if (task.config.mediaId !== session.mediaId) {
          throw conflict('session_outdated', 'Видео урока заменили. Открой урок снова.');
        }
        const video = playable(session.mediaId);
        const at = now();
        const elapsedSec = Math.max(0, at - session.lastBatchAt) / 1000;
        const budget = elapsedSec * settings.get('watch.maxRate');

        const played: Span[] = batch.intervals
          .filter((interval) => interval.kind === 'main')
          .map((interval) => [interval.start, interval.end]);
        const credited = capToBudget(clipToDuration(played, video.durationSec), budget);

        const row = ensureRow(learnerId, taskId, video.media.id);
        const merged = mergeSpans([...row.intervals, ...credited]);
        if (merged.length > MAX_STORED_SPANS) {
          throw new HttpError(422, 'too_many_intervals', 'Слишком много отдельных фрагментов');
        }
        const watchedSec = totalLength(merged);
        const percent = percentOf(watchedSec, video.durationSec);
        const reached =
          task.config.watchMode === 'percent' && percent >= requiredPercent(task.config, settings);
        const updated = db
          .update(watchProgress)
          .set({
            intervals: merged,
            watchedSec,
            percent,
            lastPosition:
              batch.position === undefined
                ? row.lastPosition
                : Math.min(batch.position, video.durationSec),
            completedAt: row.completedAt ?? (reached ? at : null),
            updatedAt: at,
          })
          .where(eq(watchProgress.id, row.id))
          .returning()
          .get();
        db.update(watchSessions)
          .set({ lastBatchAt: at, creditedSec: session.creditedSec + totalLength(credited) })
          .where(eq(watchSessions.id, session.id))
          .run();
        return progressDto(task, video.media.id, video.durationSec, updated);
      });
    },

    pendingConfirmations() {
      const rows = db
        .select({
          learnerId: watchProgress.learnerId,
          taskId: watchProgress.taskId,
          mediaId: watchProgress.mediaId,
        })
        .from(watchProgress)
        .where(isNull(watchProgress.confirmedAt))
        .all();
      return rows
        .filter((row) => {
          const task = tasks.record(row.taskId);
          if (task?.type !== VIDEO_LESSON_TYPE) return false;
          const config = (task as TaskRecord<VideoLessonConfig>).config;
          if (config.watchMode !== 'manual' || config.mediaId !== row.mediaId) return false;
          if (users.findRow(row.learnerId)?.active !== true) return false;
          const standing = progress.standing(row.learnerId, row.taskId);
          return standing.visible && !standing.completed;
        })
        .map(({ learnerId, taskId }) => ({ learnerId, taskId }));
    },

    confirm(learnerId, taskId, actorId) {
      return db.transaction(() => {
        const learner = users.findRow(learnerId);
        if (learner?.role !== 'learner') {
          throw notFound('Ученик не найден');
        }
        const task = lessonOf(taskId);
        const mediaId = task.config.mediaId;
        if (mediaId === null) {
          throw conflict('no_video', 'У урока ещё нет видео');
        }
        const durationSec = media.find(mediaId)?.durationSec ?? 0;
        const row = ensureRow(learnerId, taskId, mediaId);
        if (row.confirmedAt !== null) {
          return { progress: progressDto(task, mediaId, durationSec, row), created: false };
        }
        const at = now();
        const updated = db
          .update(watchProgress)
          .set({ confirmedBy: actorId, confirmedAt: at, updatedAt: at })
          .where(eq(watchProgress.id, row.id))
          .returning()
          .get();
        const payload = auditPayload(watchConfirmed, { taskId, mediaId });
        audit.record(actorId, watchConfirmed, 'task', taskId, payload, { learnerId });
        return { progress: progressDto(task, mediaId, durationSec, updated), created: true };
      });
    },
  };
}
