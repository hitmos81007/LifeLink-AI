import { BloodInventoryTable } from '../types/database';

type BloodStockCounts = Pick<BloodInventoryTable, 'available_units' | 'reserved_units' | 'expired_units'>;

/** available_units is the on-hand count; only unreserved, unexpired units are usable. */
export function getUsableBloodUnits(stock: BloodStockCounts): number {
  return Math.max(0, stock.available_units - stock.reserved_units - stock.expired_units);
}

export function validateBloodStockCounts(stock: BloodStockCounts): void {
  for (const [field, value] of Object.entries({
    available_units: stock.available_units,
    reserved_units: stock.reserved_units,
    expired_units: stock.expired_units
  })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${field} must be a non-negative whole number.`);
    }
  }

  if (stock.reserved_units + stock.expired_units > stock.available_units) {
    throw new Error('Reserved and expired units together cannot exceed on-hand units.');
  }
}
