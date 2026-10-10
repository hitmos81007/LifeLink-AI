import { describe, expect, it } from 'vitest';
import type { MedicineInventoryTable, OxygenInventoryTable } from '../types/database';
import {
  areTransferInventoryItemsCompatible,
  buildMedicineTransferOptions,
  buildOxygenTransferOptions,
  canSourceHospitalReviewTransfer,
  isMedicineExpiryTransferable
} from '../services/resourceTransferCompatibility';

describe('transfer inventory identity compatibility', () => {
  it('allows only the source hospital approver to review a pending transfer', () => {
    const pending = { source_hospital_id: 'source', status: 'Pending' as const };
    expect(canSourceHospitalReviewTransfer(pending, 'source')).toBe(true);
    expect(canSourceHospitalReviewTransfer(pending, 'destination')).toBe(false);
    expect(canSourceHospitalReviewTransfer(pending, null)).toBe(false);
    expect(canSourceHospitalReviewTransfer({ ...pending, status: 'Approved' }, 'source')).toBe(false);
  });

  it('allows oxygen only when source and destination units match', () => {
    expect(areTransferInventoryItemsCompatible('Oxygen', { name: 'Cylinder', unit: 'cylinders' }, { name: 'Cylinder', unit: 'cylinders' })).toBe(true);
    expect(areTransferInventoryItemsCompatible('Oxygen', { name: 'Cylinder', unit: 'cylinders' }, { name: 'Cylinder', unit: 'litres' })).toBe(false);
  });

  it('requires medicine formulation, manufacturer, unit, and expiry to match', () => {
    const source = { name: 'Example medicine', category: 'Analgesic', dosage: '500 mg', manufacturer: 'Maker A', unit: 'tablets', expiry_date: '2027-12-31' };
    expect(areTransferInventoryItemsCompatible('Medicine', source, { ...source })).toBe(true);
    expect(areTransferInventoryItemsCompatible('Medicine', source, { ...source, dosage: '250 mg' })).toBe(false);
    expect(areTransferInventoryItemsCompatible('Medicine', source, { ...source, expiry_date: '2028-12-31' })).toBe(false);
  });

  it('allows medicines through their recorded expiry day and blocks older or malformed dates', () => {
    expect(isMedicineExpiryTransferable('2026-10-07', '2026-10-07')).toBe(true);
    expect(isMedicineExpiryTransferable('2026-10-08', '2026-10-07')).toBe(true);
    expect(isMedicineExpiryTransferable('2026-10-06', '2026-10-07')).toBe(false);
    expect(isMedicineExpiryTransferable(null, '2026-10-07')).toBe(true);
    expect(isMedicineExpiryTransferable('2026-02-30', '2026-02-01')).toBe(false);
  });

  it('offers each compatible medicine formulation by exact identity and excludes expired or duplicate rows', () => {
    const medicine = (id: string, dosage: string, expiry: string | null = '2028-12-31') => ({
      medicine_inventory_id: id, hospital_id: 'hospital', medicine_name: 'Synthetic medicine',
      category: 'Antibiotic', dosage, manufacturer: 'Example Labs', current_stock: 30,
      minimum_stock: 5, unit: 'tablets', expiry_date: expiry, created_at: '', updated_at: ''
    } as MedicineInventoryTable);
    const source = [medicine('s-250', '250 mg'), medicine('s-500', '500 mg'), medicine('s-expired', '1 g', '2025-01-01')];
    const destination = [medicine('d-250', '250 mg'), medicine('d-500', '500 mg'), medicine('d-expired', '1 g', '2025-01-01')];

    const options = buildMedicineTransferOptions(source, destination, '2026-10-07');
    expect(options).toHaveLength(2);
    expect(options.map((option) => option.label)).toEqual([
      'Synthetic medicine · 250 mg · Example Labs · expires 2028-12-31',
      'Synthetic medicine · 500 mg · Example Labs · expires 2028-12-31'
    ]);
    expect(options[0].identity).toMatchObject({ resource_type: 'Medicine', dosage: '250 mg', expiry_date: '2028-12-31' });
    expect(options[0].transferable).toBe(25);
  });

  it('offers oxygen with distinct matching units and rejects duplicate exact rows', () => {
    const oxygen = (id: string, unit: string) => ({
      oxygen_inventory_id: id, hospital_id: 'hospital', oxygen_type: 'Cylinder',
      total_capacity: 80, available_capacity: 50, minimum_threshold: 10,
      unit, created_at: '', updated_at: ''
    } as OxygenInventoryTable);
    const source = [oxygen('s-cylinders', 'cylinders'), oxygen('s-litres', 'litres'), oxygen('s-duplicate', 'cylinders')];
    const destination = [oxygen('d-cylinders', 'cylinders'), oxygen('d-litres', 'litres')];

    const options = buildOxygenTransferOptions(source, destination);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ label: 'Cylinder · litres', transferable: 40, identity: { unit: 'litres' } });
  });
});
