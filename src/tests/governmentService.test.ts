import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, rpcMock, tableResponses } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  tableResponses: new Map<string, unknown>()
}));

vi.mock('../lib/supabase/client', () => ({
  supabase: { from: fromMock, rpc: rpcMock }
}));

import {
  getAuditLogs,
  getGovernmentEmergencyCaseCounts,
  getGovernmentOverviewMetrics,
  getResourceTransfers
} from '../services/governmentService';

function makeQuery(table: string) {
  const query: Record<string, any> = {};
  for (const method of ['select', 'eq', 'order', 'limit']) {
    query[method] = vi.fn(() => query);
  }
  query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(tableResponses.get(table) ?? { data: [], count: 0, error: null }).then(resolve, reject);
  return query;
}

describe('government dashboard Supabase reads', () => {
  beforeEach(() => {
    tableResponses.clear();
    fromMock.mockImplementation((table: string) => makeQuery(table));
    rpcMock.mockResolvedValue({ data: 4, error: null });
  });

  afterEach(() => vi.clearAllMocks());

  it('returns exact Supabase counts for the oversight cards', async () => {
    const tables = ['hospitals', 'blood_banks', 'ambulance_providers', 'ambulances', 'patient_requests', 'emergency_cases', 'resource_transfers', 'audit_logs'];
    tables.forEach((table, index) => tableResponses.set(table, { data: null, count: index + 1, error: null }));

    await expect(getGovernmentOverviewMetrics()).resolves.toEqual({
      totalHospitals: 1,
      totalBloodBanks: 2,
      totalAmbulanceProviders: 3,
      totalAmbulances: 4,
      totalPatientRequests: 5,
      activeEmergencyCases: 6,
      totalResourceTransfers: 7,
      totalAuditLogs: 8
    });
  });

  it('surfaces count permission failures instead of showing zero records', async () => {
    tableResponses.set('hospitals', { data: null, count: null, error: { message: 'permission denied' } });

    await expect(getGovernmentOverviewMetrics()).rejects.toThrow('Could not load hospitals: permission denied');
  });

  it('uses the RLS-scoped direct case count when the aggregate RPC is unavailable', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'function unavailable' } });
    tableResponses.set('patient_requests', { data: null, count: 3, error: null });
    tableResponses.set('emergency_cases', { data: null, count: 2, error: null });

    await expect(getGovernmentEmergencyCaseCounts()).resolves.toEqual({
      pendingPatientRequests: 3,
      confirmedEmergencyCases: 2
    });
  });

  it('surfaces request-count failures rather than returning an empty state', async () => {
    tableResponses.set('patient_requests', { data: null, count: null, error: { message: 'request access denied' } });

    await expect(getGovernmentEmergencyCaseCounts()).rejects.toThrow('Could not load pending synthetic patient requests: request access denied');
  });

  it('surfaces transfer and audit query errors rather than returning empty arrays', async () => {
    tableResponses.set('resource_transfers', { data: null, count: null, error: { message: 'transfers denied' } });
    tableResponses.set('audit_logs', { data: null, count: null, error: { message: 'audit denied' } });

    await expect(getResourceTransfers()).rejects.toThrow('Could not load resource transfers: transfers denied');
    await expect(getAuditLogs()).rejects.toThrow('Could not load audit logs: audit denied');
  });
});
