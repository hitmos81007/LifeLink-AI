import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, responses, builders } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  responses: new Map<string, unknown>(),
  builders: new Map<string, Record<string, any>>()
}));
vi.mock('../lib/supabase/client', () => ({ supabase: { from: fromMock } }));

import { getAmbulanceProviderById, getAmbulanceProviders, getAmbulances } from '../services/ambulanceService';

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
