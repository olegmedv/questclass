import { localDate } from './dayKey';

const DAY_MS = 86_400_000;

/**
 * ISO-8601 week of `ts` in `timeZone` as `YYYY-Www` (weeks start on Monday; the week
 * belongs to the year of its Thursday, so 1 January may fall into week 52/53).
 */
export function weekKey(ts: number | Date, timeZone: string): string {
  const { year, month, day } = localDate(ts, timeZone);
  // Pure calendar arithmetic on the local date, done in UTC to avoid DST effects.
  const date = Date.UTC(year, month - 1, day);
  const mondayBased = (new Date(date).getUTCDay() + 6) % 7;
  const thursday = date + (3 - mondayBased) * DAY_MS;
  const isoYear = new Date(thursday).getUTCFullYear();
  const week = 1 + Math.floor((thursday - Date.UTC(isoYear, 0, 1)) / DAY_MS / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}
