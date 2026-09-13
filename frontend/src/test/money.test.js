import { describe, it, expect } from 'vitest';
import { formatMoney, formatRupees, formatRupeesShort, formatPeriod, formatDay } from '../lib/money';

describe('money formatting', () => {
  it('groups rupees the Indian way', () => {
    expect(formatRupees(100000)).toBe('₹1,00,000.00');
    expect(formatRupees(12345678.5)).toBe('₹1,23,45,678.50');
  });

  it('drops the paise in headline figures', () => {
    expect(formatRupeesShort(1234567.8)).toBe('₹12,34,568');
  });

  it('treats a missing amount as zero', () => {
    expect(formatMoney(null)).toBe('0.00');
    expect(formatMoney(undefined)).toBe('0.00');
  });

  it('names a billing month', () => {
    expect(formatPeriod('2026-09')).toBe('September 2026');
    expect(formatPeriod('2026-09-01')).toBe('September 2026');
    expect(formatPeriod('')).toBe('');
  });

  it('keeps the calendar day a date string names, whatever the timezone', () => {
    expect(formatDay('2026-09-10')).toMatch(/^10 Sep/);
    expect(formatDay('2026-09-10T23:30:00.000Z')).toMatch(/^10 Sep/);
    expect(formatDay(null)).toBe('');
  });
});
