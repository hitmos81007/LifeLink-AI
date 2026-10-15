import { supabase } from '../lib/supabase/client';
import { PatientRequestTable, EmergencyType, BloodGroup, SeverityLevel } from '../types/database';

const PATIENT_REQUEST_PAGE_SIZE = 500;

export interface PatientRequestQuantities {
  icu_beds: number;
  general_beds: number;
  oxygen_units: number;
  blood_units: number;
  ambulances: number;
}

export function validatePatientRequestNeeds(input: {
  needs: { icu: boolean; general_bed: boolean; oxygen: boolean; blood: boolean; ambulance: boolean };
  quantities: PatientRequestQuantities;
  neededBy: string;
}, now = new Date()): void {
  if (!input.needs.icu && !input.needs.general_bed && !input.needs.oxygen
    && !input.needs.blood && !input.needs.ambulance) {
    throw new Error('Select at least one resource for the synthetic scenario.');
  }
  const fields: Array<[keyof PatientRequestQuantities, boolean, string]> = [
    ['icu_beds', input.needs.icu, 'ICU beds'],
    ['general_beds', input.needs.general_bed, 'general beds'],
    ['oxygen_units', input.needs.oxygen, 'oxygen units'],
    ['blood_units', input.needs.blood, 'blood units'],
    ['ambulances', input.needs.ambulance, 'ambulances']
  ];
  for (const [field, selected, label] of fields) {
    const quantity = input.quantities[field];
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 10000
      || (selected && quantity < 1) || (!selected && quantity !== 0)) {
      throw new Error(`Enter a whole ${label} quantity from 1 to 10,000 for each selected resource, and 0 for unselected resources.`);
    }
  }
  const neededBy = new Date(input.neededBy);
  if (!Number.isFinite(neededBy.getTime()) || neededBy <= now
    || neededBy.getTime() > now.getTime() + 30 * 24 * 60 * 60 * 1000) {
    throw new Error('Needed-by time must be in the future and within the next 30 days.');
  }
}

export async function getPatientRequests(patientId?: string): Promise<PatientRequestTable[]> {
  const requests: PatientRequestTable[] = [];
  for (let from = 0; ; from += PATIENT_REQUEST_PAGE_SIZE) {
    let query = supabase.from('patient_requests').select('*')
      .eq('data_origin', 'synthetic')
      .order('created_at', { ascending: false })
      .order('request_id', { ascending: false });
    if (patientId) query = query.eq('patient_id', patientId);
    query = query.range(from, from + PATIENT_REQUEST_PAGE_SIZE - 1);

    const { data, error } = await query;
    if (error) {
      console.error('getPatientRequests query error:', error.message);
      throw new Error(`Failed to load patient requests: ${error.message}`);
    }
    if (!data) throw new Error('Failed to load patient requests: Supabase returned no data.');
    requests.push(...(data as PatientRequestTable[]));
    if (data.length < PATIENT_REQUEST_PAGE_SIZE) return requests;
  }
}

export async function getPendingRequests(): Promise<PatientRequestTable[]> {
  const all = await getPatientRequests();
  return all.filter((r) => r.status === 'Pending');
}

export async function createPatientEmergencyRequest(data: {
  emergency_type: EmergencyType;
  required_blood_group?: BloodGroup | null;
  needs_blood: boolean;
  needs_icu: boolean;
  needs_general_bed: boolean;
  needs_oxygen: boolean;
  needs_ambulance: boolean;
  severity: SeverityLevel;
  reported_severity?: SeverityLevel;
  requested_quantities: PatientRequestQuantities;
  needed_by: string;
  simulationLocation?: { latitude: number; longitude: number } | null;
}): Promise<PatientRequestTable> {
  validatePatientRequestNeeds({
    needs: {
      icu: data.needs_icu,
      general_bed: data.needs_general_bed,
      oxygen: data.needs_oxygen,
      blood: data.needs_blood,
      ambulance: data.needs_ambulance
    },
    quantities: data.requested_quantities,
    neededBy: data.needed_by
  });
  if (data.needs_blood && !data.required_blood_group) {
    throw new Error('Choose a blood group when blood is selected.');
  }
  const reportedSev = data.reported_severity || data.severity;
  const simulationLocation = data.simulationLocation ?? null;
  if (simulationLocation && (
    !Number.isFinite(simulationLocation.latitude) || !Number.isFinite(simulationLocation.longitude)
    || simulationLocation.latitude < -90 || simulationLocation.latitude > 90
    || simulationLocation.longitude < -180 || simulationLocation.longitude > 180
  )) {
    throw new Error('The fictional map point must have valid latitude and longitude values.');
  }
  const coarseLocation = simulationLocation
    ? {
        latitude: Math.round(simulationLocation.latitude * 100) / 100,
        longitude: Math.round(simulationLocation.longitude * 100) / 100
      }
    : null;
  const { data: inserted, error } = await supabase.rpc('create_synthetic_patient_request_with_needs', {
    p_emergency_type: data.emergency_type,
    p_required_blood_group: data.needs_blood ? data.required_blood_group || null : null,
    p_needs_blood: data.needs_blood,
    p_needs_icu: data.needs_icu,
    p_needs_general_bed: data.needs_general_bed,
    p_needs_oxygen: data.needs_oxygen,
    p_needs_ambulance: data.needs_ambulance,
    p_reported_severity: reportedSev,
    p_latitude: coarseLocation?.latitude ?? null,
    p_longitude: coarseLocation?.longitude ?? null,
    p_requested_icu_beds: data.requested_quantities.icu_beds,
    p_requested_general_beds: data.requested_quantities.general_beds,
    p_requested_oxygen_units: data.requested_quantities.oxygen_units,
    p_requested_blood_units: data.requested_quantities.blood_units,
    p_requested_ambulances: data.requested_quantities.ambulances,
    p_needed_by: new Date(data.needed_by).toISOString()
  });

  if (error) {
      console.error('Supabase patient request RPC error:', error.message);
    throw new Error(`Failed to record emergency request in database: ${error.message}`);
  }

  const request = (Array.isArray(inserted) ? inserted[0] : inserted) as PatientRequestTable | null;
  if (!request?.request_id || request.data_origin !== 'synthetic') {
    throw new Error('No verified synthetic request row was returned. Refresh and verify before continuing.');
  }
  return request;
}
