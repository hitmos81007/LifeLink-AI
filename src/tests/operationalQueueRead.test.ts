import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, tableResponses, queryBuilders } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  tableResponses: new Map<string, unknown>(),
  queryBuilders: new Map<string, Record<string, any>>()
}));

vi.mock('../lib/supabase/client', () => ({ supabase: { from: fromMock } }));

import { ensureEmergencyCaseForRequest, getOperationalQueue } from '../services/emergencyCaseService';

function makeQuery(table: string) {
  const query: Record<string, any> = {};
  const filters: Array<{ method: string; column: string; value: unknown }> = [];
  for (const method of ['select', 'order']) query[method] = vi.fn(() => query);
  query.eq = vi.fn((column: string, value: unknown) => { filters.push({ method: 'eq', column, value }); return query; });
  query.not = vi.fn((column: string, operator: string, value: unknown) => { filters.push({ method: 'not', column, value: `${operator}:${value}` }); return query; });
  query.in = vi.fn((column: string, value: unknown[]) => { filters.push({ method: 'in', column, value }); return query; });
  let page: [number, number] | null = null;
  query.range = vi.fn((from: number, to: number) => { page = [from, to]; return query; });
  query.maybeSingle = vi.fn(() => Promise.resolve(tableResponses.get(table) ?? { data: null, error: null }));
  query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(tableResponses.get(table) ?? { data: [], error: null }).then((value: any) => {
      if (value.error || !Array.isArray(value.data)) return value;
      let data = value.data;
      for (const filter of filters) {
        if (filter.method === 'eq') data = data.filter((row: any) => row[filter.column] === filter.value);
        if (filter.method === 'in') data = data.filter((row: any) => (filter.value as unknown[]).includes(row[filter.column]));
        if (filter.method === 'not' && filter.value === 'is:null') data = data.filter((row: any) => row[filter.column] !== null && row[filter.column] !== undefined);
      }
      if (page) data = data.slice(page[0], page[1] + 1);
      return { ...value, data };
    }).then(resolve, reject);
  queryBuilders.set(table, query);
  return query;
}

const confirmedCase = {
  case_id: 'case-1',
  request_id: 'request-1',
  confirmation_status: 'confirmed',
  clinician_confirmed_urgency: 'High',
  case_status: 'Open',
  assigned_hospital_id: null,
  assigned_blood_bank_id: null,
  assigned_ambulance_id: null,
  assigned_by: null,
  completed_at: null,
  notes: null,
  created_at: '2026-10-07T11:00:00.000Z'
};

const linkedRequest = {
  request_id: 'request-1',
  data_origin: 'synthetic',
  patient_id: 'patient-1',
  emergency_type: 'Cardiac Arrest',
  needs_icu: true,
  needs_general_bed: false,
  needs_oxygen: true,
  needs_blood: false,
  required_blood_group: null,
  needs_ambulance: true,
  requested_icu_beds: 2,
  requested_general_beds: 0,
  requested_oxygen_units: 3,
  requested_blood_units: 0,
  requested_ambulances: 1,
  needed_by: '2026-10-08T11:00:00.000Z',
  created_at: '2026-10-07T11:00:00.000Z'
};

