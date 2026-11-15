/**
 * Pure arithmetic of played intervals: clipping to the video, capping by real time, merging into
 * disjoint spans. Seconds are kept to the millisecond.
 */

/** `[start, end]` in seconds, `start <= end`. */
export type Span = readonly [number, number];

const round = (value: number): number => Math.round(value * 1000) / 1000;

/** Spans inside `[0, duration]`; empty ones are dropped. Order is kept. */
export function clipToDuration(spans: readonly Span[], duration: number): Span[] {
  const out: Span[] = [];
  for (const [start, end] of spans) {
    const s = Math.max(0, start);
    const e = Math.min(end, duration);
    if (e > s) {
      out.push([round(s), round(e)]);
    }
  }
  return out;
}

/**
 * Keeps at most `budget` seconds of playback, in the order reported: a batch cannot claim more
 * than could really have been played since the previous one.
 */
export function capToBudget(spans: readonly Span[], budget: number): Span[] {
  const out: Span[] = [];
  let left = Math.max(0, budget);
  for (const [start, end] of spans) {
    if (left <= 0) {
      break;
    }
    const length = end - start;
    if (length <= left) {
      out.push([start, end]);
      left -= length;
    } else {
      out.push([start, round(start + left)]);
      left = 0;
    }
  }
  return out;
}

/** Sorted, disjoint spans (overlapping and touching ones are joined). */
export function mergeSpans(spans: readonly Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = out.at(-1);
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      out.push([start, end]);
    }
  }
  return out;
}

export function totalLength(spans: readonly Span[]): number {
  return round(spans.reduce((sum, [start, end]) => sum + (end - start), 0));
}

/** floor(watched / duration · 100), 0–100. */
export function percentOf(watched: number, duration: number): number {
  if (duration <= 0) {
    return 0;
  }
  return Math.min(100, Math.floor((watched / duration) * 100 + 1e-9));
}
