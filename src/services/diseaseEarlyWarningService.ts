import { supabase } from '../lib/supabase/client';

export interface SyntheticDiseaseObservation {
  district: string;
  syndrome: string;
  observed_on: string;
  case_count: number;
  admission_count: number;
  oxygen_units_consumed: number;
  generated_at: string;
}

export type EarlyWarningLevel = 'normal' | 'watch' | 'elevated' | 'insufficient data';

export interface DiseaseEarlyWarning {
  district: string;
  syndrome: string;
  level: EarlyWarningLevel;
  baselineCasesPerDay: number | null;
  recentCasesPerDay: number | null;
  caseChangePercent: number | null;
  recentAdmissions: number | null;
  baselineOxygenPerDay: number | null;
  recentOxygenPerDay: number | null;
  generatedAt: string | null;
  stale: boolean;
  timeline: Array<Pick<SyntheticDiseaseObservation, 'observed_on' | 'case_count' | 'admission_count' | 'oxygen_units_consumed'>>;
}

function isObservation(value: unknown): value is SyntheticDiseaseObservation {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<SyntheticDiseaseObservation>;
  return ['Synthetic district A', 'Synthetic district B', 'Synthetic district C'].includes(row.district || '')
    && ['Respiratory', 'Gastrointestinal', 'Febrile'].includes(row.syndrome || '')
    && typeof row.observed_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.observed_on)
    && Number.isSafeInteger(row.case_count) && (row.case_count as number) >= 0
    && Number.isSafeInteger(row.admission_count) && (row.admission_count as number) >= 0
    && (row.admission_count as number) <= (row.case_count as number)
    && Number.isSafeInteger(row.oxygen_units_consumed) && (row.oxygen_units_consumed as number) >= 0
    && typeof row.generated_at === 'string' && Number.isFinite(Date.parse(row.generated_at));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_AFTER_MS = DAY_MS;

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function calculateDiseaseEarlyWarnings(
  observations: SyntheticDiseaseObservation[],
  now = new Date()
): DiseaseEarlyWarning[] {
  const groups = new Map<string, SyntheticDiseaseObservation[]>();
  for (const observation of observations) {
    const key = `${observation.district}\u0000${observation.syndrome}`;
    groups.set(key, [...(groups.get(key) || []), observation]);
  }

  return [...groups.values()].map((rows) => {
    rows.sort((a, b) => a.observed_on.localeCompare(b.observed_on));
    const generatedAt = rows.reduce<string | null>((latest, row) =>
      !latest || row.generated_at > latest ? row.generated_at : latest, null);
    const today = now.toISOString().slice(0, 10);
    const recentStart = shiftDate(today, -6);
    const baselineStart = shiftDate(today, -27);
    const baselineEnd = shiftDate(today, -7);
    const recent = rows.filter((row) => row.observed_on >= recentStart && row.observed_on <= today);
    const baseline = rows.filter((row) => row.observed_on >= baselineStart && row.observed_on <= baselineEnd);
    const enoughHistory = recent.length === 7 && baseline.length === 21;
    const recentTotal = recent.reduce((sum, row) => sum + row.case_count, 0);
    const baselineTotal = baseline.reduce((sum, row) => sum + row.case_count, 0);
    const recentAverage = enoughHistory ? recentTotal / recent.length : null;
    const baselineAverage = enoughHistory ? baselineTotal / baseline.length : null;
    const change = baselineAverage && recentAverage != null
      ? ((recentAverage - baselineAverage) / baselineAverage) * 100
      : null;
    const level: EarlyWarningLevel = !enoughHistory
      ? 'insufficient data'
      : change != null && change >= 100 && recentTotal >= 60
        ? 'elevated'
        : change != null && change >= 50 && recentTotal >= 21
          ? 'watch'
          : 'normal';
    const lastGenerated = generatedAt ? new Date(generatedAt).getTime() : Number.NaN;

    return {
      district: rows[0].district,
      syndrome: rows[0].syndrome,
      level,
      baselineCasesPerDay: baselineAverage == null ? null : Number(baselineAverage.toFixed(1)),
      recentCasesPerDay: recentAverage == null ? null : Number(recentAverage.toFixed(1)),
      caseChangePercent: change == null ? null : Math.round(change),
      recentAdmissions: enoughHistory ? recent.reduce((sum, row) => sum + row.admission_count, 0) : null,
      baselineOxygenPerDay: enoughHistory
        ? Number((baseline.reduce((sum, row) => sum + row.oxygen_units_consumed, 0) / baseline.length).toFixed(1))
        : null,
      recentOxygenPerDay: enoughHistory
        ? Number((recent.reduce((sum, row) => sum + row.oxygen_units_consumed, 0) / recent.length).toFixed(1))
        : null,
      generatedAt,
      stale: !Number.isFinite(lastGenerated) || now.getTime() - lastGenerated > STALE_AFTER_MS,
      timeline: rows.map(({ observed_on, case_count, admission_count, oxygen_units_consumed }) => ({
        observed_on, case_count, admission_count, oxygen_units_consumed
      }))
    };
  }).sort((a, b) => {
    const rank: Record<EarlyWarningLevel, number> = { elevated: 0, watch: 1, normal: 2, 'insufficient data': 3 };
    return Number(a.stale) - Number(b.stale)
      || rank[a.level] - rank[b.level]
      || a.district.localeCompare(b.district)
      || a.syndrome.localeCompare(b.syndrome);
  });
}

export async function getSyntheticDiseaseObservations(): Promise<SyntheticDiseaseObservation[]> {
  const { data, error } = await supabase.rpc('get_synthetic_disease_observations', { p_days: 28 });
  if (error) throw new Error(`Could not load synthetic district trends: ${error.message}`);
  if (!Array.isArray(data)) throw new Error('Could not load synthetic district trends: Supabase returned no observations.');
  if (!data.every(isObservation)) throw new Error('Could not load synthetic district trends: the Supabase response failed validation.');
  return data;
}

export async function refreshSyntheticDiseaseDemo(): Promise<number> {
  const { data, error } = await supabase.rpc('refresh_synthetic_disease_demo');
  if (error) throw new Error(`Could not generate synthetic trend data: ${error.message}`);
  if (typeof data !== 'number') throw new Error('Could not generate synthetic trend data: Supabase returned no row count.');
  return data;
}
