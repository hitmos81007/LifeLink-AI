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
  query.upsert = vi.fn(() => query);
  query.select = vi.fn(() => query);
  query.single = vi.fn(() => Promise.resolve(response.value));
  builder.value = query;
  return query;
}

const validInventory = {
  blood_bank_id: 'bank-1', blood_group: 'O-', available_units: 20,
  reserved_units: 2, expired_units: 1, minimum_threshold: 5
} as const;

describe('blood inventory saves', () => {
  beforeEach(() => {
    response.value = { data: { inventory_id: 'inventory-1', ...validInventory }, error: null };
    fromMock.mockImplementation(() => makeBuilder());
    rpcMock.mockResolvedValue({ data: 0, error: null });
  });
  afterEach(() => vi.clearAllMocks());

  it('uses a conflict-key upsert to keep one aggregate row per bank and blood group', async () => {
    await expect(saveBloodInventoryItem(validInventory)).resolves.toMatchObject({
      inventory_id: 'inventory-1', blood_group: 'O-', available_units: 20
    });
    expect(builder.value.upsert).toHaveBeenCalledWith(expect.objectContaining({
      blood_bank_id: 'bank-1', blood_group: 'O-', available_units: 20
    }), { onConflict: 'blood_bank_id,blood_group' });
    expect(builder.value.select).toHaveBeenCalledOnce();
    expect(builder.value.single).toHaveBeenCalledOnce();
  });

  it('reports a database conflict or validation failure without claiming the stock was saved', async () => {
    response.value = { data: null, error: { message: 'unique index unavailable' } };
    await expect(saveBloodInventoryItem(validInventory)).rejects.toThrow('Failed to save blood inventory: unique index unavailable');
    await expect(saveBloodInventoryItem({ ...validInventory, reserved_units: 20, expired_units: 1 }))
      .rejects.toThrow('Reserved and expired units together cannot exceed on-hand units.');
  });
});
