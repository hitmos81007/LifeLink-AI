import { supabase } from '../lib/supabase/client';

export const RESOURCE_KEYS = ['icuBeds', 'generalBeds', 'oxygenUnits', 'operatingRoomHours', 'surgeonHours', 'anesthesiaHours', 'nursingHours', 'emergencyKits'] as const;
export type ResourceKey = typeof RESOURCE_KEYS[number];
export type PlanningCaseType = 'emergency' | 'elective';

export interface HospitalPlanningInput {
  horizonHours: number;
  emergencyDemand: number;
  electiveDemand: number;
  oxygenInventoryId: string | null;
  oxygenUnitLabel: string;
  operatingRoomOpen: boolean;
  criticalEquipmentReady: boolean;
  sterileWorkflowReady: boolean;
  capacity: Record<ResourceKey, number>;
  perCase: Record<PlanningCaseType, Record<ResourceKey, number>>;
}

export interface HospitalPlanningResult {
  emergencyCasesPlanned: number;
  electiveCasesPlanned: number;
  emergencyCasesDeferred: number;
  electiveCasesDeferred: number;
  resourceUse: Record<ResourceKey, { capacity: number; used: number; remaining: number }>;
  limitingResources: ResourceKey[];
  readinessBlockers: string[];
}

export interface SavedHospitalPlanningScenario {
  scenario_id: string;
  scenario_name: string;
  input_snapshot: HospitalPlanningInput;
  result_snapshot: HospitalPlanningResult;
  created_at: string;
}

export const RESOURCE_LABELS: Record<ResourceKey, string> = {
  icuBeds: 'ICU beds',
  generalBeds: 'General beds',
  oxygenUnits: 'Oxygen units',
  operatingRoomHours: 'Operating-room hours',
  surgeonHours: 'Surgeon hours',
  anesthesiaHours: 'Anesthesia team hours',
  nursingHours: 'Nursing hours',
  emergencyKits: 'Emergency supply kits',
};

export function validatePlanningInput(input: HospitalPlanningInput): string | null {
  if (!Number.isInteger(input.horizonHours) || ![24, 72, 168].includes(input.horizonHours)) return 'Choose a 24-hour, 72-hour, or 7-day planning horizon.';
  if (![input.emergencyDemand, input.electiveDemand].every((value) => Number.isInteger(value) && value >= 0 && value <= 1000)) return 'Demand must be a whole number between 0 and 1,000 cases.';
  for (const key of RESOURCE_KEYS) {
    if (!Number.isFinite(input.capacity[key]) || input.capacity[key] < 0 || input.capacity[key] > 1_000_000) return `Enter a valid capacity for ${RESOURCE_LABELS[key]}.`;
    for (const type of ['emergency', 'elective'] as const) {
      if (!Number.isFinite(input.perCase[type][key]) || input.perCase[type][key] < 0 || input.perCase[type][key] > 1_000_000) return `Enter valid ${RESOURCE_LABELS[key]} use per ${type} case.`;
    }
  }
  if (input.emergencyDemand > 0 && RESOURCE_KEYS.every((key) => input.perCase.emergency[key] === 0)) return 'Add the resources required per emergency case.';
  if (input.electiveDemand > 0 && RESOURCE_KEYS.every((key) => input.perCase.elective[key] === 0)) return 'Add the resources required per elective case.';
  return null;
}

/** Lexicographic prototype allocator: maximize emergency cases first, then elective cases. */
export function optimizeHospitalPlan(input: HospitalPlanningInput): HospitalPlanningResult {
  const validationError = validatePlanningInput(input);
  if (validationError) throw new Error(validationError);

  const readinessBlockers = [
    !input.operatingRoomOpen ? 'Operating room is marked closed or unavailable.' : null,
    !input.criticalEquipmentReady ? 'Required operating-room equipment is not marked ready.' : null,
    !input.sterileWorkflowReady ? 'Sterile instruments or processing are not marked ready.' : null,
  ].filter((item): item is string => Boolean(item));
  const maxEmergency = readinessBlockers.length ? 0 : Math.min(input.emergencyDemand, ...RESOURCE_KEYS
    .filter((key) => input.perCase.emergency[key] > 0)
    .map((key) => Math.floor((input.capacity[key] + 1e-9) / input.perCase.emergency[key])));
  const emergencyCasesPlanned = Math.max(0, maxEmergency);
  let electiveCasesPlanned = readinessBlockers.length ? 0 : input.electiveDemand;
  for (const key of RESOURCE_KEYS) {
    const remaining = Math.max(0, input.capacity[key] - emergencyCasesPlanned * input.perCase.emergency[key]);
    if (input.perCase.elective[key] > 0) electiveCasesPlanned = Math.min(electiveCasesPlanned, Math.floor((remaining + 1e-9) / input.perCase.elective[key]));
  }
  electiveCasesPlanned = Math.max(0, electiveCasesPlanned);

  const resourceUse = Object.fromEntries(RESOURCE_KEYS.map((key) => {
    const used = emergencyCasesPlanned * input.perCase.emergency[key] + electiveCasesPlanned * input.perCase.elective[key];
    return [key, { capacity: input.capacity[key], used, remaining: Math.max(0, input.capacity[key] - used) }];
  })) as HospitalPlanningResult['resourceUse'];
  const limitingResources = RESOURCE_KEYS.filter((key) => resourceUse[key].capacity > 0 && resourceUse[key].remaining < Math.max(0.01, resourceUse[key].capacity * 0.05));
  if (readinessBlockers.length && !limitingResources.includes('operatingRoomHours')) limitingResources.push('operatingRoomHours');

  return {
    emergencyCasesPlanned,
    electiveCasesPlanned,
    emergencyCasesDeferred: input.emergencyDemand - emergencyCasesPlanned,
    electiveCasesDeferred: input.electiveDemand - electiveCasesPlanned,
    resourceUse,
    limitingResources,
    readinessBlockers,
  };
}

export async function listHospitalPlanningScenarios(hospitalId: string): Promise<SavedHospitalPlanningScenario[]> {
  const { data, error } = await supabase.from('hospital_resource_planning_scenarios')
    .select('scenario_id,scenario_name,input_snapshot,result_snapshot,created_at')
    .eq('hospital_id', hospitalId).order('created_at', { ascending: false }).limit(10);
  if (error) throw new Error(`Could not load saved planning scenarios: ${error.message}`);
  return (data || []) as SavedHospitalPlanningScenario[];
}

export async function saveHospitalPlanningScenario(
  hospitalId: string, scenarioName: string, input: HospitalPlanningInput, result: HospitalPlanningResult
): Promise<void> {
  const name = scenarioName.trim();
  if (!name || name.length > 100) throw new Error('Enter a scenario name up to 100 characters.');
  const validationError = validatePlanningInput(input);
  if (validationError) throw new Error(validationError);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in with an active hospital administrator account to save a plan.');
  const { error } = await supabase.from('hospital_resource_planning_scenarios').insert({
    hospital_id: hospitalId,
    created_by: user.id,
    scenario_name: name,
    input_snapshot: input,
    result_snapshot: result,
  });
  if (error) throw new Error(`Could not save planning scenario: ${error.message}`);
}
