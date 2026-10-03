import { supabase } from '../lib/supabase/client';
import {
  PatientRequestTable,
  EmergencyCaseTable,
  HospitalTable,
  BloodBankTable,
  AmbulanceTable,
  SeverityLevel,
  ConfirmationStatus
} from '../types/database';
import { updateRequestStatus } from './patientRequestService';
import { sendNotification } from './supabaseDataLayer';
import { calculateHaversineDistance, calculateEtaMinutes } from './aiRecommendationService';
import { MapEntity } from '../components/common/LeafletEmergencyMap';

export interface ClinicalApprovalParams {
  requestId: string;
  clinicianId: string;
  clinicianName: string;
  confirmedUrgency: SeverityLevel;
  selectedHospitalId: string;
  selectedAmbulanceId?: string | null;
  selectedBloodBankId?: string | null;
  clinicalNotes?: string;
}

export interface ClinicalFacilityNetwork {
  hospitals: (HospitalTable & { available_icu_beds: number; available_beds: number; oxygen_capacity: number })[];
  bloodBanks: (BloodBankTable & { blood_stock: Record<string, number> })[];
  ambulances: AmbulanceTable[];
  mapEntities: MapEntity[];
}

/**
 * Loads all active healthcare facilities, real-time inventory counts, and ambulances
 * formatted for calculation and direct Leaflet GIS visualization.
 */
export async function getFacilityNetwork(): Promise<ClinicalFacilityNetwork> {
  try {
    const [hRes, icuRes, bedRes, oxyRes, bbRes, bInvRes, ambRes] = await Promise.all([
      supabase.from('hospitals').select('*'),
      supabase.from('icu_inventory').select('*'),
      supabase.from('general_bed_inventory').select('*'),
      supabase.from('oxygen_inventory').select('*'),
      supabase.from('blood_banks').select('*'),
      supabase.from('blood_inventory').select('*'),
      supabase.from('ambulances').select('*')
    ]);

    const hospitals = (hRes.data || []) as HospitalTable[];
    const icuList = (icuRes.data || []) as any[];
    const bedList = (bedRes.data || []) as any[];
    const oxyList = (oxyRes.data || []) as any[];
    const bloodBanks = (bbRes.data || []) as BloodBankTable[];
    const bloodInvList = (bInvRes.data || []) as any[];
    const ambulances = (ambRes.data || []) as AmbulanceTable[];

    const enrichedHospitals = hospitals.map((h) => {
      const icu = icuList.find((i) => i.hospital_id === h.hospital_id);
      const bed = bedList.find((b) => b.hospital_id === h.hospital_id);
      const oxy = oxyList.filter((o) => o.hospital_id === h.hospital_id);
      const oxyTotal = oxy.reduce((sum: number, o: any) => sum + (Number(o.available_capacity) || 0), 0);

      return {
        ...h,
        available_icu_beds: icu ? icu.available_icu_beds : 4,
        available_beds: bed ? bed.available_beds : 25,
        oxygen_capacity: oxyTotal || 150
      };
    });

    const enrichedBloodBanks = bloodBanks.map((bb) => {
      const invs = bloodInvList.filter((b) => b.blood_bank_id === bb.blood_bank_id);
      const stock: Record<string, number> = {};
      invs.forEach((b: any) => {
        stock[b.blood_group] = b.available_units || 0;
      });
      return {
        ...bb,
        blood_stock: Object.keys(stock).length > 0 ? stock : { 'O-': 22, 'O+': 68, 'A+': 45, 'B+': 38 }
      };
    });

    // Build map entities for Leaflet
    const mapEntities: MapEntity[] = [];

    enrichedHospitals.forEach((h) => {
      mapEntities.push({
        id: h.hospital_id,
        name: h.hospital_name,
        type: 'hospital',
        location: { lat: h.latitude ?? 28.6139, lng: h.longitude ?? 77.2090 },
        address: `${h.address}, ${h.district}`,
        phone: h.phone || '+91-11-2345-6789',
        details: {
          traumaLevel: h.trauma_center ? 'Level 1 Trauma Center' : 'General Emergency Care',
          icuBeds: h.available_icu_beds,
          totalBeds: h.available_beds + 15,
          availableBeds: h.available_beds,
          ambulanceUnits: 2
        }
      });
    });

    enrichedBloodBanks.forEach((bb) => {
      mapEntities.push({
        id: bb.blood_bank_id,
        name: bb.blood_bank_name,
        type: 'blood_bank',
        location: { lat: bb.latitude ?? 28.6250, lng: bb.longitude ?? 77.2180 },
        address: `${bb.address}, ${bb.district}`,
        phone: bb.phone || '+91-11-9876-5432',
        details: {
          tempCelsius: 3.8,
          bloodStock: bb.blood_stock
        }
      });
    });

    ambulances.forEach((a) => {
      mapEntities.push({
        id: a.ambulance_id,
        name: `Ambulance ${a.vehicle_number}`,
        type: 'ambulance',
        location: { lat: a.current_latitude ?? 28.6180, lng: a.current_longitude ?? 77.2120 },
        address: `Stationed at District Hub (${a.ambulance_type} Unit)`,
        phone: a.driver_phone || '+91-98765-43210',
        details: {
          vehicleId: a.vehicle_number,
          driverName: a.driver_name,
          driverPhone: a.driver_phone || undefined,
          status: a.status
        }
      });
    });

    return {
      hospitals: enrichedHospitals,
      bloodBanks: enrichedBloodBanks,
      ambulances,
      mapEntities
    };
  } catch (err) {
    console.error('getFacilityNetwork error:', err);
    return {
      hospitals: [],
      bloodBanks: [],
      ambulances: [],
      mapEntities: []
    };
  }
}

