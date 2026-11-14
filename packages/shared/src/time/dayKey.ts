/**
 * Calendar day of an instant in the installation's time zone. This is the only way to
 * decide which "day" something belongs to (streaks, daily limits, daily chores).
 */

export interface LocalDate {
  readonly year: number;
  /** 1–12 */
  readonly month: number;
  /** 1–31 */
  readonly day: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    // Throws RangeError for an unknown time zone.
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function toMillis(ts: number | Date): number {
  const ms = typeof ts === 'number' ? ts : ts.getTime();
  if (!Number.isFinite(ms)) {
    throw new RangeError('Invalid timestamp');
  }
  return ms;
}

/** Year, month and day of `ts` as seen on a wall clock in `timeZone`. */
export function localDate(ts: number | Date, timeZone: string): LocalDate {
  const parts = formatterFor(timeZone).formatToParts(toMillis(ts));
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day') };
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD` of `ts` in `timeZone`, e.g. `dayKey(Date.now(), 'Europe/Kaliningrad')`. */
export function dayKey(ts: number | Date, timeZone: string): string {
  const { year, month, day } = localDate(ts, timeZone);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}
