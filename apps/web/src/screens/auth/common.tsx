// Shared pieces of the sign-in screens: brand, server errors → field messages, the throttling
// countdown and where to go after a login.
import type { UserRole } from '@questclass/shared/auth/schemas';
import { Brand } from '@questclass/ui';
import { useEffect, useState } from 'react';
import { isApiError } from '../../api/client';
import { HOME_BY_ROLE, type LoginRedirectState } from '../../app/guards';
import { LOGO_URL } from '../../features/tasks/assets';

export function AuthBrand() {
  return <Brand logo={LOGO_URL} />;
}

/** `{ field: message }` from a 400 answer (`details: [{ path, message }]`). */
export function fieldErrorsOf(error: unknown): Record<string, string> {
  if (!isApiError(error) || !Array.isArray(error.details)) return {};
  const result: Record<string, string> = {};
  for (const item of error.details as { path?: unknown; message?: unknown }[]) {
    if (typeof item.path === 'string' && typeof item.message === 'string' && !result[item.path]) {
      result[item.path] = item.message;
    }
  }
  return result;
}

/** «15 с» or «2:05». */
export function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} с`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Seconds left before the next login attempt after a 429 (`Retry-After`), ticking down.
 * `start(error)` returns true when the error was a throttle.
 */
export function useRetryCountdown() {
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) setUntil(null);
    }, 250);
    return () => clearInterval(timer);
  }, [until]);
  const left = until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
  return {
    left,
    active: left > 0,
    start(error: unknown): boolean {
      if (!isApiError(error) || error.status !== 429) return false;
      const seconds = error.retryAfterSec ?? 1;
      const current = Date.now();
      setNow(current);
      setUntil(current + seconds * 1000);
      return true;
    },
  };
}

/** After a login: back to the page that asked for it, if it belongs to this role. */
export function afterLoginPath(role: UserRole, state: unknown): string {
  const from = (state as LoginRedirectState | null)?.from;
  const home = HOME_BY_ROLE[role];
  if (!from || from.startsWith('/login') || from.startsWith('/setup')) return home;
  const adminPath = from === '/admin' || from.startsWith('/admin/');
  return (role === 'admin') === adminPath ? from : home;
}
