// Signals that stop animations: the tab is hidden, the hero left the screen, the device asks
// for reduced motion.
import { useEffect, useRef, type RefObject } from 'react';

/** Calls back with `document.hidden` now and on every change. */
export function watchPageHidden(onChange: (hidden: boolean) => void): () => void {
  const update = () => onChange(document.hidden);
  update();
  document.addEventListener('visibilitychange', update);
  return () => document.removeEventListener('visibilitychange', update);
}

/** Calls back with `prefers-reduced-motion: reduce` now and on every change. */
export function watchReducedMotion(onChange: (reduced: boolean) => void): () => void {
  if (typeof window.matchMedia !== 'function') {
    onChange(false);
    return () => {};
  }
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  const update = () => onChange(query.matches);
  update();
  query.addEventListener('change', update);
  return () => query.removeEventListener('change', update);
}

/**
 * Reports whether the element is on screen. Without IntersectionObserver (old browsers, tests)
 * the element counts as visible.
 */
export function useInViewport(
  ref: RefObject<Element | null>,
  onChange: (visible: boolean) => void,
): void {
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      callback.current(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) callback.current(entry.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
}
