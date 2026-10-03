import { supabase } from '../lib/supabase/client';
import { HospitalTable, AmbulanceTable } from '../types/database';
import { calculateHaversineDistance, calculateEtaMinutes } from './aiRecommendationService';
import { MapEntity } from '../components/common/LeafletEmergencyMap';

export type MciHazardType =
  | 'Multi-Vehicle Collision / Highway Pileup'
  | 'Structural Collapse / Building Hazard'
  | 'Industrial Explosion / Chemical Incident'
  | 'Transit / Train Disaster'
  | 'Mass Gathering Stampede'
  | 'Fire & Burn Emergency';

export interface MciTriageCount {
  red: number;     // Immediate / Critical Life-Threatening
  yellow: number;  // Delayed / Serious Non-Life Threatening
  green: number;   // Minor / Walking Wounded
  black: number;   // Expectant / Deceased
}

export interface MciHospitalAllocation {
  hospital_id: string;
  hospital_name: string;
  trauma_center: boolean;
  distance_km: number;
  eta_minutes: number;
  allocated_red: number;
  allocated_yellow: number;
  allocated_green: number;
  open_icu_beds: number;
  open_general_beds: number;
}

export interface MciIncidentReport {
  incident_id: string;
  incident_code: string;
  hazard_type: MciHazardType;
  reported_by: string; // 'Guest First Responder' or Name
  contact_phone?: string;
  location_name: string;
  latitude: number;
  longitude: number;
  total_casualties: number;
  triage: MciTriageCount;
  dispatched_ambulances: {
    ambulance_id: string;
    vehicle_number: string;
    ambulance_type: string;
    driver_name: string;
    eta_minutes: number;
  }[];
  hospital_allocations: MciHospitalAllocation[];
  scene_notes?: string;
  created_at: string;
}

const LOCAL_STORAGE_MCI_KEY = 'lifelink_mci_incidents';

/**
 * Low-Latency Guest Mode Mass Casualty Incident Reporting Engine.
 * Does not require patient authentication. Computes multi-hospital distribution and ambulance aggregation.
 */
