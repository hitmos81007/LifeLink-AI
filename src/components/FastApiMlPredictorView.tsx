import React, { useState, useEffect } from 'react';
import {
  BrainCircuit,
  Droplet,
  Building2,
  Wind,
  Send,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Zap,
  BarChart2,
  History
} from 'lucide-react';
import { getPredictionHistory, createPredictionRecord } from '../services/predictionService';
import { PredictionHistoryTable, TransferResourceType, PredictionModel } from '../types/database';
import { subscribeToSupabaseRealtime } from '../services/supabaseDataLayer';
import { EmptyState, LoadingState, ErrorState } from './common/EmptyState';

export const FastApiMlPredictorView: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [predictions, setPredictions] = useState<PredictionHistoryTable[]>([]);

  // Form State matching Database Version 1.0 `prediction_history`
  const [hospitalId, setHospitalId] = useState('10000000-0000-0000-0000-000000000001');
  const [resourceType, setResourceType] = useState<TransferResourceType>('Oxygen');
  const [currentQty, setCurrentQty] = useState(850);
  const [predictedDemand, setPredictedDemand] = useState(1200);
  const [confidenceScore, setConfidenceScore] = useState(94.5);
  const [predictionModel, setPredictionModel] = useState<PredictionModel>('LSTM');
  const [predictionDate, setPredictionDate] = useState(new Date().toISOString().split('T')[0]);

  const triggerToast = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPredictionHistory();
      setPredictions(data);
    } catch (err: any) {
      console.error('FastApiMlPredictorView load error:', err);
      setError('Failed to fetch prediction history from Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const unsubscribe = subscribeToSupabaseRealtime(['prediction_history'], () => fetchData());
    return () => unsubscribe();
  }, []);

  const handleCreatePrediction = async (e: React.FormEvent) => {
    e.preventDefault();

    setSubmitting(true);
    try {
      await createPredictionRecord({
        hospital_id: hospitalId,
        resource_type: resourceType,
        current_quantity: currentQty,
        predicted_demand: predictedDemand,
        confidence_score: confidenceScore,
        prediction_model: predictionModel,
        prediction_date: predictionDate
      });

      triggerToast('New ML prediction record logged in prediction_history table!');
      await fetchData();
    } catch (err: any) {
      alert('Failed to log prediction: ' + err.message);
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
          <div className="flex items-center gap-2 flex-wrap">
            <BrainCircuit className="w-6 h-6 text-purple-400" />
            <h1 className="text-xl font-black text-white">Demand Prediction Simulation Sandbox</h1>
            <span className="bg-purple-950 text-purple-300 border border-purple-800 text-xs px-2.5 py-0.5 rounded-full font-mono font-bold">
              Demonstration Forecast
            </span>
            <span className="bg-amber-950 text-amber-300 border border-amber-800 text-xs px-2.5 py-0.5 rounded-full font-mono font-bold">
              Not Clinically Validated
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Demonstration forecasting sandbox powering interactive ML simulation. For live operational hospital forecasts, access the authenticated Hospital or Government dashboard.
          </p>
        </div>

        <button
          onClick={fetchData}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl cursor-pointer transition-all flex items-center gap-1.5 text-xs font-bold shrink-0"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Sync Predictions</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Prediction Input Form */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-6">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-400" />
              <span>Log ML Demand Forecast</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">Generate or record predictive resource demand.</p>
          </div>

          <form onSubmit={handleCreatePrediction} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Target Hospital ID (hospital_id)</label>
              <input
                type="text"
                required
                value={hospitalId}
                onChange={(e) => setHospitalId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Resource Type</label>
                <select
                  value={resourceType}
                  onChange={(e) => setResourceType(e.target.value as TransferResourceType)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white"
                >
                  <option value="Oxygen">Oxygen</option>
                  <option value="Blood">Blood</option>
                  <option value="Medicine">Medicine</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">ML Model</label>
                <select
                  value={predictionModel}
                  onChange={(e) => setPredictionModel(e.target.value as PredictionModel)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono"
                >
                  <option value="LSTM">LSTM</option>
                  <option value="XGBoost">XGBoost</option>
                  <option value="RandomForest">RandomForest</option>
                  <option value="Prophet">Prophet</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Current Qty</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={currentQty}
                  onChange={(e) => setCurrentQty(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Predicted Demand</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={predictedDemand}
                  onChange={(e) => setPredictedDemand(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Confidence Score (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  required
                  value={confidenceScore}
                  onChange={(e) => setConfidenceScore(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Prediction Date</label>
                <input
                  type="date"
                  required
                  value={predictionDate}
                  onChange={(e) => setPredictionDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>{submitting ? 'Saving Prediction...' : 'Submit Prediction Record'}</span>
            </button>
          </form>
        </div>

        {/* Prediction History Records Stream */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-6">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <History className="w-5 h-5 text-purple-400" />
              <span>Prediction History Stream (`prediction_history`)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">Queried directly from Database Version 1.0 prediction history table.</p>
          </div>

          {loading ? (
            <LoadingState message="Loading predictions from Supabase..." />
          ) : error ? (
            <ErrorState message={error} onRetry={fetchData} />
          ) : predictions.length === 0 ? (
            <EmptyState icon={BrainCircuit} title="No prediction history." description="No ML demand forecasts logged in prediction_history yet." />
          ) : (
            <div className="space-y-4">
              {predictions.map((p) => {
                const deficit = p.predicted_demand - p.current_quantity;
                return (
                  <div key={p.prediction_id} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-white text-sm font-mono">{p.resource_type} Demand Forecast</span>
                      <span className="px-2.5 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded font-bold text-[10px] font-mono">
                        Model: {p.prediction_model} | Confidence: {p.confidence_score}%
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                      <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                        <span className="text-slate-500 block text-[9px] uppercase">Current Qty</span>
                        <span className="text-slate-200 font-bold">{p.current_quantity}</span>
                      </div>
                      <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                        <span className="text-slate-500 block text-[9px] uppercase">Predicted Demand</span>
                        <span className="text-purple-300 font-bold">{p.predicted_demand}</span>
                      </div>
                      <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                        <span className="text-slate-500 block text-[9px] uppercase">Net Shift</span>
                        <span className={deficit > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                          {deficit > 0 ? `+${deficit} Shortage` : `${Math.abs(deficit)} Surplus`}
                        </span>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-500 font-mono">
                      Hospital ID: {p.hospital_id} | Date: {p.prediction_date}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