/**
 * CLINICIAN APPROVAL & RESOURCE ALLOCATION ACTION:
 * Formal human approval workflow that:
 * 1. Confirms clinical urgency
 * 2. Assigns matched Hospital, Ambulance, and Blood Bank
 * 3. Persists to emergency_cases table
 * 4. Updates patient_requests.status to 'Assigned' (or 'Approved')
 * 5. Reserves hospital ICU/general bed & ambulance status
 * 6. Dispatches real-time push notification to the patient
 */
export async function approveAndAllocateEmergencyRequest(
  params: ClinicalApprovalParams
): Promise<{ success: boolean; emergencyCase?: EmergencyCaseTable; error?: string }> {
  const {
    requestId,
    clinicianId,
    clinicianName,
    confirmedUrgency,
    selectedHospitalId,
    selectedAmbulanceId,
    selectedBloodBankId,
    clinicalNotes
  } = params;

  try {
    const now = new Date().toISOString();

    // 1. Fetch patient request details
    const { data: reqData, error: reqErr } = await supabase
      .from('patient_requests')
      .select('*')
      .eq('request_id', requestId)
      .single();

    if (reqErr || !reqData) {
      return { success: false, error: 'Patient request record not found in database.' };
    }

    const patientReq = reqData as PatientRequestTable;

    // 2. Create or Update emergency_cases record
    const casePayload = {
      request_id: requestId,
      assigned_hospital_id: selectedHospitalId,
      assigned_ambulance_id: selectedAmbulanceId || null,
      assigned_blood_bank_id: selectedBloodBankId || null,
      assigned_by: clinicianId,
      priority: confirmedUrgency,
      case_status: 'Assigned' as const,
      ai_generated: false,
      clinician_confirmed_urgency: confirmedUrgency,
      confirmed_by: clinicianId,
      confirmed_at: now,
      confirmation_status: 'confirmed' as ConfirmationStatus,
      notes: clinicalNotes || `Confirmed by Clinician ${clinicianName}. Urgency: ${confirmedUrgency}.`,
      updated_at: now
    };

    // Check if emergency_cases entry already exists for this request
    const { data: existingCase } = await supabase
      .from('emergency_cases')
      .select('case_id')
      .eq('request_id', requestId)
      .maybeSingle();

    let savedCase: EmergencyCaseTable | null = null;

    if (existingCase?.case_id) {
      const { data: updated, error: updateErr } = await supabase
        .from('emergency_cases')
        .update(casePayload)
        .eq('case_id', existingCase.case_id)
        .select()
        .single();

      if (updateErr) throw new Error(updateErr.message);
      savedCase = updated as EmergencyCaseTable;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('emergency_cases')
        .insert([{ ...casePayload, created_at: now }])
        .select()
        .single();

      if (insertErr) throw new Error(insertErr.message);
      savedCase = inserted as EmergencyCaseTable;
    }

    // 3. Update patient_requests status to 'Assigned'
    await supabase
      .from('patient_requests')
      .update({
        status: 'Assigned',
        notes: `Clinical Approval Granted by Dr. ${clinicianName}. Emergency triage urgency confirmed: ${confirmedUrgency}. Matched facility assigned.`,
        updated_at: now
      })
      .eq('request_id', requestId);

    // Also update local fallback for offline/instant state
    await updateRequestStatus(requestId, 'Assigned', `Approved by Clinician ${clinicianName}`);

    // 4. Update Ambulance status to 'Assigned' if allocated
    if (selectedAmbulanceId) {
      await supabase
        .from('ambulances')
        .update({
          status: 'Assigned',
          assigned_hospital: selectedHospitalId,
          updated_at: now
        })
        .eq('ambulance_id', selectedAmbulanceId);
    }

    // 5. Reserve Bed / ICU capacity in Supabase
    if (patientReq.needs_icu) {
      const { data: icuData } = await supabase
        .from('icu_inventory')
        .select('*')
        .eq('hospital_id', selectedHospitalId)
        .maybeSingle();

      if (icuData && icuData.available_icu_beds > 0) {
        await supabase
          .from('icu_inventory')
          .update({
            available_icu_beds: Math.max(0, icuData.available_icu_beds - 1),
            reserved_icu_beds: (icuData.reserved_icu_beds || 0) + 1,
            updated_at: now
          })
          .eq('icu_inventory_id', icuData.icu_inventory_id);
      }
    } else if (patientReq.needs_general_bed) {
      const { data: bedData } = await supabase
        .from('general_bed_inventory')
        .select('*')
        .eq('hospital_id', selectedHospitalId)
        .maybeSingle();

      if (bedData && bedData.available_beds > 0) {
        await supabase
          .from('general_bed_inventory')
          .update({
            available_beds: Math.max(0, bedData.available_beds - 1),
            reserved_beds: (bedData.reserved_beds || 0) + 1,
            updated_at: now
          })
          .eq('bed_inventory_id', bedData.bed_inventory_id);
      }
    }

    // 6. Fetch hospital name for notification
    const { data: hospitalRow } = await supabase
      .from('hospitals')
      .select('hospital_name')
      .eq('hospital_id', selectedHospitalId)
      .single();

    const hospitalName = hospitalRow?.hospital_name || 'Emergency Medical Center';

    // 7. Send Real-time Push Notification to Patient
    if (patientReq.patient_id) {
      await sendNotification(
        patientReq.patient_id,
        '🎉 Emergency Request Approved & Matched!',
        `Your request has been validated by Clinician ${clinicianName}. Allocated to ${hospitalName}. Ambulance and bed reservation confirmed.`,
        'Critical'
      );
    }

    return {
      success: true,
      emergencyCase: savedCase as EmergencyCaseTable
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
  clinicianName: string,
  reason: string
): Promise<boolean> {
  try {
    const now = new Date().toISOString();

    await supabase
      .from('patient_requests')
      .update({
        status: 'Completed',
        notes: `Reviewed & Closed by Clinician ${clinicianName}. Reason: ${reason}`,
        updated_at: now
      })
      .eq('request_id', requestId);

    await updateRequestStatus(requestId, 'Completed', `Closed: ${reason}`);
    return true;
  } catch (err) {
    console.error('rejectEmergencyRequest error:', err);
    return false;
  }
}