export async function reportMassCasualtyIncident(data: {
  hazard_type: MciHazardType;
  reporter_name?: string;
  reporter_phone?: string;
  location_name?: string;
  latitude: number;
  longitude: number;
  triage: MciTriageCount;
  scene_notes?: string;
}): Promise<MciIncidentReport> {
  const total = data.triage.red + data.triage.yellow + data.triage.green + data.triage.black;
  const now = new Date().toISOString();
  const incidentCode = `MCI-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const incidentId = `mci_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // 1. Fetch available hospitals and ambulances in the region
  let hospitals: HospitalTable[] = [];
  let ambulances: AmbulanceTable[] = [];

  try {
    const [hRes, ambRes] = await Promise.all([
      supabase.from('hospitals').select('*'),
      supabase.from('ambulances').select('*')
    ]);
    hospitals = (hRes.data as HospitalTable[]) || [];
    ambulances = (ambRes.data as AmbulanceTable[]) || [];
  } catch (err) {
    console.warn('Database query notice, using local facility network:', err);
  }

  // Fallback defaults if table is empty
  if (hospitals.length === 0) {
    hospitals = [
      {
        hospital_id: 'hosp-01',
        hospital_name: 'Metro Regional Trauma & Emergency Institute',
        hospital_code: 'HOSP-METRO-01',
        address: 'Sector 4 Metro Corridor',
        district: 'Central District',
        state: 'Delhi',
        latitude: data.latitude + 0.015,
        longitude: data.longitude + 0.012,
        phone: '+91-11-2345-0001',
        email: 'er@metrohospital.org',
        hospital_type: 'Government',
        trauma_center: true,
        status: 'Active',
        created_at: now,
        updated_at: now
      },
      {
        hospital_id: 'hosp-02',
        hospital_name: 'St. Jude Super-Specialty Medical Center',
        hospital_code: 'HOSP-SJ-02',
        address: '88 Healthcare Avenue',
        district: 'South District',
        state: 'Delhi',
        latitude: data.latitude - 0.022,
        longitude: data.longitude + 0.018,
        phone: '+91-11-2345-0002',
        email: 'trauma@stjude.org',
        hospital_type: 'Private',
        trauma_center: true,
        status: 'Active',
        created_at: now,
        updated_at: now
      },
      {
        hospital_id: 'hosp-03',
        hospital_name: 'City General & Community Hospital',
        hospital_code: 'HOSP-CGH-03',
        address: 'District Ring Road Hub',
        district: 'West District',
        state: 'Delhi',
        latitude: data.latitude + 0.028,
        longitude: data.longitude - 0.015,
        phone: '+91-11-2345-0003',
        email: 'admissions@citygeneral.org',
        hospital_type: 'Trust',
        trauma_center: false,
        status: 'Active',
        created_at: now,
        updated_at: now
      }
    ];
  }

  if (ambulances.length === 0) {
    ambulances = [
      {
        ambulance_id: 'amb-mci-1',
        provider_id: 'prov-1',
        vehicle_number: 'DL-01-AMB-8812',
        ambulance_type: 'ICU',
        driver_name: 'Commander Marcus Vance',
        driver_phone: '+91-98765-11001',
        current_latitude: data.latitude + 0.006,
        current_longitude: data.longitude - 0.004,
        status: 'Available',
        assigned_hospital: null,
        created_at: now,
        updated_at: now
      },
      {
        ambulance_id: 'amb-mci-2',
        provider_id: 'prov-1',
        vehicle_number: 'DL-01-AMB-4409',
        ambulance_type: 'ALS',
        driver_name: 'Paramedic Sarah Jenkins',
        driver_phone: '+91-98765-11002',
        current_latitude: data.latitude - 0.008,
        current_longitude: data.longitude + 0.007,
        status: 'Available',
        assigned_hospital: null,
        created_at: now,
        updated_at: now
      },
      {
        ambulance_id: 'amb-mci-3',
        provider_id: 'prov-1',
        vehicle_number: 'DL-01-AMB-9921',
        ambulance_type: 'BLS',
        driver_name: 'Officer Rajesh Kumar',
        driver_phone: '+91-98765-11003',
        current_latitude: data.latitude + 0.012,
        current_longitude: data.longitude + 0.005,
        status: 'Available',
        assigned_hospital: null,
        created_at: now,
        updated_at: now
      }
    ];
  }

  // 2. Multi-Hospital Load Distribution Algorithm
  // Calculate distances to all hospitals
  const sortedHospitals = hospitals.map((h) => {
    const dist = calculateHaversineDistance(data.latitude, data.longitude, h.latitude, h.longitude);
    const eta = calculateEtaMinutes(dist);
    return {
      hospital: h,
      distance_km: dist,
      eta_minutes: eta,
      open_icu: h.trauma_center ? 8 : 3,
      open_general: 35
    };
  }).sort((a, b) => a.distance_km - b.distance_km);

  let remainingRed = data.triage.red;
  let remainingYellow = data.triage.yellow;
  let remainingGreen = data.triage.green;

  const allocations: MciHospitalAllocation[] = [];

  for (const item of sortedHospitals) {
    if (remainingRed === 0 && remainingYellow === 0 && remainingGreen === 0 && allocations.length >= 2) {
      break;
    }

    // Allocate RED patients primarily to Trauma Centers
    const redTake = item.hospital.trauma_center
      ? Math.min(remainingRed, item.open_icu)
      : Math.min(remainingRed, 2);
    remainingRed -= redTake;

    // Allocate YELLOW patients
    const yellowTake = Math.min(remainingYellow, Math.floor(item.open_general / 3));
    remainingYellow -= yellowTake;

    // Allocate GREEN patients
    const greenTake = Math.min(remainingGreen, Math.floor(item.open_general / 2));
    remainingGreen -= greenTake;

    allocations.push({
      hospital_id: item.hospital.hospital_id,
      hospital_name: item.hospital.hospital_name,
      trauma_center: item.hospital.trauma_center,
      distance_km: item.distance_km,
      eta_minutes: item.eta_minutes,
      allocated_red: redTake,
      allocated_yellow: yellowTake,
      allocated_green: greenTake,
      open_icu_beds: item.open_icu,
      open_general_beds: item.open_general
    });
  }

  // If any remaining, overflow to top hospital
  if (remainingRed > 0 && allocations.length > 0) allocations[0].allocated_red += remainingRed;
  if (remainingYellow > 0 && allocations.length > 0) allocations[0].allocated_yellow += remainingYellow;
  if (remainingGreen > 0 && allocations.length > 0) allocations[0].allocated_green += remainingGreen;

  // 3. Multi-Ambulance Rapid Dispatch Unit Selection
  const dispatchedAmbulances = ambulances.slice(0, 4).map((a) => {
    const dist = calculateHaversineDistance(data.latitude, data.longitude, a.current_latitude, a.current_longitude);
    return {
      ambulance_id: a.ambulance_id,
      vehicle_number: a.vehicle_number,
      ambulance_type: a.ambulance_type,
      driver_name: a.driver_name,
      eta_minutes: calculateEtaMinutes(dist)
    };
  });

  const report: MciIncidentReport = {
    incident_id: incidentId,
    incident_code: incidentCode,
    hazard_type: data.hazard_type,
    reported_by: data.reporter_name || 'Guest First Responder (Anonymous)',
    contact_phone: data.reporter_phone || undefined,
    location_name: data.location_name || `Disaster Site (${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)})`,
    latitude: data.latitude,
    longitude: data.longitude,
    total_casualties: total,
    triage: data.triage,
    dispatched_ambulances: dispatchedAmbulances,
    hospital_allocations: allocations,
    scene_notes: data.scene_notes || undefined,
    created_at: now
  };

  // 4. Save to local storage for instant multi-tab sync
  try {
    const existingRaw = localStorage.getItem(LOCAL_STORAGE_MCI_KEY);
    const existingList: MciIncidentReport[] = existingRaw ? JSON.parse(existingRaw) : [];
    existingList.unshift(report);
    localStorage.setItem(LOCAL_STORAGE_MCI_KEY, JSON.stringify(existingList.slice(0, 20)));
  } catch (e) {
    console.warn('LocalStorage save error:', e);
  }

  // 5. Broadcast to Supabase notifications
  try {
    await supabase.from('notifications').insert([{
      receiver_id: '00000000-0000-0000-0000-000000000000',
      title: `🚨 MASS CASUALTY INCIDENT REPORTED (${incidentCode})`,
      message: `${data.hazard_type} with ${total} estimated casualties (Red: ${data.triage.red}, Yellow: ${data.triage.yellow}). Dispatched ${dispatchedAmbulances.length} ambulances.`,
      priority: 'Critical',
      is_read: false,
      created_at: now,
      updated_at: now
    }]);
  } catch (notifErr) {
    console.warn('MCI notification broadcast warning:', notifErr);
  }

  return report;
}

