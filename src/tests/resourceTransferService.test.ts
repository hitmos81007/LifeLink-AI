import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }));
vi.mock('../lib/supabase/client', () => ({ supabase: { rpc: rpcMock, from: fromMock } }));

import { createInboundTransferRequest, createTransferRequest, getNearbyTransferSources, getResourceTransferEvents, getResourceTransfers, updateTransferStatus } from '../services/resourceTransferService';

describe('location-based inbound resource requests', () => {
  beforeEach(() => rpcMock.mockResolvedValue({ data: [], error: null }));
  afterEach(() => vi.clearAllMocks());

  it('queries nearby donors for the selected resource and normalizes numeric distance and stock', async () => {
    rpcMock.mockResolvedValue({ data: [{
      source_hospital_id: 'donor-1', hospital_name: 'Nearby Hospital', hospital_code: 'H-1',
      district: 'North', state: 'Example', latitude: 12, longitude: 77, distance_km: '4.3',
      resource_type: 'Oxygen', resource_name: 'Medical Oxygen',
      resource_identity: { resource_type: 'Oxygen', name: 'Medical Oxygen', unit: 'cylinders' },
      transferable_quantity: '8', unit: 'cylinders', last_reported_at: '2026-10-11T09:00:00Z'
    }], error: null });

    const sources = await getNearbyTransferSources('Oxygen');
    expect(rpcMock).toHaveBeenCalledWith('find_nearby_transfer_sources', { p_resource_type: 'Oxygen', p_max_distance_km: 100 });
    expect(sources[0]).toMatchObject({ distance_km: 4.3, transferable_quantity: 8, source_hospital_id: 'donor-1' });
    expect(sources[0].last_reported_at).toBe('2026-10-11T09:00:00Z');
    expect(sources[0].key).toContain('donor-1');
  });

  it('passes an explicit unlimited range for any-distance searches', async () => {
    await getNearbyTransferSources('Medicine', null);
    expect(rpcMock).toHaveBeenCalledWith('find_nearby_transfer_sources', { p_resource_type: 'Medicine', p_max_distance_km: null });
  });

  it('creates an inbound request against the selected nearby source and verifies the pending row', async () => {
    rpcMock.mockResolvedValue({ data: {
      transfer_id: 'transfer-1', source_hospital_id: 'donor-1', status: 'Pending'
    }, error: null });
    const identity = { resource_type: 'General Beds', name: null };
    await expect(createInboundTransferRequest({
      source_hospital_id: 'donor-1', resource_type: 'General Beds', resource_name: 'General Beds',
      resource_identity: identity, quantity: 2, idempotency_key: '2de35681-4a5b-4a10-a181-57f749fbe44a'
    })).resolves.toMatchObject({ success: true, data: { transfer_id: 'transfer-1' } });
    expect(rpcMock).toHaveBeenCalledWith('request_inbound_resource_transfer', expect.objectContaining({
      p_source_hospital_id: 'donor-1', p_resource_type: 'General Beds', p_quantity: 2,
      p_resource_identity: identity, p_idempotency_key: '2de35681-4a5b-4a10-a181-57f749fbe44a'
    }));
  });

  it('rejects invalid inbound quantities before calling Supabase', async () => {
    rpcMock.mockClear();
    for (const quantity of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(createInboundTransferRequest({
        source_hospital_id: 'donor-1', resource_type: 'ICU Beds', resource_name: 'ICU Beds',
        resource_identity: { resource_type: 'ICU Beds' }, quantity
      })).resolves.toMatchObject({ success: false });
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('resource transfer timeline', () => {
  beforeEach(() => fromMock.mockReset());
  afterEach(() => vi.clearAllMocks());

  it('loads participant-visible events in chronological order and normalizes quantities', async () => {
    const events = [{
      event_id: 'event-1', transfer_id: 'transfer-1', event_type: 'REQUESTED',
      from_status: null, to_status: 'Pending', quantity: '2', created_at: '2026-10-11T10:00:00Z'
    }];
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => query),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: events, error: null }).then(resolve)
    };
    fromMock.mockReturnValue(query);

    await expect(getResourceTransferEvents('transfer-1')).resolves.toMatchObject([
      { event_id: 'event-1', transfer_id: 'transfer-1', quantity: 2 }
    ]);
    expect(fromMock).toHaveBeenCalledWith('resource_transfer_events');
    expect(query.select).toHaveBeenCalledWith('event_id,transfer_id,event_type,from_status,to_status,quantity,created_at');
    expect(query.eq).toHaveBeenCalledWith('transfer_id', 'transfer-1');
    expect(query.order).toHaveBeenNthCalledWith(1, 'created_at', { ascending: true });
    expect(query.order).toHaveBeenNthCalledWith(2, 'event_id', { ascending: true });
  });

  it('rejects an empty transfer id without querying Supabase', async () => {
    await expect(getResourceTransferEvents('')).rejects.toThrow('A transfer ID is required');
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('resource transfer request idempotency', () => {
  beforeEach(() => {
    rpcMock.mockResolvedValue({ data: { transfer_id: 'transfer-1', status: 'Pending' }, error: null });
  });
  afterEach(() => vi.clearAllMocks());

  it('passes the stable caller idempotency key to the authoritative Supabase function', async () => {
    const params = {
      source_hospital_id: 'hospital-source',
      destination_hospital_id: 'hospital-destination',
      resource_type: 'ICU Beds' as const,
      resource_name: 'ICU Beds',
      quantity: 2,
      idempotency_key: 'b4eaaec8-5c7e-4cee-b3fe-81b48bc8825a',
      remarks: 'Caller-supplied narrative must not be saved'
    };

    await expect(createTransferRequest(params)).resolves.toMatchObject({ success: true, data: { transfer_id: 'transfer-1' } });
    expect(rpcMock).toHaveBeenCalledWith('request_resource_transfer', expect.objectContaining({
      p_destination_hospital_id: params.destination_hospital_id,
      p_quantity: 2,
      p_remarks: null,
      p_idempotency_key: params.idempotency_key
    }));
  });

  it('rejects fractional, unsafe, and non-positive quantities before the database call', async () => {
    const base = {
      source_hospital_id: 'hospital-source',
      destination_hospital_id: 'hospital-destination',
      resource_type: 'ICU Beds' as const,
      resource_name: 'ICU Beds'
    };
    for (const quantity of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(createTransferRequest({ ...base, quantity })).resolves.toMatchObject({
        success: false,
        error: 'Transfer quantity must be a positive whole number.'
      });
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('passes an exact oxygen or medicine identity to the matching Supabase transfer RPC', async () => {
    const identity = {
      resource_type: 'Medicine' as const,
      name: 'Synthetic saline',
      category: 'Fluid',
      dosage: '0.9%',
      manufacturer: 'Example Labs',
      unit: 'bag',
      expiry_date: '2028-12-31'
    };
    await createTransferRequest({
      source_hospital_id: 'source', destination_hospital_id: 'destination',
      resource_type: 'Medicine', resource_name: identity.name, resource_identity: identity,
      quantity: 2, idempotency_key: '2de35681-4a5b-4a10-a181-57f749fbe44a'
    });
    expect(rpcMock).toHaveBeenCalledWith('request_resource_transfer', expect.objectContaining({
      p_resource_name: identity.name,
      p_resource_identity: identity
    }));
  });

  it.each([[], {}, { transfer_id: 'transfer-1', status: 'Approved' }])(
    'does not report a new transfer as created without a verified pending row', async (data) => {
      rpcMock.mockResolvedValue({ data, error: null });
      await expect(createTransferRequest({
        source_hospital_id: 'source', destination_hospital_id: 'destination',
        resource_type: 'ICU Beds', resource_name: 'ICU Beds', quantity: 1
      })).resolves.toMatchObject({ success: false });
    }
  );

  it('lets the database transaction emit the authoritative in-transit event', async () => {
    const transfer = {
      transfer_id: 'transfer-1', source_hospital_id: 'source', destination_hospital_id: 'destination',
      resource_type: 'Oxygen', resource_name: 'Cylinder', quantity: 10, approved_quantity: 4,
      status: 'In Transit'
    };
    rpcMock.mockResolvedValue({ data: transfer, error: null });

    await expect(updateTransferStatus('transfer-1', 'In Transit', 'operator-1')).resolves.toEqual({ success: true });
    expect(rpcMock).toHaveBeenCalledWith('transition_resource_transfer', expect.objectContaining({
      p_remarks: null
    }));
  });

  it('loads transfer history past the Supabase page limit and looks up only referenced hospitals', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({
      transfer_id: `transfer-${i}`,
      source_hospital_id: 'source', destination_hospital_id: 'destination',
      created_at: new Date(2026, 0, 1, 0, 0, 501 - i).toISOString()
    }));
    const ranges: Array<[number, number]> = [];
    const makeTransferQuery = () => {
      let range: [number, number] = [0, 499];
      const chain: any = {
        select: () => chain,
        order: () => chain,
        range: (from: number, to: number) => { range = [from, to]; ranges.push(range); return chain; },
        or: () => chain,
        then: (resolve: (value: unknown) => unknown) => resolve({ data: rows.slice(range[0], range[1] + 1), error: null })
      };
      return chain;
    };
    const hospitalIn = vi.fn().mockResolvedValue({
      data: [{ hospital_id: 'source', hospital_name: 'Source', district: 'D', latitude: 1, longitude: 2, address: '', phone: null }],
      error: null
    });
    fromMock.mockImplementation((table: string) => table === 'resource_transfers'
      ? makeTransferQuery()
      : ({ select: () => ({ in: hospitalIn }) }));

    const transfers = await getResourceTransfers('source');

    expect(transfers).toHaveLength(501);
    expect(ranges).toEqual([[0, 499], [500, 999]]);
    expect(hospitalIn).toHaveBeenCalledWith('hospital_id', ['source', 'destination']);
    expect(transfers[500].source_hospital?.hospital_name).toBe('Source');
  });

  it.each([
    [],
    { transfer_id: 'another-transfer', status: 'In Transit' },
    { transfer_id: 'transfer-1', status: 'Approved' }
  ])('does not report a transfer transition as successful without a matching returned row', async (data) => {
    rpcMock.mockResolvedValue({ data, error: null });
    await expect(updateTransferStatus('transfer-1', 'In Transit', 'operator-1'))
      .resolves.toMatchObject({ success: false });
  });

});
