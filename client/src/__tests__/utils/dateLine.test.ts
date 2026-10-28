import { describe, it, expect } from 'vitest';
import { shortDateLine, ordinal } from '@/utils/dateLine';

describe('the phone date line', () => {
  it('reads "Tues, Oct. 27th"', () => {
    expect(shortDateLine(new Date(2026, 9, 27))).toBe('Tues, Oct. 27th');
    expect(shortDateLine(new Date(2026, 5, 1))).toBe('Mon, June 1st');
    expect(shortDateLine(new Date(2026, 8, 3))).toBe('Thurs, Sept. 3rd');
  });
  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st']);
  });
});