/**
 * Fetch all recent mass casualty incident reports for disaster dashboard view.
 */
export function getRecentMciIncidents(): MciIncidentReport[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_MCI_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('getRecentMciIncidents parse error:', e);
  }

  // Return sample default incident for instant demonstration
  return [
    {
      incident_id: 'mci-demo-1',
      incident_code: 'MCI-2026-9042',
      hazard_type: 'Multi-Vehicle Collision / Highway Pileup',
      reported_by: 'Guest First Responder #12',
      contact_phone: '+91-98765-91100',
      location_name: 'National Expressway Sector 12 Flyover',
      latitude: 28.6180,
      longitude: 77.2150,
      total_casualties: 18,
      triage: { red: 4, yellow: 6, green: 7, black: 1 },
      dispatched_ambulances: [
        { ambulance_id: 'amb-1', vehicle_number: 'DL-01-AMB-8812', ambulance_type: 'ICU', driver_name: 'Capt. Marcus Vance', eta_minutes: 4 },
        { ambulance_id: 'amb-2', vehicle_number: 'DL-01-AMB-4409', ambulance_type: 'ALS', driver_name: 'Sgt. Elena Rostova', eta_minutes: 6 },
        { ambulance_id: 'amb-3', vehicle_number: 'DL-01-AMB-9921', ambulance_type: 'BLS', driver_name: 'Officer Rajesh Kumar', eta_minutes: 8 }
      ],
      hospital_allocations: [
        {
          hospital_id: 'hosp-01',
          hospital_name: 'Metro Regional Trauma Center',
          trauma_center: true,
          distance_km: 2.4,
          eta_minutes: 6,
          allocated_red: 3,
          allocated_yellow: 2,
          allocated_green: 2,
          open_icu_beds: 6,
          open_general_beds: 30
        },
        {
          hospital_id: 'hosp-02',
          hospital_name: 'St. Jude Emergency Institute',
          trauma_center: true,
          distance_km: 4.1,
          eta_minutes: 9,
          allocated_red: 1,
          allocated_yellow: 4,
          allocated_green: 5,
          open_icu_beds: 3,
          open_general_beds: 22
        }
      ],
      scene_notes: '3-bus multi-vehicle crash, structural debris on expressway, extrication tools deployed.',
      created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString()
    }
  ];
}
