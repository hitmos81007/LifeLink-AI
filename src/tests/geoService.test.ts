import { describe, expect, it } from 'vitest';
import { calculateHaversineDistance, isValidCoordinatePair } from '../services/geoService';

describe('geographic coordinate validation', () => {
  it('accepts valid coordinates including legal boundaries', () => {
    expect(isValidCoordinatePair(0, 0)).toBe(true);
    expect(isValidCoordinatePair(-90, -180)).toBe(true);
    expect(isValidCoordinatePair(90, 180)).toBe(true);
  });

  it('rejects missing, non-finite, and out-of-range coordinates', () => {
    for (const [lat, lng] of [
      [null, 0], [0, null], [Number.NaN, 0], [0, Number.POSITIVE_INFINITY],
      [-90.001, 0], [90.001, 0], [0, -180.001], [0, 180.001]
    ] as const) {
      expect(isValidCoordinatePair(lat, lng)).toBe(false);
    }
  });

  it('does not calculate a distance from invalid facility coordinates', () => {
    expect(calculateHaversineDistance(28.6, 77.2, 91, 77.3)).toBeNull();
    expect(calculateHaversineDistance(28.6, 77.2, 28.7, Number.NaN)).toBeNull();
  });

  it('returns straight-line distance for valid coordinates', () => {
    expect(calculateHaversineDistance(0, 0, 0, 1)).toBe(111.2);
    expect(calculateHaversineDistance(0, 0, 0, 180)).toBe(20015.1);
  });
});
