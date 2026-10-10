import { afterEach, describe, expect, it, vi } from 'vitest';

const { fromMock, rpcMock } = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));
vi.mock('../lib/supabase/client', () => ({ supabase: { from: fromMock, rpc: rpcMock } }));

import { saveGeneralBedInventory, updateICUInventory } from '../services/hospitalService';

describe('hospital bed inventory input validation', () => {
  afterEach(() => vi.clearAllMocks());

  it.each([
    [Number.NaN, 12, 2],
    [Infinity, 12, 2],
    [2.5, 12, 2]
  ])('rejects invalid ICU counts before reaching Supabase', async (available, total, minimum) => {
    await expect(updateICUInventory('hospital-1', available, total, minimum))
      .rejects.toThrow('non-negative whole numbers');
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it.each([
    { total_beds: 20, occupied_beds: 2, reserved_beds: 1, available_beds: 17.5, minimum_beds: 2 },
    { total_beds: 20, occupied_beds: 2, reserved_beds: 1, available_beds: 17, minimum_beds: Number.NaN },
    { total_beds: Infinity, occupied_beds: 2, reserved_beds: 1, available_beds: 17, minimum_beds: 2 }
  ])('rejects invalid general-bed counts before reaching Supabase', async (inventory) => {
    await expect(saveGeneralBedInventory({ hospital_id: 'hospital-1', ...inventory }))
      .rejects.toThrow('non-negative whole numbers');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('stores available beds when creating the first inventory row', async () => {
    const insertedRow = {
      bed_inventory_id: 'bed-row-1',
      hospital_id: 'hospital-1',
      total_beds: 20,
      occupied_beds: 3,
      reserved_beds: 0,
      available_beds: 17,
      minimum_beds: 2
    };
    rpcMock.mockResolvedValue({ data: insertedRow, error: null });

    await expect(saveGeneralBedInventory({
      hospital_id: 'hospital-1',
      total_beds: 20,
      occupied_beds: 3,
      reserved_beds: 0,
      available_beds: 17,
      minimum_beds: 2,
      expected_updated_at: null
    })).resolves.toEqual(insertedRow);

    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith('update_general_bed_inventory', {
      p_hospital_id: 'hospital-1',
      p_total_beds: 20,
      p_occupied_beds: 3,
      p_minimum_beds: 2,
      p_expected_updated_at: null,
      p_reason_code: null
    });
  });

  it('requires a refresh when another user changed the inventory version', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '40001', message: 'Inventory conflict' } });

    await expect(saveGeneralBedInventory({
      hospital_id: 'hospital-1',
      total_beds: 20,
      occupied_beds: 3,
      reserved_beds: 0,
      available_beds: 17,
      minimum_beds: 2,
      expected_updated_at: '2026-10-09T12:00:00'
    })).rejects.toThrow('General-bed inventory changed since it was loaded. Refresh the dashboard and reapply your update.');
  });

  it('saves ICU availability through the versioned database operation', async () => {
    const savedRow = {
      icu_inventory_id: 'icu-row-1',
      hospital_id: 'hospital-1',
      total_icu_beds: 12,
      occupied_icu_beds: 6,
      reserved_icu_beds: 2,
      available_icu_beds: 4,
      minimum_icu_beds: 1
    };
    rpcMock.mockResolvedValue({ data: savedRow, error: null });

    await expect(updateICUInventory('hospital-1', 4, 12, 1, '2026-10-09T12:00:00Z')).resolves.toEqual(savedRow);
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith('update_icu_inventory', {
      p_hospital_id: 'hospital-1',
      p_total_icu_beds: 12,
      p_available_icu_beds: 4,
      p_minimum_icu_beds: 1,
      p_expected_updated_at: '2026-10-09T12:00:00Z'
    });
  });
});
