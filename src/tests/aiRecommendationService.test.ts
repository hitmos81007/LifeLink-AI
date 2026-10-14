import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIRecommendationTable, PatientRequestTable } from '../types/database';

const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }));
vi.mock('../lib/supabase/client', () => ({ supabase: { rpc: rpcMock, from: fromMock } }));

import {
  generateRecommendationsForRequest,
  getAIRecommendations,
  getRecommendationsForRequest,
  isCurrentRecommendationEvidence
} from '../services/aiRecommendationService';

function recommendation(overrides: Partial<AIRecommendationTable> = {}): AIRecommendationTable {
  const createdAt = new Date().toISOString();
  return {
    recommendation_id: 'recommendation-a', request_id: 'request-a', hospital_id: 'hospital-a',
    blood_bank_id: null, ambulance_id: null, distance_km: null, eta_minutes: null,
    confidence_score: 92, recommendation_reason: 'Supabase heuristic fit with synthetic evidence.',
    accepted: false, created_at: createdAt, updated_at: createdAt,
    method_version: 'synthetic_resource_fit_v1', config_version: 'synthetic_resource_fit_rules_v1',
    score_factors: { fit_score: 92 },
    evidence_snapshot: {
      data_origin: 'synthetic', generated_at: createdAt, request_id: 'request-a', hospital_id: 'hospital-a',
      no_reservation_or_dispatch: true, blood_bank_id: null, ambulance_id: null,
      distance_km: null, eta_minutes: null
    },
    ...overrides
  };
}

const request = (overrides: Partial<PatientRequestTable> = {}): PatientRequestTable => ({
  request_id: 'request-a', patient_id: '', emergency_type: 'Trauma', required_blood_group: 'O-',
  needs_blood: true, needs_icu: true, needs_general_bed: false, needs_oxygen: true,
  needs_ambulance: true, reported_severity: 'High', severity: 'High', latitude: null, longitude: null,
  status: 'Pending', data_origin: 'synthetic', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  notes: null,
  ...overrides
} as PatientRequestTable);

describe('synthetic recommendation generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({
      data: [recommendation()],
      error: null
    });
  });

  it('asks Supabase to recompute candidates and scores using only the request ID', async () => {
    const results = await generateRecommendationsForRequest(request());

    expect(results).toHaveLength(1);
    expect(results[0].hospital_id).toBe('hospital-a');
    expect(rpcMock).toHaveBeenCalledExactlyOnceWith('generate_synthetic_recommendations', { p_request_id: 'request-a' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('does not generate recommendations for legacy or closed requests', async () => {
    await expect(generateRecommendationsForRequest(request({ data_origin: 'unknown' }))).resolves.toEqual([]);
    await expect(generateRecommendationsForRequest(request({ status: 'Assigned' }))).resolves.toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('surfaces server-side generation errors instead of returning an empty result', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'active clinician reviewer required' } });
    await expect(generateRecommendationsForRequest(request())).rejects.toThrow(
      'Could not generate facility recommendations: active clinician reviewer required'
    );
  });

  it('surfaces recommendation read errors rather than treating them as no matches', async () => {
    const query: Record<string, any> = {};
    for (const method of ['select', 'eq', 'order']) query[method] = vi.fn(() => query);
    query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ data: null, error: { message: 'recommendation access denied' } }).then(resolve, reject);
    fromMock.mockReturnValue(query);

    await expect(getRecommendationsForRequest('request-a')).rejects.toThrow(
      'Could not load recommendations for request: recommendation access denied'
    );
  });

  it('drops legacy or mismatched saved recommendation evidence', async () => {
    const query: Record<string, any> = {};
    for (const method of ['select', 'eq', 'order']) query[method] = vi.fn(() => query);
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({
      data: [
        recommendation(),
        recommendation({ method_version: null, evidence_snapshot: null }),
        recommendation({ evidence_snapshot: { data_origin: 'synthetic', request_id: 'another-request' } })
      ],
      error: null
    }).then(resolve);
    fromMock.mockReturnValue(query);

    await expect(getRecommendationsForRequest('request-a')).resolves.toHaveLength(1);
  });

  it('does not present expired recommendations as current advisory matches', async () => {
    const query: Record<string, any> = {};
    for (const method of ['select', 'order']) query[method] = vi.fn(() => query);
    let page: [number, number] = [0, 499];
    query.range = vi.fn((from: number, to: number) => { page = [from, to]; return query; });
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({
      data: [
        recommendation(),
        recommendation({
          recommendation_id: 'expired-recommendation',
          created_at: '2026-10-07T11:00:00.000Z',
          evidence_snapshot: {
            ...recommendation().evidence_snapshot,
            generated_at: '2026-10-07T11:00:00.000Z'
          }
        })
      ],
      error: null
    }).then((value: any) => ({ ...value, data: value.data.slice(page[0], page[1] + 1) })).then(resolve);
    fromMock.mockReturnValue(query);

    await expect(getAIRecommendations()).resolves.toHaveLength(1);
  });

  it('paginates the recommendation log beyond the Supabase row cap', async () => {
    const query: Record<string, any> = {};
    for (const method of ['select', 'order']) query[method] = vi.fn(() => query);
    let page: [number, number] = [0, 499];
    query.range = vi.fn((from: number, to: number) => { page = [from, to]; return query; });
    const records = Array.from({ length: 501 }, (_, index) => recommendation({
      recommendation_id: `recommendation-${index}`
    }));
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: records, error: null })
      .then((value: any) => ({ ...value, data: value.data.slice(page[0], page[1] + 1) })).then(resolve);
    fromMock.mockReturnValue(query);

    await expect(getAIRecommendations()).resolves.toHaveLength(501);
    expect(query.range.mock.calls).toEqual([[0, 499], [500, 999]]);
  });

  it('rejects generated results that fail their synthetic provenance check', async () => {
    rpcMock.mockResolvedValue({ data: [recommendation({ accepted: true })], error: null });

    await expect(generateRecommendationsForRequest(request())).rejects.toThrow(
      'saved evidence failed its provenance or freshness check'
    );
  });

  it('treats future-dated or expired recommendation evidence as unusable', () => {
    const now = Date.parse('2026-10-07T12:00:00.000Z');
    expect(isCurrentRecommendationEvidence(recommendation({
      created_at: '2026-10-07T11:44:59.000Z',
      evidence_snapshot: {
        ...recommendation().evidence_snapshot,
        generated_at: '2026-10-07T11:44:59.000Z'
      }
    }), 'request-a', now)).toBe(false);
    expect(isCurrentRecommendationEvidence(recommendation({
      created_at: '2026-10-07T12:00:01.000Z',
      evidence_snapshot: {
        ...recommendation().evidence_snapshot,
        generated_at: '2026-10-07T12:00:01.000Z'
      }
    }), 'request-a', now)).toBe(false);
  });

});
