import { z } from 'zod';
import type { WatchMode } from './contract';

/** Longest video the tracker accepts (seconds). */
export const MAX_VIDEO_SECONDS = 14_400;
/** Intervals in one batch (the player sends a batch every ~20 s, on pause and on pagehide). */
export const MAX_BATCH_INTERVALS = 100;

/**
 * `main` — the lesson itself; `help` — a hint fragment opened from a question (spec/01 §2.15),
 * which never counts as watching.
 */
export const INTERVAL_KINDS = ['main', 'help'] as const;
export type IntervalKind = (typeof INTERVAL_KINDS)[number];

const seconds = z.number().min(0).max(MAX_VIDEO_SECONDS);

export const playedIntervalSchema = z
  .object({ start: seconds, end: seconds, kind: z.enum(INTERVAL_KINDS).default('main') })
  .refine((i) => i.end >= i.start, 'Конец интервала раньше начала');

/** What the player reports: continuously played, visible stretches since the last batch. */
export const watchBatchSchema = z.object({
  intervals: z.array(playedIntervalSchema).max(MAX_BATCH_INTERVALS),
  /** Current position in the lesson (resume point); omitted = unchanged. */
  position: seconds.optional(),
});

export type PlayedInterval = z.infer<typeof playedIntervalSchema>;
export type WatchBatch = z.infer<typeof watchBatchSchema>;

/** A learner's watching of one task's video. */
export interface WatchProgressDto {
  readonly taskId: number;
  readonly mediaId: number;
  readonly mode: WatchMode;
  readonly durationSec: number;
  /** Unique seconds played. */
  readonly watchedSec: number;
  /** floor(watched / duration · 100), at most 100. */
  readonly percent: number;
  /** Threshold in `percent` mode, otherwise null. */
  readonly requiredPercent: number | null;
  /** Where to resume. */
  readonly lastPosition: number;
  /** The admin confirmed the watching by hand. */
  readonly confirmed: boolean;
  /** The watching condition of the mode is met: the questions may start. */
  readonly satisfied: boolean;
}

export interface WatchMediaDto {
  readonly id: number;
  readonly kind: 'hls' | 'mp4';
  readonly durationSec: number;
  /** URL of the entry file (`/api/media/<id>/master.m3u8` or `…/video.mp4`). */
  readonly src: string;
}

/** A started watching session: only the newest session of a learner and task accepts batches. */
export interface WatchSessionDto {
  readonly sessionId: number;
  readonly media: WatchMediaDto;
  readonly progress: WatchProgressDto;
}
