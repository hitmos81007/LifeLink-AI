import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, responses } = vi.hoisted(() => ({ fromMock: vi.fn(), responses: new Map<string, unknown>() }));
vi.mock('../lib/supabase/client', () => ({ supabase: { from: fromMock } }));

import { getAnalyticsSummary, getResourceUtilization, getTimeSeriesData } from '../services/analyticsService';

function queryFor(table: string) {
  const query: Record<string, any> = {};
  let page: [number, number] | null = null;
  for (const method of ['select', 'eq', 'gte', 'in', 'order']) query[method] = vi.fn(() => query);
  query.range = vi.fn((from: number, to: number) => { page = [from, to]; return query; });
  query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(responses.get(table) ?? { data: [], error: null }).then((value: any) => {
      if (value.error || !page || !Array.isArray(value.data)) return value;
      return { ...value, data: value.data.slice(page[0], page[1] + 1) };
    }).then(resolve, reject);
  return query;
}

describe('prototype analytics reads', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
    responses.clear();
    fromMock.mockImplementation((table: string) => queryFor(table));
  });
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it('surfaces summary query failures instead of reporting missing metrics as untracked', async () => {
    responses.set('patient_requests', { data: null, count: null, error: { message: 'RLS denied' } });

    await expect(getAnalyticsSummary()).rejects.toThrow('RLS denied');
  });

  it('paginates inventory and blood workflow records beyond the Supabase row cap', async () => {
    const requests = Array.from({ length: 501 }, (_, index) => ({ request_id: `r${index}`, created_at: '2026-10-06T13:00:00Z' }));
    responses.set('patient_requests', { data: requests, count: requests.length, error: null });
    responses.set('icu_inventory', { data: [
      { icu_inventory_id: 'icu-1', total_icu_beds: 10, occupied_icu_beds: 4, reserved_icu_beds: 1 }
    ], error: null });
    responses.set('emergency_cases', { data: requests.map(({ request_id }) => ({
      case_id: `case-${request_id}`, request_id, assigned_blood_bank_id: 'bank-1'
    })), error: null });

    const summary = await getAnalyticsSummary();

    expect(summary.totalRequests).toBe(501);
    expect(summary.bloodAssignmentRate).toBe(100);
    const pagedRequestQueries = fromMock.mock.results
      .map((result, index) => ({ table: fromMock.mock.calls[index][0], query: result.value }))
      .filter(({ table, query }) => table === 'patient_requests' && query.range.mock.calls.length > 0);
    expect(pagedRequestQueries).toHaveLength(2);
    expect(fromMock.mock.calls.filter(([table]) => table === 'emergency_cases')).toHaveLength(2);
  });

  it('builds chart buckets from synthetic demand and confirmed case rows', async () => {
    responses.set('patient_requests', { data: [
      { request_id: 'r1', created_at: '2026-10-06T13:00:00Z' },
      { request_id: 'r2', created_at: '2026-10-06T13:30:00Z' }
    ], error: null });
    responses.set('emergency_cases', { data: [
      { request_id: 'r1', created_at: '2026-10-06T14:00:00Z' }
    ], error: null });

    const points = await getTimeSeriesData('24h');
    expect(points).toHaveLength(24);
    expect(points.reduce((sum, point) => sum + (point.demand || 0), 0)).toBe(2);
    expect(points.reduce((sum, point) => sum + (point.supply || 0), 0)).toBe(1);
    expect(fromMock.mock.calls.map(([table]) => table)).toEqual(['patient_requests', 'emergency_cases']);
  });

  it('surfaces analytics query failures instead of rendering empty data', async () => {
    responses.set('patient_requests', { data: null, error: { message: 'RLS denied' } });
    await expect(getTimeSeriesData('7d')).rejects.toThrow('Could not load synthetic request trends: RLS denied');
  });

  it('calculates committed ICU utilization from occupied and reserved beds', async () => {
    responses.set('icu_inventory', { data: [
      { total_icu_beds: 10, occupied_icu_beds: 4, reserved_icu_beds: 1 },
      { total_icu_beds: 5, occupied_icu_beds: 2, reserved_icu_beds: 1 }
    ], error: null });
    await expect(getResourceUtilization()).resolves.toEqual([
      { category: 'ICU beds committed', used: 8, total: 15, percentage: 53 }
    ]);
  });

  it('does not hide ICU query errors as zero utilization', async () => {
    responses.set('icu_inventory', { data: null, error: { message: 'inventory denied' } });
    await expect(getResourceUtilization()).rejects.toThrow('Could not load ICU capacity: inventory denied');
  });
});
