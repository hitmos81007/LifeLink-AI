import { supabase } from '../lib/supabase/client';
import {
  AnalyticsSummary,
  TimeSeriesPoint,
  ResourceUtilizationData
} from '../types/entities';

const ANALYTICS_PAGE_SIZE = 500;

async function fetchAllPages<T>(
  label: string,
  readPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
    const { data, error } = await readPage(from, from + ANALYTICS_PAGE_SIZE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    if (!data) throw new Error(`${label}: Supabase returned no data.`);
    rows.push(...data);
    if (data.length < ANALYTICS_PAGE_SIZE) return rows;
  }
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

export function calculateIcuCommittedRate(rows: Array<{
  total_icu_beds: number;
  occupied_icu_beds: number;
  reserved_icu_beds?: number | null;
}>): number | null {
  const total = rows.reduce((sum, row) => sum + (Number(row.total_icu_beds) || 0), 0);
  if (total <= 0) return null;
  const committed = rows.reduce((sum, row) => sum + (Number(row.occupied_icu_beds) || 0) + (Number(row.reserved_icu_beds) || 0), 0);
  return Math.round((committed / total) * 100);
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const [requestsRes, icuRows, bloodRequests] = await Promise.all([
    supabase.from('patient_requests').select('request_id', { count: 'exact', head: true }).eq('data_origin', 'synthetic'),
    fetchAllPages('Could not load ICU inventory', async (from, to) => await supabase.from('icu_inventory')
      .select('icu_inventory_id,total_icu_beds,occupied_icu_beds,reserved_icu_beds')
      .order('icu_inventory_id').range(from, to)),
    fetchAllPages('Could not load synthetic blood requests', async (from, to) => await supabase.from('patient_requests')
      .select('request_id').eq('data_origin', 'synthetic').eq('needs_blood', true)
      .order('request_id').range(from, to))
  ]);
  if (requestsRes.error) throw new Error(`Could not load analytics summary: ${requestsRes.error.message || 'Supabase query failed'}`);
  if (requestsRes.count == null || !Number.isSafeInteger(requestsRes.count) || requestsRes.count < 0) {
    throw new Error('Could not load analytics summary: Supabase returned an invalid synthetic request count.');
  }

  const bloodRequestIds = new Set(bloodRequests.map((row) => row.request_id));
  const assignmentRows = await Promise.all(chunk([...bloodRequestIds], ANALYTICS_PAGE_SIZE).map(async (requestIds) => {
    const { data, error } = await supabase.from('emergency_cases')
      .select('case_id,request_id,assigned_blood_bank_id')
      .eq('confirmation_status', 'confirmed').in('request_id', requestIds).order('case_id');
    if (error) throw new Error(`Could not load confirmed blood assignments: ${error.message}`);
    if (!data) throw new Error('Could not load confirmed blood assignments: Supabase returned no data.');
    return data;
  }));
  const bloodAssignedIds = new Set(assignmentRows.flat()
    .filter((row) => row.assigned_blood_bank_id && bloodRequestIds.has(row.request_id))
    .map((row) => row.request_id));

  return {
    totalRequests: requestsRes.count,
    averageResponseTimeMinutes: null,
    livesSaved: null,
    icuCommittedRate: calculateIcuCommittedRate(icuRows),
    bloodAssignmentRate: bloodRequestIds.size > 0
      ? Math.round((bloodAssignedIds.size / bloodRequestIds.size) * 100)
      : null,
    systemUptimePercent: null
  };
}

export async function getTimeSeriesData(timeRange?: string): Promise<TimeSeriesPoint[]> {
  const rangeDays: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };
  const days = rangeDays[timeRange || '30d'] ?? 30;
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const startIso = start.toISOString();
  const requests = await fetchAllPages('Could not load synthetic request trends', async (from, to) => await supabase.from('patient_requests')
    .select('request_id,created_at').eq('data_origin', 'synthetic').gte('created_at', startIso)
    .order('request_id').range(from, to));

  // Keep the confirmed-case series within the same synthetic scenario set as
  // demand; otherwise real or legacy requests could leak into the prototype chart.
  const requestIds = requests.map((row) => row.request_id);
  const casePages = await Promise.all(chunk(requestIds, ANALYTICS_PAGE_SIZE).map(async (requestIdPage) => {
    const { data, error } = await supabase.from('emergency_cases').select('request_id,created_at')
      .eq('confirmation_status', 'confirmed').gte('created_at', startIso).in('request_id', requestIdPage);
    if (error) throw new Error(`Could not load confirmed synthetic case trends: ${error.message}`);
    if (!data) throw new Error('Could not load confirmed synthetic case trends: Supabase returned no data.');
    return data;
  }));
  const cases = casePages.flat();

  const hourly = days === 1;
  const bucketCount = hourly ? 24 : days;
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const date = new Date(start.getTime() + index * (hourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000));
    return { date, period: hourly ? date.toLocaleTimeString([], { hour: 'numeric' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' }), demand: 0, supply: 0 };
  });
  const countInBucket = (iso: string, key: 'demand' | 'supply') => {
    const value = new Date(iso).getTime();
    const index = Math.floor((value - start.getTime()) / (hourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000));
    if (index >= 0 && index < buckets.length) buckets[index][key] += 1;
  };
  requests.forEach((row) => countInBucket(row.created_at, 'demand'));
  cases.forEach((row) => countInBucket(row.created_at, 'supply'));
  return buckets.map(({ period, demand, supply }) => ({ period, demand, supply }));
}

export async function getResourceUtilization(): Promise<ResourceUtilizationData[]> {
  const data = await fetchAllPages('Could not load ICU capacity', async (from, to) => await supabase
    .from('icu_inventory').select('icu_inventory_id,total_icu_beds,occupied_icu_beds,reserved_icu_beds')
    .order('icu_inventory_id').range(from, to));
  const total = data.reduce((sum, row) => sum + (Number(row.total_icu_beds) || 0), 0);
  const committed = data.reduce((sum, row) => sum + (Number(row.occupied_icu_beds) || 0) + (Number(row.reserved_icu_beds) || 0), 0);
  if (total <= 0) return [];
  return [{ category: 'ICU beds committed', used: committed, total, percentage: Math.round((committed / total) * 100) }];
}
