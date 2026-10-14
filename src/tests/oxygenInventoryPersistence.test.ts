import { afterEach, describe, expect, it, vi } from 'vitest';

const { fromMock, selectMock, eqMock, maybeSingleMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  rpcMock: vi.fn()
}));
vi.mock('../lib/supabase/client', () => ({ supabase: { from: fromMock, rpc: rpcMock } }));

import { addOxygenInventoryItem, updateOxygenInventoryItem } from '../services/hospitalService';

const item = {
  hospital_id: 'hospital-1',
  oxygen_type: 'Cylinder' as const,
  total_capacity: 20,
  available_capacity: 14,
  minimum_threshold: 3,
  unit: 'cylinders'
};

describe('oxygen inventory persistence', () => {
  afterEach(() => vi.clearAllMocks());

  it('creates oxygen inventory through the audited Supabase RPC', async () => {
    fromMock.mockReturnValue({ select: selectMock });
    selectMock.mockReturnValue({ eq: eqMock });
    eqMock.mockReturnValue({ eq: eqMock, maybeSingle: maybeSingleMock });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    rpcMock.mockResolvedValue({ data: { ...item, oxygen_inventory_id: 'oxygen-1' }, error: null });

    await expect(addOxygenInventoryItem(item)).resolves.toMatchObject({ oxygen_inventory_id: 'oxygen-1' });
    expect(rpcMock).toHaveBeenCalledWith('save_oxygen_inventory', expect.objectContaining({
      p_hospital_id: 'hospital-1',
      p_oxygen_inventory_id: null,
      p_expected_updated_at: null,
      p_available_capacity: 14
    }));
  });

  it('updates a specific oxygen row with its timestamp version', async () => {
    rpcMock.mockResolvedValue({ data: { ...item, oxygen_inventory_id: 'oxygen-1' }, error: null });
    const version = '2026-10-10T12:30:00.000Z';

    await expect(updateOxygenInventoryItem('oxygen-1', item, version))
      .resolves.toMatchObject({ oxygen_inventory_id: 'oxygen-1' });
    expect(rpcMock).toHaveBeenCalledWith('save_oxygen_inventory', expect.objectContaining({
      p_hospital_id: null,
      p_oxygen_inventory_id: 'oxygen-1',
      p_expected_updated_at: version
    }));
  });

  it('asks the user to refresh on an optimistic concurrency conflict', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '40001', message: 'version conflict' } });
    await expect(updateOxygenInventoryItem('oxygen-1', item, '2026-10-10T12:30:00Z'))
      .rejects.toThrow('Oxygen inventory changed since it was loaded. Refresh and reapply your update.');
  });

  it('rejects a minimum threshold above capacity before writing', async () => {
    await expect(addOxygenInventoryItem({ ...item, minimum_threshold: 21 }))
      .rejects.toThrow('Minimum oxygen threshold cannot exceed total capacity.');
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
