import { describe, expect, it } from 'vitest';
import { buildIncidentReviewAdjustments, getIncidentReviewReason } from '../services/incidentPlanningService';

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

  it('uses the exact aggregate-only reasons accepted by the database workflow', () => {
    expect(getIncidentReviewReason('approved')).toBe('Reviewed aggregate counts and planning assumptions.');
    expect(getIncidentReviewReason('approved', { icu_beds: 8 })).toBe('Adjusted estimates after reviewing aggregate counts and planning assumptions.');
    expect(getIncidentReviewReason('rejected', { icu_beds: 8 })).toBe('Rejected aggregate scenario; counts or planning assumptions need revision.');
  });
});
