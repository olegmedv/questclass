import type { VideoLessonConfig } from '@questclass/shared/task-types/video_lesson/contract';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { media } from '../../db/schema/media';
import { watchProgress, type WatchProgressRow } from '../../db/schema/watchProgress';
import type { SettingsService } from '../../modules/settings/service';
import type { CanStartInput, CanStartResult } from '../registry';

/** Threshold of a lesson in `percent` mode: its own, or the installation default. */
export function requiredPercent(config: VideoLessonConfig, settings: SettingsService): number {
  return config.minWatchPercent ?? settings.get('watch.minPercent');
}

export function findWatchRow(
  db: Db,
  learnerId: number,
  taskId: number,
  mediaId: number,
): WatchProgressRow | undefined {
  return db
    .select()
    .from(watchProgress)
    .where(
      and(
        eq(watchProgress.learnerId, learnerId),
        eq(watchProgress.taskId, taskId),
        eq(watchProgress.mediaId, mediaId),
      ),
    )
    .get();
}

/**
 * Whether the watching condition of the lesson's mode is met. An admin's confirmation counts in
 * every mode; a threshold reached once stays reached even if the lesson's threshold is raised.
 */
export function watchSatisfied(
  config: VideoLessonConfig,
  row: WatchProgressRow | undefined,
  settings: SettingsService,
): boolean {
  if (config.watchMode === 'none' || (row?.confirmedAt ?? null) !== null) {
    return true;
  }
  if (config.watchMode === 'manual' || !row) {
    return false;
  }
  return row.completedAt !== null || row.percent >= requiredPercent(config, settings);
}

/** The lesson's video was removed by retention (FEAT-022): nothing is left to watch. */
function videoDeleted(db: Db, mediaId: number | null): boolean {
  if (mediaId === null) {
    return false;
  }
  const row = db.select({ status: media.status }).from(media).where(eq(media.id, mediaId)).get();
  return row?.status === 'deleted';
}

/**
 * The questions of a video lesson open only once the video is watched by the lesson's rule.
 * Once the video is deleted (retention), the questions open without watching.
 */
export function canStartVideoLesson({
  task,
  learnerId,
  deps,
}: CanStartInput<VideoLessonConfig>): CanStartResult {
  const { config } = task;
  if (config.watchMode === 'none' || videoDeleted(deps.db, config.mediaId)) {
    return { ok: true };
  }
  const row =
    config.mediaId === null ? undefined : findWatchRow(deps.db, learnerId, task.id, config.mediaId);
  if (watchSatisfied(config, row, deps.settings)) {
    return { ok: true };
  }
  if (config.watchMode === 'manual') {
    return {
      ok: false,
      code: 'watch_not_confirmed',
      message: 'Просмотр этого урока подтверждает родитель',
    };
  }
  const needed = requiredPercent(config, deps.settings);
  return {
    ok: false,
    code: 'watch_required',
    message: `Сначала посмотри видео: нужно ${needed}% (сейчас ${row?.percent ?? 0}%)`,
  };
}
