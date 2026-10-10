import { describe, expect, it } from 'vitest';
import { buildIncidentReviewAdjustments, getIncidentReviewReason, INCIDENT_REVIEW_REASONS } from '../services/incidentPlanningService';

const plans = [
  { resource_type: 'icu_beds', estimated_expected: 10 },
  { resource_type: 'oxygen_units', estimated_expected: 20 }
];

describe('incident plan review adjustments', () => {
  it('drops exploratory edits when rejecting a plan', () => {
    expect(buildIncidentReviewAdjustments('rejected', plans, { icu_beds: 8 })).toEqual({});
  });

  it('includes only changed estimates when approving a plan', () => {
    expect(buildIncidentReviewAdjustments('approved', plans, { icu_beds: 8, oxygen_units: 20 })).toEqual({ icu_beds: 8 });
  });

  it('uses only fixed, synthetic review reasons for each review outcome', () => {
    expect(getIncidentReviewReason('approved', {})).toBe(INCIDENT_REVIEW_REASONS[0]);
    expect(getIncidentReviewReason('approved', { icu_beds: 8 })).toBe(INCIDENT_REVIEW_REASONS[1]);
    expect(getIncidentReviewReason('rejected', { icu_beds: 8 })).toBe(INCIDENT_REVIEW_REASONS[2]);
  });
});
