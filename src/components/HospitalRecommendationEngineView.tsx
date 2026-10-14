import React, { useState, useEffect } from 'react';
import {
  Brain,
  Loader2,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Award
} from 'lucide-react';
import { getAIRecommendations, generateRecommendationsForSyntheticRequestId } from '../services/aiRecommendationService';
import { AIRecommendationTable } from '../types/database';
import { subscribeToSupabaseRealtime } from '../services/supabaseDataLayer';
import { EmptyState, LoadingState, ErrorState } from './common/EmptyState';

export const HospitalRecommendationEngineView: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [recommendations, setRecommendations] = useState<AIRecommendationTable[]>([]);

  const [patientRequestId, setPatientRequestId] = useState('');

  const triggerToast = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAIRecommendations();
      setRecommendations(data);
    } catch (err: any) {
      console.error('HospitalRecommendationEngineView load error:', err);
      setError('Failed to fetch AI recommendations from Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const unsubscribe = subscribeToSupabaseRealtime(['ai_recommendations'], () => fetchData());
    return () => unsubscribe();
  }, []);

  const handleGenerateRecommendation = async (e: React.FormEvent) => {
    e.preventDefault();

    setSubmitting(true);
    try {
      const generated = await generateRecommendationsForSyntheticRequestId(patientRequestId.trim());
      setRecommendations((current) => [
        ...generated,
        ...current.filter((item) => item.request_id !== patientRequestId.trim())
      ]);
      triggerToast(generated.length
        ? 'Supabase refreshed the advisory suggestions. A clinician must review before any assignment.'
        : 'The request has no compatible facility candidates in current inventory.');
      await fetchData();
    } catch (err: any) {
      alert('Failed to log recommendation: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6 rounded-2xl border border-slate-800 shadow-2xl">
      {/* Toast Notification */}
      {actionSuccess && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border border-emerald-400 text-xs font-bold animate-bounce">
          <CheckCircle2 className="w-5 h-5" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="w-6 h-6 text-emerald-400" />
            <h1 className="text-xl font-black text-white">Facility Recommendation Review</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Supabase calculates synthetic scenario fit suggestions from current inventory. Scores are heuristic, not probabilities or clinical judgments.
          </p>
        </div>

        <button
          onClick={fetchData}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl cursor-pointer transition-all flex items-center gap-1.5 text-xs font-bold"
        >
          <RefreshCw className="w-4 h-4" />
              <span>Refresh Records</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recommendation Input Form */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-6">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <span>Refresh Advisory Suggestions</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">Enter a synthetic request ID. Supabase checks eligibility and computes candidates; this form cannot submit a hospital or score.</p>
          </div>

          <form onSubmit={handleGenerateRecommendation} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Patient Request ID (request_id)</label>
              <input
                type="text"
                required
                value={patientRequestId}
                onChange={(e) => setPatientRequestId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !patientRequestId.trim()}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span>{submitting ? 'Refreshing Suggestions...' : 'Refresh Suggestions'}</span>
            </button>
          </form>
        </div>

        {/* AI Recommendations Stream */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-6">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <Award className="w-5 h-5 text-emerald-400" />
              <span>Recommendations Log (`ai_recommendations`)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">Stored matching records from Supabase database.</p>
          </div>

          {loading ? (
            <LoadingState message="Loading recommendations from Supabase..." />
          ) : error ? (
            <ErrorState message={error} onRetry={fetchData} />
          ) : recommendations.length === 0 ? (
            <EmptyState icon={Brain} title="No AI recommendations." description="No hospital recommendation records logged yet." />
          ) : (
            <div className="space-y-4">
              {recommendations.map((rec) => (
                <div key={rec.recommendation_id} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-white text-sm">Heuristic fit (not probability): <strong className="text-emerald-400 font-mono text-base">{rec.confidence_score}/100</strong></span>
                    <span className="text-[10px] text-slate-500 font-mono">{new Date(rec.created_at).toLocaleString()}</span>
                  </div>

                  <p className="text-slate-300 text-xs bg-slate-900 p-3 rounded-xl border border-slate-800">
                    "{rec.recommendation_reason}"
                  </p>

                  <div className="flex flex-wrap gap-4 text-[10px] text-slate-400 font-mono pt-1">
                    <span>Patient Request ID: <strong className="text-slate-200">{rec.request_id}</strong></span>
                    <span>Hospital ID: <strong className="text-slate-200">{rec.hospital_id}</strong></span>
                    <span>Distance / ETA: <strong className="text-slate-200">{rec.distance_km == null ? 'Unavailable' : `${rec.distance_km} km / ${rec.eta_minutes ?? 'not calculated'} min estimate`}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
