// Small helpers shared by the admin screens: validation messages, server errors, request ids,
// dates.
import { isApiError } from '../../api/client';

interface Issue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

/** The first message per top-level field of a failed `safeParse` (`''` = the whole form). */
export function issuesByField(issues: readonly Issue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : '';
    out[key] ??= issue.message;
  }
  return out;
}

/** Text of a failed call: the server's message plus its validation details, if any. */
export function errorText(error: unknown): string {
  if (isApiError(error)) {
    const details = Array.isArray(error.details)
      ? (error.details as { message?: unknown }[])
          .map((detail) => (typeof detail.message === 'string' ? detail.message : null))
          .filter((message): message is string => message !== null)
      : [];
    const unique = [...new Set(details)].filter((message) => message !== error.message);
    return unique.length > 0 ? `${error.message}: ${unique.join('; ')}` : error.message;
  }
  return error instanceof Error ? error.message : 'Неизвестная ошибка';
}

/** Id of one intent of the admin (a dialog opening): a retry of it is not applied twice. */
export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

const DATE_TIME = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
const DATE = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' });

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? DATE_TIME.format(new Date(iso)) : '—';
}

/** A calendar day `YYYY-MM-DD` (no time zone shift). */
export function formatDay(day: string | null | undefined): string {
  if (!day) return '—';
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  return DATE.format(new Date(y, m - 1, d));
}

/** Today in the browser as `YYYY-MM-DD`. */
export function todayKey(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
