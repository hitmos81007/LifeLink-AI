import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, rpcMock, response, builder } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  response: { value: {} as unknown },
  builder: { value: {} as Record<string, any> }
}));
vi.mock('../lib/supabase/client', () => ({ supabase: { from: fromMock, rpc: rpcMock } }));

import { saveBloodInventoryItem } from '../services/bloodService';

function makeBuilder() {
  const query: Record<string, any> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn(() => Promise.resolve(response.value));
  builder.value = query;
  return query;
}

const validInventory = {
  blood_bank_id: 'bank-1', blood_group: 'O-', available_units: 20,
  reserved_units: 2, expired_units: 1, minimum_threshold: 5
} as const;

describe('blood inventory saves', () => {
  beforeEach(() => {
    response.value = { data: { inventory_id: 'inventory-1', ...validInventory, updated_at: '2026-10-10T10:00:00' }, error: null };
    fromMock.mockImplementation(() => makeBuilder());
    rpcMock.mockResolvedValue({ data: { inventory_id: 'inventory-1', ...validInventory }, error: null });
  });
  afterEach(() => vi.clearAllMocks());

  it('uses the transactional RPC for a new blood group', async () => {
    await expect(saveBloodInventoryItem(validInventory)).resolves.toMatchObject({
      inventory_id: 'inventory-1', blood_group: 'O-', available_units: 20
    });
    expect(rpcMock).toHaveBeenCalledWith('save_blood_inventory', expect.objectContaining({
      p_blood_bank_id: 'bank-1', p_blood_group: 'O-', p_available_units: 20,
      p_inventory_id: null, p_expected_updated_at: null
    }));
  });

  it('reports a database conflict or validation failure without claiming the stock was saved', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'inventory changed' } });
    await expect(saveBloodInventoryItem(validInventory)).rejects.toThrow('Failed to save blood inventory: inventory changed');
    await expect(saveBloodInventoryItem({ ...validInventory, reserved_units: 20, expired_units: 1 }))
      .rejects.toThrow('Reserved and expired units together cannot exceed on-hand units.');
  });

  it('sends an inventory id with its version for optimistic updates', async () => {
    await saveBloodInventoryItem({
      ...validInventory, inventory_id: 'inventory-1', expected_updated_at: '2026-10-10T10:00:00'
    });
    expect(rpcMock).toHaveBeenCalledWith('save_blood_inventory', expect.objectContaining({
      p_inventory_id: 'inventory-1', p_expected_updated_at: '2026-10-10T10:00:00'
    }));
  });
});
