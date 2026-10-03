import { supabase } from '../lib/supabase/client';
import { PatientRequestTable, EmergencyType, BloodGroup, SeverityLevel, RequestStatus } from '../types/database';
import { sendNotification } from './supabaseDataLayer';

export async function getPatientRequests(patientId?: string): Promise<PatientRequestTable[]> {
  let query = supabase.from('patient_requests').select('*').order('created_at', { ascending: false });
  if (patientId) {
    query = query.eq('patient_id', patientId);
  }
  const { data, error } = await query;
  if (error) {
    console.error('getPatientRequests query error:', error.message);
    throw new Error(`Failed to load patient requests: ${error.message}`);
  }
  return (data as PatientRequestTable[]) || [];
}

export async function getPendingRequests(): Promise<PatientRequestTable[]> {
  const all = await getPatientRequests();
  return all.filter((r) => r.status === 'Pending');
}

export async function createPatientEmergencyRequest(data: {
  patient_id: string;
  emergency_type: EmergencyType;
  required_blood_group?: BloodGroup | null;
  needs_blood: boolean;
  needs_icu: boolean;
  needs_general_bed: boolean;
  needs_oxygen: boolean;
  needs_ambulance: boolean;
  severity: SeverityLevel;
  reported_severity?: SeverityLevel;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
}): Promise<PatientRequestTable> {
  const now = new Date().toISOString();
  const reportedSev = data.reported_severity || data.severity;
  
  const payload = {
    patient_id: data.patient_id,
    emergency_type: data.emergency_type,
    required_blood_group: data.required_blood_group || null,
    needs_blood: data.needs_blood,
    needs_icu: data.needs_icu,
    needs_general_bed: data.needs_general_bed,
    needs_oxygen: data.needs_oxygen,
    needs_ambulance: data.needs_ambulance,
    reported_severity: reportedSev,
    severity: reportedSev, // Backward compatibility
    latitude: data.latitude ?? 28.6139,
    longitude: data.longitude ?? 77.2090,
    status: 'Pending' as RequestStatus,
    notes: data.notes || null,
    created_at: now,
    updated_at: now
  };

  // Insert into Supabase patient_requests table
  const { data: inserted, error } = await supabase
    .from('patient_requests')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error('Supabase patient_requests insert error:', error.message);
    throw new Error(`Failed to record emergency request in database: ${error.message}`);
  }

  if (inserted) {
    try {
      await sendNotification(
        data.patient_id,
        'Emergency Request Created',
        `Your emergency request for ${data.emergency_type} has been submitted with self-reported severity ${reportedSev}.`,
        reportedSev === 'Critical' ? 'Critical' : reportedSev === 'High' ? 'High' : 'Medium'
      );
    } catch {}
    return inserted as PatientRequestTable;
  }

  throw new Error('No record returned after emergency request creation.');
}

export async function updateRequestStatus(
  requestId: string,
  status: RequestStatus,
  notes?: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('patient_requests')
      .update({ status, notes, updated_at: new Date().toISOString() })
      .eq('request_id', requestId);
    if (!error) return true;
  } catch (err) {
    console.warn('updateRequestStatus DB notice:', err);
  }

  // Update in local fallback
  try {
    const localRaw = localStorage.getItem('local_patient_requests');
    if (localRaw) {
      const items = JSON.parse(localRaw) as PatientRequestTable[];
      const idx = items.findIndex(r => r.request_id === requestId);
      if (idx !== -1) {
        items[idx].status = status;
        if (notes) items[idx].notes = notes;
        items[idx].updated_at = new Date().toISOString();
        localStorage.setItem('local_patient_requests', JSON.stringify(items));
        return true;
      }
    }
  } catch (e) {
    console.warn('Local updateRequestStatus error:', e);
  }

  return false;
}
