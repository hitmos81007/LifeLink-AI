import React, { useState, useEffect } from 'react';
import {
  Brain,
  Send,
  Loader2,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Award
} from 'lucide-react';
import { getAIRecommendations, createAIRecommendation } from '../services/aiRecommendationService';
import { AIRecommendationTable } from '../types/database';
import { subscribeToSupabaseRealtime } from '../services/supabaseDataLayer';
import { EmptyState, LoadingState, ErrorState } from './common/EmptyState';

export const HospitalRecommendationEngineView: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [recommendations, setRecommendations] = useState<AIRecommendationTable[]>([]);

  // Inputs strictly mapping to Database Version 1.0 `ai_recommendations`
  const [patientRequestId, setPatientRequestId] = useState('req00000-0000-0000-0000-000000000001');
  const [recommendedHospitalId, setRecommendedHospitalId] = useState('10000000-0000-0000-0000-000000000001');
  const [confidenceScore, setConfidenceScore] = useState(98.5);
  const [reason, setReason] = useState('Proximity within 3.2km, 10 open ICU beds, adequate O- blood supply, and trauma center level 1 capability.');

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
      await createAIRecommendation({
        request_id: patientRequestId,
        hospital_id: recommendedHospitalId,
        confidence_score: confidenceScore,
        recommendation_reason: reason
      });

      triggerToast('New AI hospital recommendation recorded in ai_recommendations table!');
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
            <h1 className="text-xl font-black text-white">AI Recommendations Engine (`ai_recommendations`)</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Automated hospital matching powered by Supabase <code className="text-emerald-400 font-mono">ai_recommendations</code> records.
          </p>
        </div>

        <button
          onClick={fetchData}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl cursor-pointer transition-all flex items-center gap-1.5 text-xs font-bold"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Sync Engine</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recommendation Input Form */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-6">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <span>Log AI Recommendation</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">Match emergency requests to optimal hospitals.</p>
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

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Recommended Hospital ID (hospital_id)</label>
              <input
                type="text"
                required
                value={recommendedHospitalId}
                onChange={(e) => setRecommendedHospitalId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Confidence Score (0.00 - 100.00)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                required
                value={confidenceScore}
                onChange={(e) => setConfidenceScore(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Match Reason (recommendation_reason)</label>
              <textarea
                required
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>{submitting ? 'Generating Match...' : 'Save Recommendation Record'}</span>
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
                    <span className="font-extrabold text-white text-sm">Confidence Score: <strong className="text-emerald-400 font-mono text-base">{rec.confidence_score}%</strong></span>
                    <span className="text-[10px] text-slate-500 font-mono">{new Date(rec.created_at).toLocaleString()}</span>
                  </div>

                  <p className="text-slate-300 text-xs bg-slate-900 p-3 rounded-xl border border-slate-800">
                    "{rec.recommendation_reason}"
                  </p>

                  <div className="flex flex-wrap gap-4 text-[10px] text-slate-400 font-mono pt-1">
                    <span>Patient Request ID: <strong className="text-slate-200">{rec.request_id}</strong></span>
                    <span>Hospital ID: <strong className="text-slate-200">{rec.hospital_id}</strong></span>
                    <span>Distance: <strong className="text-slate-200">{rec.distance_km} km ({rec.eta_minutes} mins)</strong></span>
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
