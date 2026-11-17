import { describe, it, expect } from 'vitest';
import { usHolidays, holidaysBetween, easterSunday } from '../../utils/holidays';

const on = (year: number, name: string) => usHolidays(year).find(h => h.name === name)?.date;

describe('usHolidays', () => {
  it('puts the fixed-date holidays on their dates', () => {
    expect(on(2026, 'New Year’s Day')).toBe('2026-01-01');
    expect(on(2026, 'Juneteenth')).toBe('2026-06-19');
    expect(on(2026, 'Independence Day')).toBe('2026-07-04');
    expect(on(2026, 'Veterans Day')).toBe('2026-11-11');
    expect(on(2026, 'Christmas Day')).toBe('2026-12-25');
  });

  it('works out the floating holidays (2026)', () => {
    expect(on(2026, 'Martin Luther King Jr. Day')).toBe('2026-01-19');
    expect(on(2026, 'Presidents’ Day')).toBe('2026-02-16');
    expect(on(2026, 'Mother’s Day')).toBe('2026-05-10');
    expect(on(2026, 'Memorial Day')).toBe('2026-05-25');
    expect(on(2026, 'Father’s Day')).toBe('2026-06-21');
    expect(on(2026, 'Labor Day')).toBe('2026-09-07');
    expect(on(2026, 'Indigenous Peoples’ Day / Columbus Day')).toBe('2026-10-12');
    expect(on(2026, 'Thanksgiving')).toBe('2026-11-26');
  });

  it('works out the floating holidays in other years', () => {
    expect(on(2024, 'Memorial Day')).toBe('2024-05-27');
    expect(on(2024, 'Thanksgiving')).toBe('2024-11-28');
    expect(on(2025, 'Labor Day')).toBe('2025-09-01');
    expect(on(2027, 'Martin Luther King Jr. Day')).toBe('2027-01-18');
    expect(on(2023, 'Thanksgiving')).toBe('2023-11-23');
  });

  it('finds Easter', () => {
    expect(easterSunday(2024)).toEqual([3, 31]);
    expect(easterSunday(2025)).toEqual([4, 20]);
    expect(easterSunday(2026)).toEqual([4, 5]);
    expect(easterSunday(2027)).toEqual([3, 28]);
  });

  it('lists them in date order', () => {
    const dates = usHolidays(2026).map(h => h.date);
    expect(dates).toEqual([...dates].sort());
  });
});

describe('holidaysBetween', () => {
  it('returns only the days in the range, across a year end', () => {
    const map = holidaysBetween('2026-12-20', '2027-01-05');
    expect([...map.keys()].sort()).toEqual(['2026-12-24', '2026-12-25', '2026-12-31', '2027-01-01']);
    expect(map.get('2027-01-01')?.[0].name).toBe('New Year’s Day');
  });

  it('is empty for a range with none', () => {
    expect(holidaysBetween('2026-08-01', '2026-08-31').size).toBe(0);
  });
});
