import { supabase } from '../lib/supabase/client';
import { PatientRequestTable, EmergencyType, BloodGroup, SeverityLevel } from '../types/database';

const PATIENT_REQUEST_PAGE_SIZE = 500;

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
  simulationLocation?: { latitude: number; longitude: number } | null;
}): Promise<PatientRequestTable> {
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
  const { data: inserted, error } = await supabase.rpc('create_synthetic_patient_request_with_location', {
    p_emergency_type: data.emergency_type,
    p_required_blood_group: data.needs_blood ? data.required_blood_group || null : null,
    p_needs_blood: data.needs_blood,
    p_needs_icu: data.needs_icu,
    p_needs_general_bed: data.needs_general_bed,
    p_needs_oxygen: data.needs_oxygen,
    p_needs_ambulance: data.needs_ambulance,
    p_reported_severity: reportedSev,
    p_latitude: coarseLocation?.latitude ?? null,
    p_longitude: coarseLocation?.longitude ?? null
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
