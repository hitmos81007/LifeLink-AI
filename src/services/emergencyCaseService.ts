import { supabase } from '../lib/supabase/client';
import {
  PatientRequestTable,
  AIRecommendationTable,
  EmergencyCaseTable,
  HospitalTable,
  BloodBankTable,
  AmbulanceTable,
  SeverityLevel,
  EmergencyCaseStatus
} from '../types/database';
import { updateRequestStatus } from './patientRequestService';
import { sendNotification } from './supabaseDataLayer';

export interface ScoreFactors {
  time_to_need: number;             // [0, 1] Weight 35
  capped_waiting_time: number;      // [0, 1] Weight 25
  no_alternative_available: number; // [0, 1] Weight 15
  resource_compatibility: number;   // [0, 1] Weight 10
  logistics_feasibility: number;    // [0, 1] Weight 10
  data_confidence: number;          // [0, 1] Weight 5
}

export interface OperationalQueueItem {
  queue_position: number;
  case_id: string;
  request_id: string;
  patient_id: string;
  priority_tier: SeverityLevel;
  case_status: EmergencyCaseStatus;
  priority_score: number;
  score_factors: ScoreFactors;
  waiting_time_minutes: number;
  created_at: string;
  
  // Patient request demands
  required_resources: {
    emergency_type: string;
    needs_icu: boolean;
    needs_general_bed: boolean;
    needs_oxygen: boolean;
    needs_blood: boolean;
    blood_group: string | null;
    needs_ambulance: boolean;
  };

  // Associated AI recommendation & assigned provider objects
  recommendation_id?: string | null;
  assigned_hospital?: HospitalTable | null;
  assigned_blood_bank?: BloodBankTable | null;
  assigned_ambulance?: AmbulanceTable | null;
  
  // Recommendation metrics
  distance_km?: number;
  eta_minutes?: number;
  recommendation_reason?: string;
  
  // Assignment metadata
  assigned_by?: string | null;
  completed_at?: string | null;
  notes?: string | null;
}

/**
 * Calculates normalized operational priority score factors and final total score (0 - 100)
 * strictly following deterministic weights:
 * (35 * time_to_need) + (25 * capped_waiting_time) + (15 * no_alternative_available) +
 * (10 * resource_compatibility) + (10 * logistics_feasibility) + (5 * data_confidence)
 *
 * NOTE: This operational score does NOT diagnose patients, does NOT replace clinical triage,
 * and does NOT alter the confirmed severity tier. Higher severity ALWAYS dominates queue ordering.
 */
export function calculateOperationalPriorityScore(
  request: PatientRequestTable,
  recommendations: AIRecommendationTable[]
): { priority_score: number; score_factors: ScoreFactors; topRec: AIRecommendationTable | null } {
  const topRec = recommendations.length > 0 ? recommendations[0] : null;

  // 1. time_to_need [0, 1] - Shorter ETA means higher time-sensitivity
  const eta = topRec ? topRec.eta_minutes : 20;
  const time_to_need = Math.max(0, Math.min(1.0, 1.0 - eta / 60.0));

  // 2. capped_waiting_time [0, 1] - Elapsed time in minutes capped at 60 mins
  const elapsedMs = Math.max(0, Date.now() - new Date(request.created_at).getTime());
  const elapsedMins = elapsedMs / (1000 * 60);
  const capped_waiting_time = Math.min(1.0, elapsedMins / 60.0);

  // 3. no_alternative_available [0, 1] - Inversely proportional to available provider alternatives
  const recCount = Math.max(1, recommendations.length);
  const no_alternative_available = Math.round((1.0 / recCount) * 1000) / 1000;

  // 4. resource_compatibility [0, 1] - Ratio of requested resources met by recommended facility
  let totalRequested = 0;
  let matchedCount = 0;

  if (request.needs_icu) {
    totalRequested++;
    if (topRec) matchedCount++;
  }
  if (request.needs_general_bed) {
    totalRequested++;
    if (topRec) matchedCount++;
  }
  if (request.needs_oxygen) {
    totalRequested++;
    if (topRec) matchedCount++;
  }
  if (request.needs_blood) {
    totalRequested++;
    if (topRec && topRec.blood_bank_id) matchedCount++;
    else if (topRec) matchedCount += 0.5;
  }
  if (request.needs_ambulance) {
    totalRequested++;
    if (topRec && topRec.ambulance_id) matchedCount++;
    else if (topRec) matchedCount += 0.5;
  }

  const resource_compatibility = totalRequested === 0 ? 1.0 : Math.min(1.0, matchedCount / totalRequested);

  // 5. logistics_feasibility [0, 1] - Based on proximity / distance (nearer = higher feasibility)
  const dist = topRec ? topRec.distance_km : 10;
  const logistics_feasibility = Math.max(0, Math.min(1.0, 1.0 - dist / 50.0));

  // 6. data_confidence [0, 1] - Recommendation confidence score / 100
  const confidence = topRec ? topRec.confidence_score : 85;
  const data_confidence = Math.max(0, Math.min(1.0, confidence / 100.0));

  const score_factors: ScoreFactors = {
    time_to_need: Math.round(time_to_need * 1000) / 1000,
    capped_waiting_time: Math.round(capped_waiting_time * 1000) / 1000,
    no_alternative_available: Math.round(no_alternative_available * 1000) / 1000,
    resource_compatibility: Math.round(resource_compatibility * 1000) / 1000,
    logistics_feasibility: Math.round(logistics_feasibility * 1000) / 1000,
    data_confidence: Math.round(data_confidence * 1000) / 1000
  };

  const priority_score = Math.round(
    35 * score_factors.time_to_need +
    25 * score_factors.capped_waiting_time +
    15 * score_factors.no_alternative_available +
    10 * score_factors.resource_compatibility +
    10 * score_factors.logistics_feasibility +
    5 * score_factors.data_confidence
  );

  return { priority_score, score_factors, topRec };
}

