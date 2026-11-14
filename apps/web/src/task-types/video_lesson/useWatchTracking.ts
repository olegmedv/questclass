// Honest watch tracking (FEAT-013, spec/01 §2.11): the player reports continuously played
// stretches of the video; the server credits unique seconds, never more than real time allows.
// Batches go every 20 s, on pause/end and on pagehide (sendBeacon); failed batches stay queued
// and are retried with a growing delay.
import type { WatchProgressDto } from '@questclass/shared/task-types/video_lesson/dto';
import {
  MAX_BATCH_INTERVALS,
  type IntervalKind,
  type PlayedInterval,
  type WatchBatch,
} from '@questclass/shared/task-types/video_lesson/dto';
import { useEffect, useRef, useState } from 'react';
import { api, isApiError } from '../../api/client';

/** How often the playing video reports (spec: «пачки раз в 20 с»). */
export const BATCH_MS = 20_000;
/** A jump of the media time bigger than this between two `timeupdate`s is a seek, not playback. */
export const MAX_GAP_SEC = 1.5;
const MAX_RETRY_MS = 20_000;

export interface WatchTransport {
  send(url: string, batch: WatchBatch): Promise<WatchProgressDto>;
  /** Fire-and-forget delivery while the page goes away. */
  beacon(url: string, batch: WatchBatch): void;
}

export const browserTransport: WatchTransport = {
  send: (url, batch) => api<WatchProgressDto>(url, { method: 'POST', json: batch }),
  beacon(url, batch) {
    const body = JSON.stringify(batch);
    const sent =
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    if (!sent) {
      void fetch(url, {
        method: 'POST',
        keepalive: true,
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body,
      }).catch(() => {});
    }
  },
};

export interface TrackerTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realTimers: TrackerTimers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const round = (seconds: number) => Math.round(seconds * 100) / 100;

/** Errors after which this session can no longer report (another tab, replaced video…). */
function isFatal(error: unknown): boolean {
  return isApiError(error) && [404, 409, 410].includes(error.status);
}

export interface TrackerOptions {
  readonly url: string;
  readonly kind: IntervalKind;
  readonly transport: WatchTransport;
  readonly timers?: TrackerTimers;
  readonly onProgress?: (progress: WatchProgressDto) => void;
  readonly onFatal?: (message: string) => void;
}

/** The queue of played intervals of one session (no DOM: driven by the hook or by tests). */
export class WatchTracker {
  private readonly queue: PlayedInterval[] = [];
  private current: { start: number; end: number } | null = null;
  private lastTime = 0;
  private inflight: Promise<void> | null = null;
  private failures = 0;
  private retry: unknown = null;
  private stopped = false;
  private readonly timers: TrackerTimers;

  constructor(private readonly options: TrackerOptions) {
    this.timers = options.timers ?? realTimers;
  }

  /** Intervals waiting to be delivered (the running one not included). */
  get pending(): readonly PlayedInterval[] {
    return this.queue;
  }

  /** The media time moved while playing. */
  tick(time: number): void {
    if (!this.current) {
      this.current = { start: time, end: time };
    } else {
      const delta = time - this.lastTime;
      if (delta >= 0 && delta <= MAX_GAP_SEC) {
        this.current.end = time;
      } else {
        // A seek: the stretch so far ends where playback was, a new one starts here.
        this.close();
        this.current = { start: time, end: time };
      }
    }
    this.lastTime = time;
  }

  /** Playback stopped (pause, seek, buffering, end): the running stretch is queued. */
  close(): void {
    const current = this.current;
    this.current = null;
    if (current && current.end > current.start) {
      this.queue.push({
        start: round(current.start),
        end: round(current.end),
        kind: this.options.kind,
      });
    }
  }

  /** Queues what is played so far without stopping (for the periodic batch). */
  cut(): void {
    const current = this.current;
    if (current && current.end > current.start) {
      this.queue.push({
        start: round(current.start),
        end: round(current.end),
        kind: this.options.kind,
      });
      this.current = { start: current.end, end: current.end };
    }
  }

