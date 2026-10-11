import { describe, expect, it } from 'vitest';
import { buildIncidentReviewAdjustments, normalizeIncidentReviewReason } from '../services/incidentPlanningService';

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

  it('trims and validates reviewer-authored reasons', () => {
    expect(normalizeIncidentReviewReason('  Reviewed capacity assumptions.  ')).toBe('Reviewed capacity assumptions.');
    expect(() => normalizeIncidentReviewReason('Fix it')).toThrow('at least 8 characters');
    expect(() => normalizeIncidentReviewReason('Call me at 1234567890')).toThrow('phone numbers');
    expect(() => normalizeIncidentReviewReason('x'.repeat(501))).toThrow('500 characters');
  });
});