/**
 * Queries an existing emergency case for a given request.
 * NOTE: Automatic case creation on unreviewed patient requests is strictly prohibited (GAP-02, GAP-12).
 * Clinical cases are created only upon formal clinician review and confirmation.
 */
export async function ensureEmergencyCaseForRequest(
  requestId: string
): Promise<EmergencyCaseTable | null> {
  try {
    const { data: existingCase, error: existingErr } = await supabase
      .from('emergency_cases')
      .select('*')
      .eq('request_id', requestId)
      .maybeSingle();

    if (!existingErr && existingCase) {
      return existingCase as EmergencyCaseTable;
    }
  } catch (err) {
    console.warn('ensureEmergencyCaseForRequest query notice:', err);
  }

  return null;
}

/**
 * Fetches and builds the Operational Priority Queue using purely existing database records.
 * STRICT BATCH 1 RULES:
 * 1. Only existing emergency_cases rows with confirmation_status = 'confirmed' and non-null clinician_confirmed_urgency may enter the queue.
 * 2. Unreviewed patient_requests must NEVER become queue items.
 * 3. Never invent synthetic case IDs.
 * 4. Never use patient_requests.severity or reported_severity as confirmed urgency.
 * 5. Never treat recommended provider IDs as assigned provider IDs.
 * 6. Reading the queue performs SELECT operations only (ZERO database writes / inserts / updates / RPC mutations).
 * 7. If no confirmed cases exist, returns an empty array.
 */