  /** Sends the queue (and the resume position). Batches never overlap. */
  async flush(position?: number): Promise<void> {
    while (this.inflight) await this.inflight;
    if (this.stopped) return;
    const intervals = this.queue.slice(0, MAX_BATCH_INTERVALS);
    if (intervals.length === 0 && position === undefined) return;
    const batch: WatchBatch = {
      intervals,
      ...(position !== undefined && { position: round(position) }),
    };
    this.clearRetry();
    this.inflight = this.options.transport
      .send(this.options.url, batch)
      .then(
        (progress) => {
          this.queue.splice(0, intervals.length);
          this.failures = 0;
          this.options.onProgress?.(progress);
        },
        (error: unknown) => {
          if (isFatal(error)) {
            this.stopped = true;
            this.options.onFatal?.(
              error instanceof Error ? error.message : 'Просмотр больше не засчитывается.',
            );
          } else if (isApiError(error) && error.status >= 400 && error.status < 500) {
            // The server refuses this batch for good (e.g. invalid): do not loop on it.
            this.queue.splice(0, intervals.length);
          } else {
            // Network or server trouble: keep the queue and try again a bit later.
            this.failures += 1;
            const delay = Math.min(MAX_RETRY_MS, 1000 * 2 ** this.failures);
            this.retry = this.timers.setTimeout(() => {
              this.retry = null;
              void this.flush();
            }, delay);
          }
        },
      )
      .finally(() => {
        this.inflight = null;
      });
    await this.inflight;
  }

  /** The page is going away: deliver everything without waiting for an answer. */
  beacon(position?: number): void {
    this.close();
    if (this.stopped) return;
    const intervals = this.queue.splice(0, MAX_BATCH_INTERVALS);
    if (intervals.length === 0 && position === undefined) return;
    this.options.transport.beacon(this.options.url, {
      intervals,
      ...(position !== undefined && { position: round(position) }),
    });
  }

  dispose(): void {
    this.clearRetry();
  }

  private clearRetry(): void {
    if (this.retry !== null) {
      this.timers.clearTimeout(this.retry);
      this.retry = null;
    }
  }
}

export interface WatchTrackingOptions {
  readonly taskId: number;
  /** The open watching session; null = not started (nothing is tracked). */
  readonly sessionId: number | null;
  readonly video: HTMLVideoElement | null;
  /** `help` — a hint fragment: reported, never credited. */
  readonly kind?: IntervalKind;
  readonly onProgress?: (progress: WatchProgressDto) => void;
  readonly batchMs?: number;
  readonly transport?: WatchTransport;
}

export interface WatchTracking {
  /** When the server last accepted a batch (the resume point is saved). */
  readonly savedAt: number | null;
  /** This session cannot report any more (opened in another tab, video replaced…). */
  readonly error: string | null;
}

export function useWatchTracking({
  taskId,
  sessionId,
  video,
  kind = 'main',
  onProgress,
  batchMs = BATCH_MS,
  transport = browserTransport,
}: WatchTrackingOptions): WatchTracking {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const progressRef = useRef(onProgress);
  useEffect(() => {
    progressRef.current = onProgress;
  });

  useEffect(() => {
    if (!video || sessionId === null) return;
    const tracker = new WatchTracker({
      url: `/api/watch/${taskId}/sessions/${sessionId}/intervals`,
      kind,
      transport,
      onProgress: (progress) => {
        setSavedAt(Date.now());
        progressRef.current?.(progress);
      },
      onFatal: setError,
    });
    const playing = () => !video.paused && !video.seeking && !video.ended;
    // The resume point is remembered while the video has data: when the player goes away its
    // element is reset to 0, and that must not overwrite the saved place.
    // A hint fragment never moves the lesson's resume point.
    let position: number | undefined;
    const remember = () => {
      if (kind === 'main' && video.readyState > 0) position = video.currentTime;
      return position;
    };
    const onTime = () => {
      remember();
      if (playing() && video.readyState > 0) tracker.tick(video.currentTime);
    };
    const onStop = () => {
      tracker.close();
      void tracker.flush(remember());
    };
    const onBreak = () => tracker.close();
    const onLeave = () => tracker.beacon(remember());
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onLeave();
    };
    video.addEventListener('playing', onTime);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('seeked', remember);
    video.addEventListener('pause', onStop);
    video.addEventListener('ended', onStop);
    video.addEventListener('seeking', onBreak);
    video.addEventListener('waiting', onBreak);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onLeave);
    const timer = setInterval(() => {
      if (playing()) {
        tracker.cut();
        void tracker.flush(remember());
      } else {
        void tracker.flush();
      }
    }, batchMs);
    return () => {
      video.removeEventListener('playing', onTime);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('seeked', remember);
      video.removeEventListener('pause', onStop);
      video.removeEventListener('ended', onStop);
      video.removeEventListener('seeking', onBreak);
      video.removeEventListener('waiting', onBreak);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onLeave);
      clearInterval(timer);
      tracker.close();
      void tracker.flush(position).finally(() => tracker.dispose());
    };
  }, [video, sessionId, taskId, kind, batchMs, transport]);

  return { savedAt, error };
}
