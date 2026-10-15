import { describe, expect, it } from 'vitest';
import { getUsableBloodUnits, validateBloodStockCounts } from '../services/bloodInventoryUtils';

describe('blood inventory counts', () => {
  it('derives usable units after reserved and expired stock', () => {
    expect(getUsableBloodUnits({ available_units: 20, reserved_units: 4, expired_units: 3 })).toBe(13);
  });

  it('never reports negative usable stock', () => {
    expect(getUsableBloodUnits({ available_units: 4, reserved_units: 2, expired_units: 3 })).toBe(0);
  });

  it('accepts reserved and expired counts that fit within on-hand units', () => {
    expect(() => validateBloodStockCounts({ available_units: 9, reserved_units: 4, expired_units: 5 })).not.toThrow();
  });

  it('rejects allocations that exceed on-hand units', () => {
    expect(() => validateBloodStockCounts({ available_units: 9, reserved_units: 5, expired_units: 5 }))
      .toThrow('Reserved and expired units together cannot exceed on-hand units.');
  });
});
