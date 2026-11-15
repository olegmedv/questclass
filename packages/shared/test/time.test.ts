import { describe, expect, it } from 'vitest';
import { dayKey, localDate } from '../src/time/dayKey';
import { weekKey } from '../src/time/weekKey';

const KGD = 'Europe/Kaliningrad'; // UTC+2 all year

describe('dayKey', () => {
  it('switches the day at local midnight in Kaliningrad, not at UTC midnight', () => {
    // 23:59:59.999 local on 14 Nov = 21:59:59.999 UTC
    expect(dayKey(Date.parse('2026-11-14T21:59:59.999Z'), KGD)).toBe('2026-11-14');
    // 00:00 local on 15 Nov = 22:00 UTC on 14 Nov
    expect(dayKey(Date.parse('2026-11-14T22:00:00.000Z'), KGD)).toBe('2026-11-15');
    // Between 22:00 and 24:00 UTC the UTC date still says the 14th
    expect(dayKey(Date.parse('2026-11-14T23:30:00.000Z'), 'UTC')).toBe('2026-11-14');
    expect(dayKey(Date.parse('2026-11-14T23:30:00.000Z'), KGD)).toBe('2026-11-15');
  });

  it('handles month and year boundaries', () => {
    expect(dayKey(Date.parse('2026-12-31T21:59:59.000Z'), KGD)).toBe('2026-12-31');
    expect(dayKey(Date.parse('2026-12-31T22:00:00.000Z'), KGD)).toBe('2027-01-01');
    expect(dayKey(Date.parse('2027-02-28T22:00:00.000Z'), KGD)).toBe('2027-03-01');
  });

  it('accepts Date objects and zero-pads', () => {
    expect(dayKey(new Date('2026-03-04T10:00:00Z'), KGD)).toBe('2026-03-04');
    expect(localDate(new Date('2026-03-04T10:00:00Z'), KGD)).toEqual({
      year: 2026,
      month: 3,
      day: 4,
    });
  });

  it('follows DST in zones that have it', () => {
    // Berlin switches to UTC+2 on 29 Mar 2026: 22:30 UTC is already the next day.
    expect(dayKey(Date.parse('2026-03-28T22:30:00Z'), 'Europe/Berlin')).toBe('2026-03-28');
    expect(dayKey(Date.parse('2026-03-29T22:30:00Z'), 'Europe/Berlin')).toBe('2026-03-30');
  });

  it('rejects invalid input', () => {
    expect(() => dayKey(Number.NaN, KGD)).toThrow(RangeError);
    expect(() => dayKey(Date.now(), 'Mars/Olympus')).toThrow(RangeError);
  });
});

describe('weekKey', () => {
  it('starts the week on Monday at local midnight in Kaliningrad', () => {
    // Sunday 15 Nov 2026, 23:59:59 local
    expect(weekKey(Date.parse('2026-11-15T21:59:59.999Z'), KGD)).toBe('2026-W46');
    // Monday 16 Nov 2026, 00:00 local
    expect(weekKey(Date.parse('2026-11-15T22:00:00.000Z'), KGD)).toBe('2026-W47');
    // Monday 9 Nov 2026, 00:00 local is the first instant of week 46
    expect(weekKey(Date.parse('2026-11-08T22:00:00.000Z'), KGD)).toBe('2026-W46');
    expect(weekKey(Date.parse('2026-11-08T21:59:59.999Z'), KGD)).toBe('2026-W45');
  });

  it('uses the local date, not the UTC date', () => {
    const sundayNightUtc = Date.parse('2026-11-15T23:00:00Z'); // Monday 01:00 in Kaliningrad
    expect(weekKey(sundayNightUtc, 'UTC')).toBe('2026-W46');
    expect(weekKey(sundayNightUtc, KGD)).toBe('2026-W47');
  });

  it('assigns days around New Year to the ISO year of their Thursday', () => {
    // 2026 starts on a Thursday, so it has 53 ISO weeks.
    expect(weekKey(Date.parse('2026-01-01T10:00:00Z'), KGD)).toBe('2026-W01');
    expect(weekKey(Date.parse('2025-12-29T10:00:00Z'), KGD)).toBe('2026-W01');
    expect(weekKey(Date.parse('2025-12-28T10:00:00Z'), KGD)).toBe('2025-W52');
    expect(weekKey(Date.parse('2026-12-31T10:00:00Z'), KGD)).toBe('2026-W53');
    expect(weekKey(Date.parse('2027-01-03T10:00:00Z'), KGD)).toBe('2026-W53');
    expect(weekKey(Date.parse('2027-01-04T10:00:00Z'), KGD)).toBe('2027-W01');
  });

  it('gives all seven days of a week the same key', () => {
    const monday = Date.parse('2026-11-08T22:00:00.000Z');
    const keys = Array.from({ length: 7 }, (_, i) => weekKey(monday + i * 86_400_000 + 1, KGD));
    expect(new Set(keys)).toEqual(new Set(['2026-W46']));
  });
});
