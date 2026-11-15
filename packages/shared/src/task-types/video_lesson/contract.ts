import { z } from 'zod';
import { OPTION_IDS } from '../../questions/schema';
import { defineTaskType } from '../../tasks/contract';

export const VIDEO_LESSON_TYPE = 'video_lesson';

/**
 * How watching is checked before the questions open (spec/01 §2.11):
 * - `percent` — the server counts uniquely played seconds; the threshold is `minWatchPercent`
 *   or the `watch.minPercent` setting;
 * - `none` — no condition (free rewinding);
 * - `manual` — the admin confirms that the video was watched.
 */
export const WATCH_MODES = ['percent', 'none', 'manual'] as const;
export type WatchMode = (typeof WATCH_MODES)[number];

export const MIN_WATCH_PERCENT = 10;
export const MAX_WATCH_PERCENT = 95;
export const MIN_SHUTTER_PCT = 4;
export const MAX_SHUTTER_PCT = 40;
export const DEFAULT_SHUTTER_PCT = 9;

/** Entry file of a media directory, by media kind (what the player opens). */
export const MEDIA_ENTRY = { hls: 'master.m3u8', mp4: 'video.mp4' } as const;

export const videoLessonConfigSchema = z.object({
  /** The lesson video (`media`); null for a draft that has no video yet. */
  mediaId: z.number().int().positive().nullable(),
  watchMode: z.enum(WATCH_MODES),
  /** Own threshold of this lesson in `percent` mode; omitted = the `watch.minPercent` setting. */
  minWatchPercent: z.number().int().min(MIN_WATCH_PERCENT).max(MAX_WATCH_PERCENT).optional(),
  /** The black strip over burnt-in subtitles. */
  shutter: z.object({
    enabled: z.boolean(),
    heightPct: z.number().int().min(MIN_SHUTTER_PCT).max(MAX_SHUTTER_PCT),
  }),
});
export type VideoLessonConfig = z.infer<typeof videoLessonConfigSchema>;

/** Answers are graded like a quiz: one option of a snapshotted question. */
export const videoLessonSubmissionSchema = z.object({ optionId: z.enum(OPTION_IDS) });
export type VideoLessonSubmission = z.infer<typeof videoLessonSubmissionSchema>;

export const videoLessonContract = defineTaskType<VideoLessonConfig, VideoLessonSubmission>({
  type: VIDEO_LESSON_TYPE,
  label: 'Видеоурок',
  configSchema: videoLessonConfigSchema,
  submissionSchema: videoLessonSubmissionSchema,
  defaultConfig: () => ({
    mediaId: null,
    watchMode: 'percent',
    shutter: { enabled: true, heightPct: DEFAULT_SHUTTER_PCT },
  }),
  // Nothing in the config is secret; the answers live in the question bank.
  publicConfig: (config) => ({
    mediaId: config.mediaId,
    watchMode: config.watchMode,
    shutter: config.shutter,
  }),
  // Readiness of the media and the bank size are checked on the server.
  canPublish: (task) => (task.config.mediaId === null ? ['Нужно видео урока'] : []),
});
