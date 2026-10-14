import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  calculateDiseaseEarlyWarnings,
  DiseaseEarlyWarning,
  getSyntheticDiseaseObservations,
  refreshSyntheticDiseaseDemo,
  SyntheticDiseaseObservation
} from '../../services/diseaseEarlyWarningService';
import { subscribeToSupabaseRealtime } from '../../services/supabaseDataLayer';

const levelClasses: Record<DiseaseEarlyWarning['level'], string> = {
  elevated: 'border-rose-700 bg-rose-950/40 text-rose-200',
  watch: 'border-amber-700 bg-amber-950/40 text-amber-200',
  normal: 'border-emerald-800 bg-emerald-950/30 text-emerald-200',
  'insufficient data': 'border-slate-700 bg-slate-900 text-slate-300'
};

export const SyntheticDiseaseEarlyWarningPanel: React.FC = () => {
  const [observations, setObservations] = useState<SyntheticDiseaseObservation[]>([]);
  const [warnings, setWarnings] = useState<DiseaseEarlyWarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getSyntheticDiseaseObservations();
      setObservations(rows);
      setWarnings(calculateDiseaseEarlyWarnings(rows));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load synthetic district trends.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return subscribeToSupabaseRealtime(['synthetic_disease_observations'], () => { void load(); });
  }, [load]);

  const regenerate = async () => {
    setRefreshing(true);
    setNotice(null);
    try {
      const refreshedRows = await refreshSyntheticDiseaseDemo();
      const rows = await getSyntheticDiseaseObservations();
      setObservations(rows);
      setWarnings(calculateDiseaseEarlyWarnings(rows));
      setError(null);
      setNotice(`Generated ${refreshedRows} synthetic aggregate observations in Supabase.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate synthetic trend data.');
    } finally {
      setRefreshing(false);
    }
  };

  const elevatedCount = warnings.filter((warning) => !warning.stale && warning.level === 'elevated').length;
  const watchCount = warnings.filter((warning) => !warning.stale && warning.level === 'watch').length;
  const staleCount = warnings.filter((warning) => warning.stale).length;

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 space-y-5" aria-labelledby="synthetic-disease-warning-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-fuchsia-300" />
            <h2 id="synthetic-disease-warning-title" className="text-base font-black text-white">Synthetic District Trend Early-Warning</h2>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-400">
            Aggregate demonstration counts compare a 7-day window with the preceding 21-day baseline. Elevated means at least a 100% increase and 60 recent reports; watch means at least a 50% increase and 21 reports. Signals are not diagnoses or confirmed outbreaks. No patient-level data or live public-health feed is used; official public-health confirmation is required.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void regenerate()}
          disabled={refreshing || loading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Generating demo data…' : 'Regenerate synthetic trend'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-full border border-rose-800 bg-rose-950/40 px-3 py-1.5 text-rose-200">Elevated signals: {elevatedCount}</span>
        <span className="rounded-full border border-amber-800 bg-amber-950/40 px-3 py-1.5 text-amber-200">Watch signals: {watchCount}</span>
        <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-300">Stale datasets: {staleCount}</span>
        <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-300">Synthetic observations: {observations.length}</span>
      </div>

      {notice && <p className="rounded-lg border border-emerald-800 bg-emerald-950/40 p-3 text-xs text-emerald-200" role="status">{notice}</p>}
      {error && (
        <div className="rounded-lg border border-rose-800 bg-rose-950/40 p-3 text-xs text-rose-200" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void load()} className="mt-2 font-bold underline underline-offset-2">Retry trend load</button>
        </div>
      )}
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-400" role="status">Loading aggregate synthetic trends…</p>
      ) : warnings.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 text-center">
          <p className="text-sm font-bold text-white">No synthetic trend observations are available.</p>
          <p className="mt-1 text-xs text-slate-400">Regenerate the demo trend after applying the matching Supabase migration.</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {warnings.map((warning) => (
            <article key={`${warning.district}-${warning.syndrome}`} className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-white">{warning.district} · {warning.syndrome}</h3>
                  <p className="mt-1 text-[10px] text-slate-500">28-day synthetic aggregate window</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${warning.stale ? levelClasses['insufficient data'] : levelClasses[warning.level]}`}>
                  {warning.stale ? `stale · prior ${warning.level}` : warning.level}
                </span>
              </div>

              {warning.stale && (
                <p className="flex items-center gap-2 rounded-lg border border-amber-800 bg-amber-950/30 p-2 text-[11px] text-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> Demo dataset is older than 24 hours. Regenerate before interpreting the trend.
                </p>
              )}

              {warning.level === 'insufficient data' ? (
                <p className="text-xs text-slate-400">At least 14 baseline days and 7 recent days are required; no tier is inferred.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <Metric label="21-day baseline / day" value={warning.baselineCasesPerDay} />
                    <Metric label="Recent 7-day / day" value={warning.recentCasesPerDay} />
                    <Metric label="Change from baseline" value={warning.caseChangePercent == null ? null : `${warning.caseChangePercent}%`} />
                    <Metric label="Recent admissions" value={warning.recentAdmissions} />
                  </div>
                  <div className="h-44 w-full" aria-label={`28-day synthetic case and admission trend for ${warning.district}, ${warning.syndrome}`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={warning.timeline}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="observed_on" stroke="#94a3b8" fontSize={9} tickFormatter={(value: string) => value.slice(5)} minTickGap={24} />
                        <YAxis stroke="#94a3b8" fontSize={9} allowDecimals={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Area type="monotone" dataKey="case_count" stroke="#e879f9" fill="#e879f9" fillOpacity={0.14} name="Synthetic case reports" />
                        <Area type="monotone" dataKey="admission_count" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.12} name="Synthetic admissions" />
                        <Area type="monotone" dataKey="oxygen_units_consumed" stroke="#fbbf24" fill="#fbbf24" fillOpacity={0.08} name="Synthetic oxygen-use proxy" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3 text-[10px] text-slate-400">
                    <span>Oxygen-use proxy: {warning.baselineOxygenPerDay} → {warning.recentOxygenPerDay} synthetic units/day</span>
                    <span>{warning.generatedAt ? `Generated ${new Date(warning.generatedAt).toLocaleString()}` : 'Generation time unavailable'}</span>
                  </div>
                  <p className="flex items-start gap-2 text-[10px] leading-relaxed text-slate-500">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    Threshold-based illustration only; trend counts and oxygen-use values are synthetic and not clinically validated.
                  </p>
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

const Metric: React.FC<{ label: string; value: number | string | null }> = ({ label, value }) => (
  <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5">
    <p className="text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 font-mono text-sm font-bold text-slate-100">{value == null ? 'Unavailable' : value}</p>
  </div>
);
