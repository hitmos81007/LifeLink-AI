import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  BrainCircuit,
  AlertTriangle,
  CheckCircle2,
  Clock,
  BarChart3,
  RefreshCw,
  Sparkles,
  ShieldAlert,
  Building2,
  Droplet,
  Package,
  Wind,
  Info,
  X
} from 'lucide-react';
import {
  generateAndStoreRealForecasts,
  OperationalForecastItem
} from '../services/predictionService';
import { TransferResourceType } from '../types/database';
import { subscribeToSupabaseRealtime } from '../services/supabaseDataLayer';
import { LoadingState, ErrorState } from './common/EmptyState';

interface OperationalPredictionManagerProps {
  filterHospitalId?: string;
  isGovtAdmin?: boolean;
  title?: string;
  subtitle?: string;
}

export const OperationalPredictionManager: React.FC<OperationalPredictionManagerProps> = ({
  filterHospitalId,
  isGovtAdmin = false,
  title = "Operational Demand Predictions & Stockout Forecasting",
  subtitle = "Deterministic baseline forecasting calculated directly from live Supabase hospital inventory and historical demand logs."
}) => {
  const [forecasts, setForecasts] = useState<OperationalForecastItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [recalculating, setRecalculating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TransferResourceType | 'ALL'>('ALL');

  // Gemini AI Explanation Modal State
  const [selectedForecast, setSelectedForecast] = useState<OperationalForecastItem | null>(null);
  const [explaining, setExplaining] = useState<boolean>(false);
  const [explanationText, setExplanationText] = useState<string | null>(null);

  const fetchRealForecasts = async (isManualRecalc = false) => {
    if (isManualRecalc) {
      setRecalculating(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await generateAndStoreRealForecasts(filterHospitalId);
      setForecasts(data);
    } catch (err: any) {
      console.error('Fetch real forecasts error:', err);
      setError('Failed to calculate live demand predictions from Supabase inventory.');
    } finally {
      setLoading(false);
      setRecalculating(false);
    }
  };

  useEffect(() => {
    fetchRealForecasts();

    const unsubscribe = subscribeToSupabaseRealtime(
      [
        'prediction_history',
        'icu_inventory',
        'general_bed_inventory',
        'oxygen_inventory',
        'medicine_inventory',
        'blood_inventory',
        'patient_requests'
      ],
      () => fetchRealForecasts()
    );

    return () => unsubscribe();
  }, [filterHospitalId]);

  const handleExplainWithGemini = async (item: OperationalForecastItem) => {
    setSelectedForecast(item);
    setExplaining(true);
    setExplanationText(null);

    try {
      const res = await fetch('/api/ai/explain-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hospitalName: item.hospital_name,
          resourceType: item.resource_type,
          currentQuantity: item.current_quantity,
          predictedDemand24h: item.predicted_demand_24h,
          predictedDemand7d: item.predicted_demand_7d,
          confidenceScore: item.confidence_score,
          shortageRisk: item.shortage_risk,
          modelVersion: item.prediction_model,
          lastCalculated: new Date(item.last_calculated).toLocaleString()
        })
      });

      const data = await res.json();
      if (data.success && data.explanation) {
        setExplanationText(data.explanation);
      } else {
        setExplanationText(
          `Operational Forecast Summary for ${item.hospital_name}: Current stock is ${item.current_quantity} unit(s) vs 24-hour predicted demand of ${item.predicted_demand_24h} unit(s) (${item.shortage_risk} Risk Level, ${item.confidence_score}% Confidence).\n\n*Note: Operational baseline forecast for decision support. Not clinically validated.*`
        );
      }
    } catch (err: any) {
      setExplanationText(
        `Analysis for ${item.hospital_name}: Available ${item.resource_type} is ${item.current_quantity} units against a 24h demand projection of ${item.predicted_demand_24h} units (${item.shortage_risk} Risk).\n\n*Note: Operational baseline forecast for decision support. Not clinically validated.*`
      );
    } finally {
      setExplaining(false);
    }
  };

  const getRiskBadge = (risk: 'Critical' | 'High' | 'Medium' | 'Low') => {
    switch (risk) {
      case 'Critical':
        return 'bg-rose-950 text-rose-300 border-rose-800 animate-pulse';
      case 'High':
        return 'bg-amber-950 text-amber-300 border-amber-800';
      case 'Medium':
        return 'bg-blue-950 text-blue-300 border-blue-800';
      case 'Low':
      default:
        return 'bg-emerald-950 text-emerald-300 border-emerald-800';
    }
  };

  const filteredForecasts = forecasts.filter((f) => {
    if (activeTab === 'ALL') return true;
    return f.resource_type === activeTab;
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-6 shadow-2xl">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <TrendingUp className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-black text-white">{title}</h2>
            <span className="bg-purple-950 text-purple-300 border border-purple-800 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
              Operational Baseline Forecast
            </span>
            <span className="bg-amber-950/80 text-amber-300 border border-amber-800 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
              Not Clinically Validated
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => fetchRealForecasts(true)}
            disabled={recalculating || loading}
            className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white border border-purple-500 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-purple-950/50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${recalculating ? 'animate-spin' : ''}`} />
            <span>{recalculating ? 'Recalculating...' : 'Recalculate Forecasts'}</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        {(['ALL', 'ICU Beds', 'General Beds', 'Oxygen', 'Medicine', 'Blood'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer border ${
              activeTab === tab
                ? 'bg-purple-950 text-purple-200 border-purple-700'
                : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            {tab === 'ALL' ? 'All Resources' : tab}
          </button>
        ))}
      </div>

      {/* Main Content */}
      {loading ? (
        <LoadingState message="Calculating operational demand forecasts from Supabase inventory..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchRealForecasts()} />
      ) : filteredForecasts.length === 0 ? (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-8 text-center space-y-2">
          <BrainCircuit className="w-8 h-8 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-white">No Inventory Data for Forecast Calculation</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Add or update bed, oxygen, or medicine inventories to generate deterministic stockout predictions.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredForecasts.map((item, idx) => {
            const deficit24h = item.predicted_demand_24h - item.current_quantity;
            const isDeficit = deficit24h > 0;

            return (
              <div
                key={`${item.hospital_id}-${item.resource_type}-${idx}`}
                className="bg-slate-950 border border-slate-800 hover:border-slate-700 p-4 rounded-2xl space-y-3 transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Item Header */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-mono font-bold">
                        {item.hospital_name} ({item.district})
                      </div>
                      <h3 className="font-bold text-white text-sm flex items-center gap-1.5 pt-0.5">
                        <span>{item.resource_type}</span>
                      </h3>
                    </div>

                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getRiskBadge(item.shortage_risk)}`}>
                      {item.shortage_risk} Risk
                    </span>
                  </div>

                  {/* Stock vs Demand Metric Comparison */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-900/90 p-3 rounded-xl border border-slate-800/80 text-center">
                    <div>
                      <div className="text-[9px] text-slate-400 font-mono font-bold uppercase">Current Stock</div>
                      <div className="text-sm font-black text-white pt-0.5">{item.current_quantity}</div>
                    </div>

                    <div className="border-x border-slate-800/80 px-1">
                      <div className="text-[9px] text-purple-400 font-mono font-bold uppercase">24h Demand</div>
                      <div className="text-sm font-black text-purple-300 pt-0.5">{item.predicted_demand_24h}</div>
                    </div>

                    <div>
                      <div className="text-[9px] text-sky-400 font-mono font-bold uppercase">7d Demand</div>
                      <div className="text-sm font-black text-sky-300 pt-0.5">{item.predicted_demand_7d}</div>
                    </div>
                  </div>

                  {/* Deficit / Reserve Status */}
                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="text-slate-400 text-[11px]">24h Stock Gap:</span>
                    {isDeficit ? (
                      <span className="text-rose-400 font-bold font-mono">
                        Shortage of -{deficit24h} unit(s)
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-bold font-mono">
                        Surplus +{Math.abs(deficit24h)} unit(s)
                      </span>
                    )}
                  </div>

                  {/* Confidence Bar & Model Info */}
                  <div className="space-y-1 bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/50 text-[11px]">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-400">Data Confidence Score</span>
                      <span className="font-mono font-bold text-sky-300">{item.confidence_score.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-sky-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, item.confidence_score)}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[9px] text-slate-500 pt-1 font-mono">
                      <span>Model: {item.prediction_model}</span>
                      <span>Calc: {new Date(item.last_calculated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </div>

                {/* Explain with Gemini AI Button */}
                <div className="pt-2 border-t border-slate-800/60">
                  <button
                    onClick={() => handleExplainWithGemini(item)}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-purple-300 hover:text-purple-200 border border-purple-900/60 hover:border-purple-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>Explain Forecast with Gemini AI</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Gemini AI Explanation Modal */}
      {selectedForecast && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <h3 className="font-bold text-white text-sm">
                  Gemini Forecast Analysis: {selectedForecast.resource_type}
                </h3>
              </div>
              <button
                onClick={() => setSelectedForecast(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1 text-xs">
              <div className="flex justify-between font-mono text-[11px]">
                <span className="text-slate-400">Facility: {selectedForecast.hospital_name}</span>
                <span className="text-purple-300 font-bold">24h Demand: {selectedForecast.predicted_demand_24h}</span>
              </div>
              <div className="flex justify-between font-mono text-[11px]">
                <span className="text-slate-400">Current Stock: {selectedForecast.current_quantity}</span>
                <span className="text-sky-300 font-bold">7d Demand: {selectedForecast.predicted_demand_7d}</span>
              </div>
            </div>

            {explaining ? (
              <div className="py-8 text-center space-y-2">
                <RefreshCw className="w-6 h-6 text-purple-400 animate-spin mx-auto" />
                <p className="text-xs text-slate-300 font-bold">
                  Gemini 3.6 Flash analyzing database forecast values...
                </p>
                <p className="text-[10px] text-slate-500">Evaluating stock ratios without altering database quantities.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-slate-200 text-xs leading-relaxed whitespace-pre-wrap font-sans">
                  {explanationText}
                </div>

                <p className="text-[10px] text-slate-500 italic text-center">
                  Demonstration forecast for operational decision support. Not clinically validated.
                </p>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedForecast(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
