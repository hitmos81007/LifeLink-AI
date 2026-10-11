import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock('../lib/supabase/client', () => ({ supabase: { rpc: rpcMock, from: vi.fn() } }));

import { buildIncidentReviewAdjustments, createIncidentPlan, getIncidentReviewReasonOptions, reviewIncidentPlan } from '../services/incidentPlanningService';

const plans = [
  { resource_type: 'icu_beds', estimated_expected: 10 },
  { resource_type: 'oxygen_units', estimated_expected: 20 }
];

describe('incident plan review adjustments', () => {
  beforeEach(() => vi.resetAllMocks());

  it('drops exploratory edits when rejecting a plan', () => {
    expect(buildIncidentReviewAdjustments('rejected', plans, { icu_beds: 8 })).toEqual({});
  });

  it('includes only changed estimates when approving a plan', () => {
    expect(buildIncidentReviewAdjustments('approved', plans, { icu_beds: 8, oxygen_units: 20 })).toEqual({ icu_beds: 8 });
  });

  it('offers controlled aggregate-only reasons for each review outcome', () => {
    expect(getIncidentReviewReasonOptions('approved')).toContain('Confirmed unchanged estimates against the submitted scenario assumptions.');
    expect(getIncidentReviewReasonOptions('approved', true)).toContain('Updated estimates to reflect reviewed aggregate planning assumptions.');
    expect(getIncidentReviewReasonOptions('rejected')).toContain('Rejected because aggregate counts need correction.');
  });

  it('sends the configured generic supply and staffing ratios to Supabase', async () => {
    rpcMock.mockResolvedValue({ data: 'incident-a', error: null });
    const ratios = {
      icu_per_red: 1, general_per_yellow: 1, general_per_green: 0.25,
      oxygen_per_red: 2, oxygen_per_yellow: 1, ambulances_per_red: 0.5,
      ambulances_per_yellow: 0.2, blood_min_per_red: 1, blood_max_per_red: 2,
      medicine_supply_per_red: 0.5, medicine_supply_per_yellow: 0.25,
      medicine_supply_per_green: 0, staff_slots_per_red: 0.2,
      staff_slots_per_yellow: 0.1, staff_slots_per_green: 0.05
    };

    await createIncidentPlan({
      label: 'Synthetic MCI preparedness exercise',
      locationLabel: 'Synthetic district A',
      counts: { red: 4, yellow: 6, green: 8, black: 0 },
      ratios,
      arrivalStart: '2026-10-12T10:00:00.000Z',
      arrivalEnd: '2026-10-12T11:00:00.000Z'
    });

    expect(rpcMock).toHaveBeenCalledWith('create_incident_plan', expect.objectContaining({
      p_total_affected: 18,
      p_ratios: ratios,
      p_severity_counts: { red: 4, yellow: 6, green: 8, black: 0 }
    }));
  });

  it('sends a selected database-approved reason for each reviewer decision', async () => {
    rpcMock.mockResolvedValue({ data: 'review-a', error: null });
    await reviewIncidentPlan({
      versionId: 'version-a', decision: 'approved',
      reason: 'Updated estimates to reflect reviewed aggregate planning assumptions.',
      adjustments: { staffing_slots: 7 }
    });

    expect(rpcMock).toHaveBeenCalledWith('review_incident_plan', {
      p_version_id: 'version-a',
      p_decision: 'approved',
      p_reason: 'Updated estimates to reflect reviewed aggregate planning assumptions.',
      p_adjustments: { staffing_slots: 7 }
    });
  });

  it('rejects free-text reasons before they reach Supabase', async () => {
    await expect(reviewIncidentPlan({
      versionId: 'version-a', decision: 'approved', reason: 'Patient should receive specific care'
    })).rejects.toThrow('Choose a review reason that matches the decision and estimate changes.');
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
