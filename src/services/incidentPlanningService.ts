import { supabase } from '../lib/supabase/client';

export const INCIDENT_SCENARIO_LABELS = [
  'Synthetic MCI preparedness exercise',
  'Synthetic mass-casualty drill',
  'Synthetic regional surge scenario'
] as const;
export type IncidentScenarioLabel = typeof INCIDENT_SCENARIO_LABELS[number];

export function normalizeIncidentReviewReason(reason: string): string {
  const normalized = reason.trim();
  if (normalized.length < 8) throw new Error('Add a review reason with at least 8 characters.');
  if (normalized.length > 500) throw new Error('Keep the review reason to 500 characters or fewer.');
  if (/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(normalized) || normalized.replace(/\D/g, '').length >= 10) {
    throw new Error('Review reasons cannot include email addresses or phone numbers.');
  }
  return normalized;
}

export interface IncidentPlanRecord {
  id: string;
  label: string;
  location_label: string;
  expected_arrival_start: string | null;
  expected_arrival_end: string | null;
  created_at: string;
  created_by: string;
  current_version_id: string;
  history: Array<{
    id: string;
    version_number: number;
    supersedes_version_id: string | null;
    created_at: string;
    review: { status: 'pending' | 'approved' | 'rejected' | 'superseded'; reason: string | null; reviewed_at: string | null } | null;
  }>;
  version: {
    id: string;
    version_number: number;
    total_affected: number;
    severity_counts: Record<'red' | 'yellow' | 'green' | 'black', number>;
    assumptions: Record<string, unknown>;
    created_at: string;
    plans: Array<{ resource_type: string; estimated_min: number; estimated_expected: number; estimated_max: number; assumption_details: { formula?: string; uncertainty?: string } }>;
    review: { status: 'pending' | 'approved' | 'rejected'; reason: string | null; reviewed_at: string | null } | null;
  } | null;
}

export function buildIncidentReviewAdjustments(
  decision: 'approved' | 'rejected',
  plans: Array<{ resource_type: string; estimated_expected: number }>,
  editedValues: Record<string, number> = {}
): Record<string, number> {
  if (decision === 'rejected') return {};
  return Object.fromEntries(plans.flatMap(plan => {
    const value = editedValues[plan.resource_type];
    return value !== undefined && value !== Number(plan.estimated_expected) ? [[plan.resource_type, value]] : [];
  }));
}

export async function getIncidentPlans(): Promise<IncidentPlanRecord[]> {
  const { data, error } = await supabase.from('incidents').select(`
    id,label,location_label,expected_arrival_start,expected_arrival_end,created_at,created_by,current_version_id,
    history:incident_versions!incident_versions_incident_id_fkey(id,version_number,supersedes_version_id,created_at,review:plan_reviews(status,reason,reviewed_at)),
    version:incident_versions!incidents_current_version_fk(
      id,version_number,total_affected,severity_counts,assumptions,created_at,
      plans:incident_resource_plans(resource_type,estimated_min,estimated_expected,estimated_max,assumption_details),
      review:plan_reviews(status,reason,reviewed_at)
    )
  `).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data || []) as unknown as IncidentPlanRecord[];
}

export async function createIncidentPlan(input: {
  label: IncidentScenarioLabel;
  locationLabel: string;
  counts: { red: number; yellow: number; green: number; black: number };
  ratios: Record<string, number>;
  arrivalStart?: string;
  arrivalEnd?: string;
}): Promise<void> {
  const total = input.counts.red + input.counts.yellow + input.counts.green + input.counts.black;
  const { error } = await supabase.rpc('create_incident_plan', {
    p_label: input.label,
    p_location_label: input.locationLabel,
    p_total_affected: total,
    p_severity_counts: input.counts,
    p_ratios: input.ratios,
    p_expected_arrival_start: input.arrivalStart || null,
    p_expected_arrival_end: input.arrivalEnd || null
  });
  if (error) throw error;
}

export async function reviewIncidentPlan(input: { versionId: string; decision: 'approved' | 'rejected'; reason: string; adjustments?: Record<string, number> }): Promise<void> {
  const { error } = await supabase.rpc('review_incident_plan', {
    p_version_id: input.versionId,
    p_decision: input.decision,
    p_reason: input.reason,
    p_adjustments: input.adjustments || {}
  });
  if (error) throw error;
}
