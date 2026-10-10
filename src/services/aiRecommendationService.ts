import { supabase } from '../lib/supabase/client';
import { AIRecommendationTable, PatientRequestTable } from '../types/database';

export { calculateEtaMinutes, calculateHaversineDistance } from './geoService';

const CURRENT_RECOMMENDATION_METHOD = 'synthetic_resource_fit_v1';
const CURRENT_RECOMMENDATION_CONFIG = 'synthetic_resource_fit_rules_v1';
const RECOMMENDATION_EVIDENCE_MAX_AGE_MS = 15 * 60 * 1000;
const RECOMMENDATION_PAGE_SIZE = 500;

export function isCurrentRecommendationEvidence(
  recommendation: AIRecommendationTable,
  requestId: string,
  now = Date.now()
): boolean {
  const evidence = recommendation.evidence_snapshot;
  const generatedAt = Date.parse(String(evidence?.generated_at || ''));
  const createdAt = Date.parse(recommendation.created_at);
  const age = now - generatedAt;

  return Boolean(
    recommendation.recommendation_id
    && recommendation.request_id === requestId
    && recommendation.hospital_id
    && recommendation.accepted === false
    && recommendation.method_version === CURRENT_RECOMMENDATION_METHOD
    && recommendation.config_version === CURRENT_RECOMMENDATION_CONFIG
    && Number.isFinite(recommendation.confidence_score)
    && recommendation.confidence_score >= 15
    && recommendation.confidence_score <= 100
    && typeof recommendation.recommendation_reason === 'string'
    && recommendation.recommendation_reason.length > 0
    && evidence?.data_origin === 'synthetic'
    && evidence.request_id === requestId
    && evidence.hospital_id === recommendation.hospital_id
    && evidence.no_reservation_or_dispatch === true
    && evidence.blood_bank_id === recommendation.blood_bank_id
    && evidence.ambulance_id === recommendation.ambulance_id
    && evidence.distance_km === recommendation.distance_km
    && evidence.eta_minutes === recommendation.eta_minutes
    && recommendation.score_factors?.fit_score === recommendation.confidence_score
    && Number.isFinite(generatedAt)
    && Number.isFinite(createdAt)
    && Math.abs(createdAt - generatedAt) <= 1000
    && age >= 0
    && age <= RECOMMENDATION_EVIDENCE_MAX_AGE_MS
  );
}

export async function getAIRecommendations(): Promise<AIRecommendationTable[]> {
  try {
    const rows: AIRecommendationTable[] = [];
    for (let from = 0; ; from += RECOMMENDATION_PAGE_SIZE) {
      const { data, error } = await supabase
        .from('ai_recommendations')
        .select('*')
        .order('confidence_score', { ascending: false })
        .order('recommendation_id', { ascending: true })
        .range(from, from + RECOMMENDATION_PAGE_SIZE - 1);
      if (error) throw new Error(`Could not load recommendations: ${error.message}`);
      if (!data) throw new Error('Could not load recommendations: Supabase returned no data.');
      if (!Array.isArray(data)) throw new Error('Could not load recommendations: Supabase returned an invalid result.');
      rows.push(...(data as AIRecommendationTable[]));
      if (data.length < RECOMMENDATION_PAGE_SIZE) break;
    }
    return rows.filter((recommendation) =>
      isCurrentRecommendationEvidence(recommendation, recommendation.request_id));
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Could not load recommendations:')) throw err;
    throw new Error(`Could not load recommendations: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function getRecommendationsForRequest(requestId: string): Promise<AIRecommendationTable[]> {
  try {
    const { data, error } = await supabase
      .from('ai_recommendations')
      .select('*')
      .eq('request_id', requestId)
      .order('confidence_score', { ascending: false });
    if (error) throw new Error(`Could not load recommendations for request: ${error.message}`);
    if (!data) throw new Error('Could not load recommendations for request: Supabase returned no data.');
    if (!Array.isArray(data)) throw new Error('Could not load recommendations for request: Supabase returned an invalid result.');
    return (data as AIRecommendationTable[]).filter((recommendation) =>
      isCurrentRecommendationEvidence(recommendation, requestId));
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Could not load recommendations for request:')) throw err;
    throw new Error(`Could not load recommendations for request: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Requests a server-side, synthetic-only recommendation refresh. Request fields,
 * candidate eligibility, fit scores, ordering, and evidence are re-read/recomputed
 * by Supabase; this browser payload cannot supply ranking values.
 */
export async function generateRecommendationsForRequest(request: PatientRequestTable): Promise<AIRecommendationTable[]> {
  if (request.data_origin !== 'synthetic' || !['Pending', 'Recommended'].includes(request.status)) return [];

  return generateRecommendationsForSyntheticRequestId(request.request_id);
}

/** Server-authorized refresh for a synthetic request ID; Supabase rechecks its origin and status. */
export async function generateRecommendationsForSyntheticRequestId(requestId: string): Promise<AIRecommendationTable[]> {
  const { data, error } = await supabase.rpc('generate_synthetic_recommendations', {
    p_request_id: requestId
  });
  if (error) throw new Error(`Could not generate facility recommendations: ${error.message}`);
  if (!Array.isArray(data)) throw new Error('Could not generate facility recommendations: Supabase returned an invalid result.');
  const recommendations = data as AIRecommendationTable[];
  if (recommendations.some((recommendation) => !isCurrentRecommendationEvidence(recommendation, requestId))) {
    throw new Error('Could not generate facility recommendations: saved evidence failed its provenance or freshness check.');
  }
  return recommendations;
}
