import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, rpcMock, responses, builders } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  responses: new Map<string, unknown>(),
  builders: new Map<string, Record<string, any>>()
}));
vi.mock('../lib/supabase/client', () => ({ supabase: { from: fromMock, rpc: rpcMock } }));

import { createAmbulance, getAmbulanceProviderById, getAmbulanceProviders, getAmbulances, updateAmbulance } from '../services/ambulanceService';

function makeQuery(table: string) {
  const query: Record<string, any> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn(() => Promise.resolve(responses.get(table) ?? { data: null, error: null }));
  query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(responses.get(table) ?? { data: [], error: null }).then(resolve, reject);
  builders.set(table, query);
  return query;
}

describe('ambulance provider reads', () => {
  beforeEach(() => {
    responses.clear();
    builders.clear();
    fromMock.mockImplementation((table: string) => makeQuery(table));
    rpcMock.mockResolvedValue({ data: { ambulance_id: 'ambulance-1' }, error: null });
  });
  afterEach(() => vi.clearAllMocks());

  it('loads only the provider linked to the signed-in ambulance account', async () => {
    const provider = { provider_id: 'provider-1', provider_name: 'Synthetic Fleet' };
    responses.set('ambulance_providers', { data: provider, error: null });

    await expect(getAmbulanceProviderById('provider-1')).resolves.toEqual(provider);
    expect(builders.get('ambulance_providers')?.eq).toHaveBeenCalledWith('provider_id', 'provider-1');
  });

  it('distinguishes a missing provider record from a failed provider query', async () => {
    responses.set('ambulance_providers', { data: null, error: null });
    await expect(getAmbulanceProviderById('provider-missing')).resolves.toBeNull();

    responses.set('ambulance_providers', { data: null, error: { message: 'permission denied' } });
    await expect(getAmbulanceProviderById('provider-1')).rejects.toThrow('Failed to fetch linked ambulance provider: permission denied');
  });

  it('does not convert fleet or vehicle query errors into empty results', async () => {
    responses.set('ambulance_providers', { data: null, error: { message: 'provider access denied' } });
    await expect(getAmbulanceProviders()).rejects.toThrow('Failed to fetch ambulance providers: provider access denied');

    responses.set('ambulances', { data: null, error: { message: 'fleet access denied' } });
    await expect(getAmbulances('provider-1')).rejects.toThrow('Failed to fetch ambulances: fleet access denied');
  });
});

describe('ambulance fleet writes', () => {
  beforeEach(() => {
    responses.clear();
    builders.clear();
    fromMock.mockImplementation((table: string) => makeQuery(table));
    rpcMock.mockResolvedValue({ data: { ambulance_id: 'ambulance-1' }, error: null });
  });
  afterEach(() => vi.clearAllMocks());

  it('registers vehicles through the provider-scoped transactional RPC', async () => {
    const vehicle = {
      provider_id: 'provider-1', vehicle_number: ' tn 01 ab 1234 ',
      ambulance_type: 'BLS' as const, driver_name: ' Driver One ', status: 'Available' as const,
      current_latitude: 13.1, current_longitude: 80.2
    };
    await expect(createAmbulance(vehicle)).resolves.toMatchObject({ ambulance_id: 'ambulance-1' });
    expect(rpcMock).toHaveBeenCalledWith('create_ambulance', expect.objectContaining({
      p_provider_id: 'provider-1', p_vehicle_number: 'TN 01 AB 1234',
      p_driver_name: 'Driver One', p_current_latitude: 13.1, p_current_longitude: 80.2
    }));
  });

  it('rejects a one-sided coordinate before calling Supabase', async () => {
    await expect(createAmbulance({
      provider_id: 'provider-1', vehicle_number: 'TN01', ambulance_type: 'BLS',
      driver_name: 'Driver One', status: 'Available', current_latitude: 13.1
    })).rejects.toThrow('Latitude and longitude must both be set or both be empty.');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('sends the displayed vehicle version for optimistic updates', async () => {
    await updateAmbulance('ambulance-1', {
      ambulance_type: 'ALS', driver_name: 'Driver Two', driver_phone: null,
      current_latitude: null, current_longitude: null, status: 'Maintenance', assigned_hospital: null
    }, '2026-10-10T10:00:00');
    expect(rpcMock).toHaveBeenCalledWith('update_ambulance', expect.objectContaining({
      p_ambulance_id: 'ambulance-1', p_expected_updated_at: '2026-10-10T10:00:00',
      p_ambulance_type: 'ALS', p_status: 'Maintenance'
    }));
    expect(fromMock).not.toHaveBeenCalled();
  });
});
