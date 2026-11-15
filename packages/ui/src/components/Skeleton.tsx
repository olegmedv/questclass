import './Skeleton.css';

export interface SkeletonProps {
  /** Number of text lines (the last one is shorter). */
  readonly lines?: number;
  /** A block of a given aspect ratio (e.g. "1 / 1") instead of lines. */
  readonly ratio?: string;
}

/** Grey placeholder shapes while content loads; hidden from screen readers. */
export function Skeleton({ lines = 1, ratio }: SkeletonProps) {
  if (ratio) {
    return (
      <span
        className="qc-skeleton qc-skeleton-block"
        style={{ aspectRatio: ratio }}
        aria-hidden="true"
      />
    );
  }
  return (
    <span className="qc-skeleton-lines" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="qc-skeleton" data-last={i === lines - 1 && lines > 1} />
      ))}
    </span>
  );
}