describe('operational queue database reads', () => {
  beforeEach(() => {
    tableResponses.clear();
    queryBuilders.clear();
    tableResponses.set('patient_requests', { data: [linkedRequest], error: null });
    fromMock.mockImplementation((table: string) => makeQuery(table));
  });

  afterEach(() => vi.clearAllMocks());

  it('returns null only when no case exists and surfaces lookup errors', async () => {
    tableResponses.set('emergency_cases', { data: null, error: null });
    await expect(ensureEmergencyCaseForRequest('request-1')).resolves.toBeNull();

    tableResponses.set('emergency_cases', { data: null, error: { message: 'lookup denied' } });
    await expect(ensureEmergencyCaseForRequest('request-1')).rejects.toThrow('Could not check emergency case for request: lookup denied');
  });

  it('reads only clinician-confirmed cases and returns an empty queue only for a successful empty query', async () => {
    tableResponses.set('emergency_cases', { data: [], error: null });

    await expect(getOperationalQueue()).resolves.toEqual([]);
    expect(queryBuilders.get('emergency_cases')?.eq).toHaveBeenCalledWith('confirmation_status', 'confirmed');
    expect(queryBuilders.get('emergency_cases')?.not).toHaveBeenCalledWith('clinician_confirmed_urgency', 'is', null);
    expect(fromMock.mock.calls.map(([table]) => table)).toEqual(['patient_requests', 'emergency_cases']);
  });

  it('surfaces case-query failures instead of presenting an empty queue', async () => {
    tableResponses.set('emergency_cases', { data: null, error: { message: 'permission denied' } });

    await expect(getOperationalQueue()).rejects.toThrow('Could not load confirmed emergency cases: permission denied');
  });

  it('surfaces failures reading linked requests and provider records', async () => {
    tableResponses.set('patient_requests', { data: null, error: { message: 'request access denied' } });

    await expect(getOperationalQueue()).rejects.toThrow('Failed to load patient requests: request access denied');

    tableResponses.set('patient_requests', { data: [linkedRequest], error: null });
    tableResponses.set('emergency_cases', {
      data: [{ ...confirmedCase, assigned_hospital_id: 'hospital-1' }], error: null
    });
    tableResponses.set('patient_requests', { data: [linkedRequest], error: null });
    tableResponses.set('hospitals', { data: null, error: { message: 'hospital access denied' } });
    tableResponses.set('ambulances', { data: [], error: null });

    await expect(getOperationalQueue()).rejects.toThrow('Could not load assigned hospitals: hospital access denied');
  });

  it('excludes confirmed cases that are not linked to synthetic requests', async () => {
    tableResponses.set('emergency_cases', {
      data: [{ ...confirmedCase, request_id: 'legacy-request' }], error: null
    });

    await expect(getOperationalQueue()).resolves.toEqual([]);
    expect(fromMock.mock.calls.map(([table]) => table)).toEqual(['patient_requests', 'emergency_cases']);
  });

  it('builds a queue item from linked Supabase rows without using patient-reported severity', async () => {
    tableResponses.set('emergency_cases', { data: [confirmedCase], error: null });
    tableResponses.set('patient_requests', { data: [{ ...linkedRequest, severity: 'Critical' }], error: null });

    await expect(getOperationalQueue()).resolves.toMatchObject([
      {
        case_id: 'case-1',
        request_id: 'request-1',
        priority_tier: 'High',
        case_status: 'Open',
        required_resources: { emergency_type: 'Cardiac Arrest', needs_icu: true },
        requested_quantities: {
          icu_beds: 2,
          general_beds: 0,
          oxygen_units: 3,
          blood_units: 0,
          ambulances: 1
        },
        needed_by: '2026-10-08T11:00:00.000Z'
      }
    ]);
  });

  it('keeps quantities and deadline explicitly unknown for older request rows', async () => {
    tableResponses.set('emergency_cases', { data: [confirmedCase], error: null });
    const legacyRequest = {
      ...linkedRequest,
      requested_icu_beds: undefined,
      requested_general_beds: undefined,
      requested_oxygen_units: undefined,
      requested_blood_units: undefined,
      requested_ambulances: undefined,
      needed_by: undefined
    };
    tableResponses.set('patient_requests', { data: [legacyRequest], error: null });

    await expect(getOperationalQueue()).resolves.toMatchObject([{
      requested_quantities: {
        icu_beds: null,
        general_beds: null,
        oxygen_units: null,
        blood_units: null,
        ambulances: null
      },
      needed_by: null
    }]);
  });

  it('loads every confirmed queue item across multiple bounded request batches', async () => {
    const requests = Array.from({ length: 501 }, (_, index) => ({
      ...linkedRequest,
      request_id: `request-${index}`
    }));
    const cases = requests.map((request, index) => ({
      ...confirmedCase,
      case_id: `case-${index}`,
      request_id: request.request_id
    }));
    tableResponses.set('patient_requests', { data: requests, error: null });
    tableResponses.set('emergency_cases', { data: cases, error: null });

    const queue = await getOperationalQueue();

    expect(queue).toHaveLength(501);
    expect(queue[0].queue_position).toBe(1);
    expect(queue[500].queue_position).toBe(501);
    expect(fromMock.mock.calls.filter(([table]) => table === 'emergency_cases')).toHaveLength(2);
  });
});
