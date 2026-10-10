import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }));
vi.mock('../lib/supabase/client', () => ({ supabase: { rpc: rpcMock, from: fromMock } }));

import { createPatientEmergencyRequest, getPatientRequests } from '../services/patientRequestService';

const scenario = {
  emergency_type: 'Road Accident' as const,
  required_blood_group: 'O-' as const,
  needs_blood: true,
  needs_icu: true,
  needs_general_bed: false,
  needs_oxygen: true,
  needs_ambulance: true,
  severity: 'High' as const
};

describe('synthetic patient request creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockReset();
    rpcMock.mockResolvedValue({
      data: { request_id: 'request-a', data_origin: 'synthetic', latitude: 28.61, longitude: 77.21 },
      error: null
    });
  });

  it('paginates patient and clinician request reads beyond the Supabase row cap', async () => {
    const rows = Array.from({ length: 501 }, (_, index) => ({ request_id: `request-${index}` }));
    let page: [number, number] = [0, 499];
    let query: Record<string, any>;
    fromMock.mockImplementation(() => {
      query = {};
      for (const method of ['select', 'order', 'eq']) query[method] = vi.fn(() => query);
      query.range = vi.fn((from: number, to: number) => { page = [from, to]; return query; });
      query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve({ data: rows.slice(page[0], page[1] + 1), error: null }).then(resolve, reject);
      return query;
    });

    const result = await getPatientRequests();

    expect(result).toHaveLength(501);
    const pageQueries = fromMock.mock.results.map((call) => call.value as Record<string, any>);
    expect(pageQueries.map((pageQuery) => pageQuery.range.mock.calls[0])).toEqual([[0, 499], [500, 999]]);
    expect(pageQueries.every((pageQuery) => Boolean(pageQuery.order))).toBe(true);
    expect(pageQueries.every((pageQuery) => pageQuery.eq.mock.calls.some(([column, value]: [string, string]) =>
      column === 'data_origin' && value === 'synthetic'))).toBe(true);
  });

  it('passes the opted-in coarse fictional point to the synthetic request RPC', async () => {
    await createPatientEmergencyRequest({
      ...scenario,
      simulationLocation: { latitude: 28.613901, longitude: 77.209099 }
    });

    expect(rpcMock).toHaveBeenCalledExactlyOnceWith('create_synthetic_patient_request_with_location', {
      p_emergency_type: 'Road Accident',
      p_required_blood_group: 'O-',
      p_needs_blood: true,
      p_needs_icu: true,
      p_needs_general_bed: false,
      p_needs_oxygen: true,
      p_needs_ambulance: true,
      p_reported_severity: 'High',
      p_latitude: 28.61,
      p_longitude: 77.21
    });
  });

  it('leaves request coordinates null by default', async () => {
    await createPatientEmergencyRequest(scenario);

    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_latitude: null, p_longitude: null });
  });

  it('rejects invalid fictional map coordinates before calling Supabase', async () => {
    await expect(createPatientEmergencyRequest({
      ...scenario,
      simulationLocation: { latitude: 95, longitude: 181 }
    })).rejects.toThrow('The fictional map point must have valid latitude and longitude values.');

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it.each([null, [], {}, { request_id: 'request-a', data_origin: 'unknown' }])(
    'does not report success without a returned synthetic request row', async (data) => {
      rpcMock.mockResolvedValue({ data, error: null });
      await expect(createPatientEmergencyRequest(scenario))
        .rejects.toThrow('No verified synthetic request row was returned');
    }
  );
});
