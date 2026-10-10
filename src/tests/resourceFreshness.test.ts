import { describe, expect, it } from 'vitest';
import { getResourceFreshness } from '../services/resourceFreshness';

describe('resource freshness classification', () => {
  const now = Date.parse('2026-10-07T12:00:00.000Z');

  it('marks missing, invalid, and future timestamps unknown', () => {
    expect(getResourceFreshness(null, 'blood', now)).toBe('Unknown');
    expect(getResourceFreshness('not-a-date', 'blood', now)).toBe('Unknown');
    expect(getResourceFreshness('2026-10-07T12:00:01.000Z', 'blood', now)).toBe('Unknown');
  });

  it('uses the shorter freshness window for beds and ambulance capacity', () => {
    const timestamp = '2026-10-07T11:40:00.000Z';
    expect(getResourceFreshness(timestamp, 'icu', now)).toBe('Stale');
    expect(getResourceFreshness(timestamp, 'ambulance', now)).toBe('Stale');
    expect(getResourceFreshness(timestamp, 'blood', now)).toBe('Fresh');
  });

  it('marks records stale only after the category freshness window', () => {
    expect(getResourceFreshness('2026-10-07T11:45:00.000Z', 'icu', now)).toBe('Fresh');
    expect(getResourceFreshness('2026-10-07T10:59:00.000Z', 'medicine', now)).toBe('Stale');
  });
});
