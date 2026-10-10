import { supabase } from '../lib/supabase/client';
import {
  PatientRequestTable,
  EmergencyCaseTable,
  HospitalTable,
  BloodBankTable,
  AmbulanceTable,
  SeverityLevel
} from '../types/database';
import { MapEntity } from '../components/common/LeafletEmergencyMap';
import { getResourceFreshness } from './resourceFreshness';
import { isValidCoordinatePair } from './geoService';

export interface ClinicalApprovalParams {
  requestId: string;
  confirmedUrgency?: SeverityLevel;
  selectedHospitalId: string;
  selectedAmbulanceId?: string | null;
  selectedBloodBankId?: string | null;
}

export interface ClinicalReviewNetwork {
  hospitals: Array<Pick<HospitalTable, 'hospital_id' | 'hospital_name' | 'address' | 'district' | 'latitude' | 'longitude' | 'trauma_center' | 'status'> & {
    available_icu_beds: number; available_beds: number; available_oxygen_records: number;
    icu_updated_at?: string | null; beds_updated_at?: string | null; oxygen_updated_at?: string | null;
  }>;
  bloodBanks: Array<Pick<BloodBankTable, 'blood_bank_id' | 'blood_bank_name' | 'address' | 'district' | 'latitude' | 'longitude' | 'status'> & {
    blood_stock: Record<string, number>; blood_thresholds: Record<string, number>;
    blood_updated_at?: Record<string, string | null>;
  }>;
  ambulances: Array<Pick<AmbulanceTable, 'ambulance_id' | 'vehicle_number' | 'ambulance_type' | 'status' | 'current_latitude' | 'current_longitude' | 'assigned_hospital'> & { updated_at?: string | null }>;
  mapEntities: MapEntity[];
}

/** Minimal facility candidates for synthetic clinician review, returned by a role-checked RPC. */
export async function getClinicalReviewNetwork(): Promise<ClinicalReviewNetwork> {
  const { data, error } = await supabase.rpc('get_clinician_review_network');
  if (error) throw new Error(`Could not load clinician review candidates: ${error.message}`);
  if (!data || typeof data !== 'object') throw new Error('Clinician review candidate data was not returned.');

  const network = data as Omit<ClinicalReviewNetwork, 'mapEntities'>;
  const hospitals = Array.isArray(network.hospitals) ? network.hospitals : [];
  const bloodBanks = Array.isArray(network.bloodBanks) ? network.bloodBanks : [];
  const ambulances = Array.isArray(network.ambulances) ? network.ambulances : [];
  const mapEntities: MapEntity[] = [];

  hospitals.forEach((hospital) => {
    if (!isValidCoordinatePair(hospital.latitude, hospital.longitude)) return;
    mapEntities.push({
      id: hospital.hospital_id, name: hospital.hospital_name, type: 'hospital',
      location: { lat: hospital.latitude, lng: hospital.longitude },
      address: `${hospital.address}, ${hospital.district}`,
      details: {
        traumaLevel: hospital.trauma_center ? 'Trauma center' : 'General emergency care',
        icuBeds: hospital.available_icu_beds, availableBeds: hospital.available_beds,
        resourceFreshness: [
          { resource: 'ICU beds', freshness: getResourceFreshness(hospital.icu_updated_at ?? null, 'icu'), updatedAt: hospital.icu_updated_at ?? null },
          { resource: 'General beds', freshness: getResourceFreshness(hospital.beds_updated_at ?? null, 'beds'), updatedAt: hospital.beds_updated_at ?? null },
          { resource: 'Oxygen', freshness: getResourceFreshness(hospital.oxygen_updated_at ?? null, 'oxygen'), updatedAt: hospital.oxygen_updated_at ?? null }
        ]
      }
    });
  });
  bloodBanks.forEach((bank) => {
    if (!isValidCoordinatePair(bank.latitude, bank.longitude)) return;
    mapEntities.push({
      id: bank.blood_bank_id, name: bank.blood_bank_name, type: 'blood_bank',
      location: { lat: bank.latitude, lng: bank.longitude }, address: `${bank.address}, ${bank.district}`,
      details: {
        bloodStock: bank.blood_stock,
        resourceFreshness: Object.entries(bank.blood_stock).map(([group]) => ({
          resource: `${group} blood`, freshness: getResourceFreshness(bank.blood_updated_at?.[group] ?? null, 'blood'),
          updatedAt: bank.blood_updated_at?.[group] ?? null
        }))
      }
    });
  });
  ambulances.forEach((ambulance) => {
    if (!isValidCoordinatePair(ambulance.current_latitude, ambulance.current_longitude)) return;
    mapEntities.push({
      id: ambulance.ambulance_id, name: `Unit ${ambulance.vehicle_number}`, type: 'ambulance',
      location: { lat: ambulance.current_latitude, lng: ambulance.current_longitude },
      address: 'Recorded vehicle coordinate • no live tracking',
      details: {
        vehicleId: ambulance.vehicle_number, status: ambulance.status,
        resourceFreshness: [{ resource: 'Ambulance availability', freshness: getResourceFreshness(ambulance.updated_at ?? null, 'ambulance'), updatedAt: ambulance.updated_at ?? null }]
      }
    });
  });

  return { hospitals, bloodBanks, ambulances, mapEntities };
}

/**
 * Applies a clinician review through one authenticated Supabase transaction.
 * Bed reservation and ambulance assignment either commit together or roll back.
 * Oxygen and blood availability are rechecked, but units are not reserved.
 */
export async function approveAndAllocateEmergencyRequest(
  params: ClinicalApprovalParams
): Promise<{ success: boolean; emergencyCase?: EmergencyCaseTable; error?: string }> {
  const {
    requestId,
    confirmedUrgency,
    selectedHospitalId,
    selectedAmbulanceId,
    selectedBloodBankId
  } = params;

  if (confirmedUrgency !== 'Low' && confirmedUrgency !== 'Medium'
    && confirmedUrgency !== 'High' && confirmedUrgency !== 'Critical') {
    return { success: false, error: 'A clinician must explicitly confirm urgency before recording an assignment.' };
  }

  try {
    const { data, error } = await supabase.rpc('approve_emergency_request', {
      p_request_id: requestId,
      p_hospital_id: selectedHospitalId,
      p_ambulance_id: selectedAmbulanceId || null,
      p_blood_bank_id: selectedBloodBankId || null,
      p_confirmed_urgency: confirmedUrgency
    });
    if (error) throw new Error(error.message);
    const emergencyCase = (Array.isArray(data) ? data[0] : data) as EmergencyCaseTable | null;
    if (!emergencyCase?.case_id) throw new Error('Approval completed without returning its emergency case. Refresh and verify the request.');
    return {
      success: true,
      emergencyCase
    };
  } catch (err: any) {
    console.error('approveAndAllocateEmergencyRequest error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to approve and allocate emergency request.'
    };
  }
}

/**
 * REJECT EMERGENCY REQUEST:
 * Allows clinician reviewer to reject an invalid/duplicate request with a medical note.
 */
export async function rejectEmergencyRequest(
  requestId: string,
  reason: string
): Promise<void> {
  try {
    const { error } = await supabase.rpc('reject_emergency_request', {
      p_request_id: requestId,
      p_reason: reason.trim()
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error('rejectEmergencyRequest error:', err);
    throw err;
  }
}
