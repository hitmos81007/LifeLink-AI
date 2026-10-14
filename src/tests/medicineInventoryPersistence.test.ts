import { afterEach, describe, expect, it, vi } from 'vitest';

const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }));
vi.mock('../lib/supabase/client', () => ({ supabase: { rpc: rpcMock, from: fromMock } }));

import { addMedicineItem, updateMedicineItem } from '../services/hospitalService';

const item = {
  hospital_id: 'hospital-1',
  medicine_name: 'Synthetic saline pack',
  category: 'IV Fluid' as const,
  dosage: 'Demo only',
  manufacturer: null,
  current_stock: 20,
  minimum_stock: 4,
  unit: 'packs',
  expiry_date: '2027-01-01'
};

describe('medicine inventory persistence', () => {
  afterEach(() => vi.clearAllMocks());

  it('creates medicine through the authorised database workflow', async () => {
    const saved = { ...item, medicine_inventory_id: 'medicine-1', reserved_stock: 0 };
    rpcMock.mockResolvedValue({ data: saved, error: null });

    await expect(addMedicineItem(item)).resolves.toEqual(saved);
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith('save_medicine_inventory', expect.objectContaining({
      p_hospital_id: 'hospital-1',
      p_medicine_name: item.medicine_name,
      p_current_stock: 20,
      p_medicine_inventory_id: null,
      p_expected_updated_at: null
    }));
  });

  it('updates with the loaded version and leaves reserved stock to the transfer workflow', async () => {
    const version = '2026-10-10T12:30:00.000Z';
    rpcMock.mockResolvedValue({ data: { ...item, medicine_inventory_id: 'medicine-1', reserved_stock: 3 }, error: null });

    await expect(updateMedicineItem('medicine-1', item, version)).resolves.toMatchObject({ reserved_stock: 3 });
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith('save_medicine_inventory', expect.objectContaining({
      p_hospital_id: null,
      p_medicine_inventory_id: 'medicine-1',
      p_expected_updated_at: version
    }));
  });

  it('asks for a refresh when another update wins the version race', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '40001', message: 'stale version' } });
    await expect(updateMedicineItem('medicine-1', item, '2026-10-10T12:30:00Z'))
      .rejects.toThrow('Medicine inventory changed since it was loaded. Refresh the dashboard and reapply your update.');
  });

  it('rejects fractional stock before calling Supabase', async () => {
    await expect(addMedicineItem({ ...item, current_stock: 2.5 }))
      .rejects.toThrow('Medicine stock values must be non-negative whole numbers.');
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
