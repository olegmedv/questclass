import type { KeyboardEvent } from 'react';

/**
 * Arrow/Home/End navigation over a row of options (tabs, segmented controls): returns the index
 * of the next enabled option, or null when the key is not a navigation key.
 */
export function nextIndex(
  event: KeyboardEvent,
  current: number,
  disabled: readonly boolean[],
): number | null {
  const count = disabled.length;
  if (count === 0) return null;
  const step = (from: number, delta: number) => {
    for (let i = 1; i <= count; i += 1) {
      const candidate = (((from + delta * i) % count) + count) % count;
      if (!disabled[candidate]) return candidate;
    }
    return from;
  };
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return step(current, 1);
    case 'ArrowLeft':
    case 'ArrowUp':
      return step(current, -1);
    case 'Home':
      return step(-1, 1);
    case 'End':
      return step(count, -1);
    default:
      return null;
  }
}
