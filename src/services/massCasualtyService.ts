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

export const createEmptyMciTriageCounts = (): MciTriageCount => ({
  red: 0,
  yellow: 0,
  green: 0,
  black: 0
});

export const createSyntheticMciExampleCounts = (): MciTriageCount => ({
  red: 4,
  yellow: 6,
  green: 8,
  black: 0
});

export const SYNTHETIC_MCI_LOCATION = {
  name: 'Synthetic demo region',
  latitude: 28.6180,
  longitude: 77.2150
} as const;

export interface MciHospitalAllocation {
  hospital_id: string;
  hospital_name: string;
  trauma_center: boolean;
  latitude: number;
  longitude: number;
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
  location_name: string;
  latitude: number;
  longitude: number;
  total_casualties: number;
  triage: MciTriageCount;
  unallocated: Pick<MciTriageCount, 'red' | 'yellow' | 'green'>;
  example_ambulances: {
    ambulance_id: string;
    vehicle_number: string;
    ambulance_type: string;
    driver_name: string;
    latitude: number;
    longitude: number;
    eta_minutes: number;
  }[];
  hospital_allocations: MciHospitalAllocation[];
  created_at: string;
}

const LOCAL_STORAGE_MCI_KEY = 'lifelink_mci_incidents';

/**
 * Local-only synthetic MCI simulator. It must never notify users or dispatch real resources.
 */
export async function reportMassCasualtyIncident(data: {
  hazard_type: MciHazardType;
  triage: MciTriageCount;
}): Promise<MciIncidentReport> {
  const triageCounts = Object.values(data.triage);
  if (triageCounts.some((count) => !Number.isSafeInteger(count) || count < 0)
    || triageCounts.reduce((sum, count) => sum + count, 0) > 10000) {
    throw new Error('Triage counts must be whole numbers from 0 to 10,000 total.');
  }
  const total = data.triage.red + data.triage.yellow + data.triage.green + data.triage.black;
  if (total === 0) throw new Error('Add at least one casualty to run the synthetic scenario.');
  const now = new Date().toISOString();
  const scenarioLatitude = SYNTHETIC_MCI_LOCATION.latitude;
  const scenarioLongitude = SYNTHETIC_MCI_LOCATION.longitude;
  const incidentCode = `MCI-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const incidentId = `mci_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // These fixed facilities and vehicles are fictional demonstration data.
  const hospitals: HospitalTable[] = [
      {
        hospital_id: 'hosp-01',
        hospital_name: 'Metro Regional Trauma & Emergency Institute',
        hospital_code: 'HOSP-METRO-01',
        address: 'Sector 4 Metro Corridor',
        district: 'Central District',
        state: 'Delhi',
        latitude: scenarioLatitude + 0.015,
        longitude: scenarioLongitude + 0.012,
        phone: '0000000000',
        email: 'demo@example.invalid',
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
        latitude: scenarioLatitude - 0.022,
        longitude: scenarioLongitude + 0.018,
        phone: '0000000000',
        email: 'demo@example.invalid',
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
        latitude: scenarioLatitude + 0.028,
        longitude: scenarioLongitude - 0.015,
        phone: '0000000000',
        email: 'demo@example.invalid',
        hospital_type: 'Trust',
        trauma_center: false,
        status: 'Active',
        created_at: now,
        updated_at: now
      }
  ];
  const ambulances: AmbulanceTable[] = [
      {
        ambulance_id: 'amb-mci-1',
        provider_id: 'prov-1',
        vehicle_number: 'DEMO-AMB-01',
        ambulance_type: 'ICU',
        driver_name: 'Synthetic crew',
        driver_phone: '0000000000',
        current_latitude: scenarioLatitude + 0.006,
        current_longitude: scenarioLongitude - 0.004,
        status: 'Available',
        assigned_hospital: null,
        created_at: now,
        updated_at: now
      },
      {
        ambulance_id: 'amb-mci-2',
        provider_id: 'prov-1',
        vehicle_number: 'DEMO-AMB-02',
        ambulance_type: 'ALS',
        driver_name: 'Synthetic crew',
        driver_phone: '0000000000',
        current_latitude: scenarioLatitude - 0.008,
        current_longitude: scenarioLongitude + 0.007,
        status: 'Available',
        assigned_hospital: null,
        created_at: now,
        updated_at: now
      },
      {
        ambulance_id: 'amb-mci-3',
        provider_id: 'prov-1',
        vehicle_number: 'DEMO-AMB-03',
        ambulance_type: 'BLS',
        driver_name: 'Synthetic crew',
        driver_phone: '0000000000',
        current_latitude: scenarioLatitude + 0.012,
        current_longitude: scenarioLongitude + 0.005,
        status: 'Available',
        assigned_hospital: null,
        created_at: now,
        updated_at: now
      }
  ];

  // 2. Multi-Hospital Load Distribution Algorithm
  // Calculate distances to all hospitals
  const sortedHospitals = hospitals.map((h) => {
    const dist = calculateHaversineDistance(scenarioLatitude, scenarioLongitude, h.latitude, h.longitude);
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
      latitude: item.hospital.latitude,
      longitude: item.hospital.longitude,
      distance_km: item.distance_km,
      eta_minutes: item.eta_minutes,
      allocated_red: redTake,
      allocated_yellow: yellowTake,
      allocated_green: greenTake,
      open_icu_beds: item.open_icu,
      open_general_beds: item.open_general
    });
  }

  // Preserve unmet demand explicitly. Never imply that a facility can accept
  // more people than its illustrative capacity supports.
  const unallocated = { red: remainingRed, yellow: remainingYellow, green: remainingGreen };

  // 3. Multi-Ambulance Rapid Dispatch Unit Selection
  const exampleAmbulances = ambulances.map((a) => {
    const dist = calculateHaversineDistance(scenarioLatitude, scenarioLongitude, a.current_latitude, a.current_longitude);
    return {
      ambulance_id: a.ambulance_id,
      vehicle_number: a.vehicle_number,
      ambulance_type: a.ambulance_type,
      driver_name: a.driver_name,
      latitude: a.current_latitude,
      longitude: a.current_longitude,
      eta_minutes: calculateEtaMinutes(dist)
    };
  });

  const report: MciIncidentReport = {
    incident_id: incidentId,
    incident_code: incidentCode,
    hazard_type: data.hazard_type,
    location_name: SYNTHETIC_MCI_LOCATION.name,
    latitude: scenarioLatitude,
    longitude: scenarioLongitude,
    total_casualties: total,
    triage: data.triage,
    unallocated,
    example_ambulances: exampleAmbulances,
    hospital_allocations: allocations,
    created_at: now
  };

  // Persist locally so a successful submission cannot be mistaken for a saved report on failure.
  try {
    const existingRaw = localStorage.getItem(LOCAL_STORAGE_MCI_KEY);
    const existingList: MciIncidentReport[] = existingRaw ? JSON.parse(existingRaw) : [];
    existingList.unshift(report);
    localStorage.setItem(LOCAL_STORAGE_MCI_KEY, JSON.stringify(existingList.slice(0, 20)));
  } catch (e) {
    console.warn('LocalStorage save error:', e);
    throw new Error('The local simulation could not be saved in this browser. No report was submitted.');
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
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed as MciIncidentReport[] : [];
    }
  } catch (e) {
    console.warn('getRecentMciIncidents parse error:', e);
  }

  return [];
}
