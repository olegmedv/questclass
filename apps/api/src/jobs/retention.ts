import type { TaskProgressDto } from '@questclass/shared/progress/dto';
import { and, eq, isNotNull, lte, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import { media, type MediaRow } from '../db/schema/media';
import type { MediaService } from '../modules/media/service';
import type { ProgressService } from '../modules/progress/service';
import type { SettingsService } from '../modules/settings/service';
import type { TasksService } from '../modules/tasks/service';
import type { UsersService } from '../modules/users/service';
import type { Job } from './scheduler';

export const RETENTION_JOB = 'video-retention';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface RetentionDeps {
  readonly db: Db;
  readonly media: MediaService;
  readonly tasks: TasksService;
  readonly progress: ProgressService;
  readonly users: UsersService;
  readonly settings: SettingsService;
}

/**
 * Deletes lesson videos (`role = video`; question pictures and uploads are kept):
 * - replaced by a re-import (`delete_after` has come);
 * - watched out: every learner the task is for (its assignees, or all active learners) passed
 *   or had it closed more than `video.retentionDays` ago, counted since their last reset.
 *
 * Files go, the row stays `deleted`; questions and transcripts stay, and the quiz of such a
 * lesson opens without watching.
 */
export function runRetention(deps: RetentionDeps, now: number): Record<string, number> {
  const { db } = deps;
  const live = and(eq(media.role, 'video'), ne(media.status, 'deleted'));

  const replaced = db
    .select()
    .from(media)
    .where(and(live, isNotNull(media.deleteAfter), lte(media.deleteAfter, now)))
    .all();
  for (const row of replaced) {
    deps.media.markDeleted(row.id);
  }

  const cutoff = now - deps.settings.get('video.retentionDays') * DAY_MS;
  const progressOf = new Map<number, Map<number, TaskProgressDto>>();
  const doneLongAgo = (learnerId: number, taskId: number): boolean => {
    let tasks = progressOf.get(learnerId);
    if (!tasks) {
      tasks = new Map(deps.progress.learnerProgress(learnerId).tasks.map((t) => [t.taskId, t]));
      progressOf.set(learnerId, tasks);
    }
    const fact = tasks.get(taskId);
    return (
      fact?.completed === true &&
      fact.completedAt !== null &&
      Date.parse(fact.completedAt) <= cutoff
    );
  };

  const candidates: MediaRow[] = db
    .select()
    .from(media)
    .where(and(live, isNotNull(media.taskId)))
    .all()
    .filter((row) => row.deleteAfter === null || row.deleteAfter > now);
  let watched = 0;
  for (const row of candidates) {
    const taskId = row.taskId;
    if (taskId === null) continue;
    const audience = deps.tasks
      .audience(taskId)
      .filter((id) => deps.users.findRow(id)?.active === true);
    if (audience.length > 0 && audience.every((learnerId) => doneLongAgo(learnerId, taskId))) {
      deps.media.markDeleted(row.id);
      watched += 1;
    }
  }
  return { replaced: replaced.length, watched, checked: candidates.length };
}

/** The hourly retention job. */
export function retentionJob(deps: RetentionDeps): Job {
  return {
    name: RETENTION_JOB,
    intervalMs: HOUR_MS,
    // Shortly after a start, so a restarted server catches up without waiting an hour.
    firstDelayMs: 5 * 60 * 1000,
    run: (now) => runRetention(deps, now),
  };
}