export async function getOperationalQueue(): Promise<OperationalQueueItem[]> {
  try {
    // 1. SELECT confirmed emergency cases ONLY (confirmation_status = 'confirmed' AND clinician_confirmed_urgency IS NOT NULL)
    const { data: casesData, error: casesErr } = await supabase
      .from('emergency_cases')
      .select('*')
      .eq('confirmation_status', 'confirmed')
      .not('clinician_confirmed_urgency', 'is', null);

    if (casesErr) {
      console.error('getOperationalQueue emergency_cases query error:', casesErr.message);
      return [];
    }

    const confirmedCases = (casesData || []) as EmergencyCaseTable[];
    if (confirmedCases.length === 0) {
      return [];
    }

    // 2. Fetch linked patient requests, provider lookups using pure SELECT queries
    const requestIds = confirmedCases.map((c) => c.request_id);
    const hospitalIds = confirmedCases.map((c) => c.assigned_hospital_id).filter(Boolean) as string[];
    const bloodBankIds = confirmedCases.map((c) => c.assigned_blood_bank_id).filter(Boolean) as string[];
    const ambulanceIds = confirmedCases.map((c) => c.assigned_ambulance_id).filter(Boolean) as string[];

    const [
      requestsRes,
      hospitalsRes,
      bloodBanksRes,
      ambulancesRes
    ] = await Promise.all([
      supabase.from('patient_requests').select('*').in('request_id', requestIds),
      hospitalIds.length > 0 ? supabase.from('hospitals').select('*').in('hospital_id', hospitalIds) : Promise.resolve({ data: [] }),
      bloodBankIds.length > 0 ? supabase.from('blood_banks').select('*').in('blood_bank_id', bloodBankIds) : Promise.resolve({ data: [] }),
      ambulanceIds.length > 0 ? supabase.from('ambulances').select('*').in('ambulance_id', ambulanceIds) : Promise.resolve({ data: [] })
    ]);

    const requests = (requestsRes.data || []) as PatientRequestTable[];
    const hospitals = (hospitalsRes.data || []) as HospitalTable[];
    const bloodBanks = (bloodBanksRes.data || []) as BloodBankTable[];
    const ambulances = (ambulancesRes.data || []) as AmbulanceTable[];

    const requestMap = new Map<string, PatientRequestTable>();
    requests.forEach((r) => requestMap.set(r.request_id, r));

    const hospitalMap = new Map<string, HospitalTable>();
    hospitals.forEach((h) => hospitalMap.set(h.hospital_id, h));

    const bloodBankMap = new Map<string, BloodBankTable>();
    bloodBanks.forEach((b) => bloodBankMap.set(b.blood_bank_id, b));

    const ambulanceMap = new Map<string, AmbulanceTable>();
    ambulances.forEach((a) => ambulanceMap.set(a.ambulance_id, a));

    const rawQueueItems: OperationalQueueItem[] = [];

    for (const eCase of confirmedCases) {
      if (!eCase.clinician_confirmed_urgency) continue;

      const req = requestMap.get(eCase.request_id);
      if (!req) continue;

      // Confirmed urgency is STRICTLY from clinician_confirmed_urgency
      const confirmedUrgency = eCase.clinician_confirmed_urgency as SeverityLevel;

      // Assigned providers are STRICTLY from eCase assigned IDs (never from recommendations)
      const assignedHospital = eCase.assigned_hospital_id ? hospitalMap.get(eCase.assigned_hospital_id) || null : null;
      const assignedBloodBank = eCase.assigned_blood_bank_id ? bloodBankMap.get(eCase.assigned_blood_bank_id) || null : null;
      const assignedAmbulance = eCase.assigned_ambulance_id ? ambulanceMap.get(eCase.assigned_ambulance_id) || null : null;

      const waiting_time_minutes = Math.round(
        Math.max(0, Date.now() - new Date(eCase.created_at).getTime()) / (1000 * 60)
      );

      const capped_waiting = Math.min(1.0, waiting_time_minutes / 60.0);
      const score_factors: ScoreFactors = {
        time_to_need: 0.5,
        capped_waiting_time: Math.round(capped_waiting * 1000) / 1000,
        no_alternative_available: 1.0,
        resource_compatibility: 1.0,
        logistics_feasibility: 0.8,
        data_confidence: 1.0
      };

      const priority_score = Math.round(
        35 * score_factors.time_to_need +
        25 * score_factors.capped_waiting_time +
        15 * score_factors.no_alternative_available +
        10 * score_factors.resource_compatibility +
        10 * score_factors.logistics_feasibility +
        5 * score_factors.data_confidence
      );

      rawQueueItems.push({
        queue_position: 0,
        case_id: eCase.case_id, // Real UUID from DB only
        request_id: req.request_id,
        patient_id: req.patient_id,
        priority_tier: confirmedUrgency,
        case_status: eCase.case_status,
        priority_score,
        score_factors,
        waiting_time_minutes,
        created_at: eCase.created_at,

        required_resources: {
          emergency_type: req.emergency_type,
          needs_icu: req.needs_icu,
          needs_general_bed: req.needs_general_bed,
          needs_oxygen: req.needs_oxygen,
          needs_blood: req.needs_blood,
          blood_group: req.required_blood_group,
          needs_ambulance: req.needs_ambulance
        },

        recommendation_id: null,
        assigned_hospital: assignedHospital,
        assigned_blood_bank: assignedBloodBank,
        assigned_ambulance: assignedAmbulance,

        assigned_by: eCase.assigned_by || null,
        completed_at: eCase.completed_at || null,
        notes: eCase.notes || null
      });
    }

    // 3. DETERMINISTIC QUEUE ORDERING RULES
    // Rule 1: Confirmed urgency tier (Critical > High > Medium > Low)
    // Rule 2: Deterministic operational score descending
    // Rule 3: Creation time ascending (older created_at first)
    // Rule 4: Stable case UUID tie-break
    const severityRank: Record<SeverityLevel, number> = {
      Critical: 4,
      High: 3,
      Medium: 2,
      Low: 1
    };

    rawQueueItems.sort((a, b) => {
      // 1. Confirmed urgency tier
      const rankA = severityRank[a.priority_tier] || 1;
      const rankB = severityRank[b.priority_tier] || 1;
      if (rankA !== rankB) {
        return rankB - rankA;
      }

      // 2. Deterministic operational score descending
      if (Math.abs(b.priority_score - a.priority_score) > 0.001) {
        return b.priority_score - a.priority_score;
      }

      // 3. Creation time ascending
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      if (timeA !== timeB) {
        return timeA - timeB;
      }

      // 4. Stable case UUID tie-break
      return a.case_id.localeCompare(b.case_id);
    });

    // 4. Assign 1-indexed queue positions
    return rawQueueItems.map((item, idx) => ({
      ...item,
      queue_position: idx + 1
    }));
  } catch (err) {
    console.error('getOperationalQueue error:', err);
    return [];
  }
}

/**
 * Disabled in Batch 1.
 * Human confirmation and assignment workflows will be implemented in subsequent authorized batches.
 */
export async function confirmEmergencyCaseAssignment(): Promise<never> {
  throw new Error('Emergency case assignment mutation is disabled in Batch 1.');
}
