import React, { useState } from 'react';
import { 
  Sparkles, 
  MapPin,
  MessageSquare,
  Binary,
  BarChart3,
  Building2,
  ShieldAlert
} from 'lucide-react';
import { HealthcareChatAssistant } from './HealthcareChatAssistant';
import { FastApiMlPredictorView } from './FastApiMlPredictorView';
import { HospitalRecommendationEngineView } from './HospitalRecommendationEngineView';
import { GoogleMapsEmergencyView } from './GoogleMapsEmergencyView';
import { AnalyticsDashboardView } from './AnalyticsDashboardView';

export const AiSimulatorView: React.FC = () => {
  const [mode, setMode] = useState<'analytics' | 'gmaps' | 'recommend' | 'chat' | 'ml_predict'>('analytics');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight">Gemini 3.6 Flash Healthcare Logistics Analytics & Decision Support</h2>
              <span className="px-2 py-0.5 text-[10px] mono font-bold rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                Advisory Only • Non-Authoritative
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Live Hospital Telemetry, GIS Mapping, Machine Learning Inspection, & Clinical Chat Assistant</p>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <button
            onClick={() => setMode('analytics')}
            className={`px-2.5 py-1 text-[10px] mono rounded transition-colors flex items-center gap-1 cursor-pointer shrink-0 ${
              mode === 'analytics'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-emerald-300" />
            1. Analytics Dashboard
          </button>
          <button
            onClick={() => setMode('gmaps')}
            className={`px-2.5 py-1 text-[10px] mono rounded transition-colors flex items-center gap-1 cursor-pointer shrink-0 ${
              mode === 'gmaps'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-rose-300" />
            2. Google Maps GIS
          </button>
          <button
            onClick={() => setMode('recommend')}
            className={`px-2.5 py-1 text-[10px] mono rounded transition-colors flex items-center gap-1 cursor-pointer shrink-0 ${
              mode === 'recommend'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-amber-300" />
            3. Hospital Recommender Preview
          </button>
          <button
            onClick={() => setMode('chat')}
            className={`px-2.5 py-1 text-[10px] mono rounded transition-colors flex items-center gap-1 cursor-pointer shrink-0 ${
              mode === 'chat'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-cyan-300" />
            4. AI Chat Assistant
          </button>
          <button
            onClick={() => setMode('ml_predict')}
            className={`px-2.5 py-1 text-[10px] mono rounded transition-colors flex items-center gap-1 cursor-pointer shrink-0 ${
              mode === 'ml_predict'
                ? 'bg-emerald-600 text-white font-bold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Binary className="w-3.5 h-3.5" />
            5. FastAPI ML Architecture
          </button>
        </div>
      </div>

      {/* Safety Policy Notice */}
      <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-lg p-3 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
        <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">GAP-56 Safety Boundary:</span> AI predictions and models are strictly advisory. Automated diagnosis, triage urgency determination, and database mutations are restricted to authorized human clinicians and verified administrators.
        </div>
      </div>

      {/* Mode ANALYTICS: Comprehensive Recharts Analytics Dashboard */}
      {mode === 'analytics' && (
        <div className="py-2">
          <AnalyticsDashboardView />
        </div>
      )}

      {/* Mode GMAPS: Google Maps Interactive Emergency Map */}
      {mode === 'gmaps' && (
        <div className="py-2">
          <GoogleMapsEmergencyView />
        </div>
      )}

      {/* Mode Recommend: AI Hospital Recommendation Engine Preview */}
      {mode === 'recommend' && (
        <div className="py-2">
          <HospitalRecommendationEngineView />
        </div>
      )}

      {/* Mode Chat: Gemini AI Healthcare Chat Assistant */}
      {mode === 'chat' && (
        <div className="py-2">
          <HealthcareChatAssistant />
        </div>
      )}

      {/* Mode ML: FastAPI Machine Learning Predictor Architecture */}
      {mode === 'ml_predict' && (
        <div className="py-2">
          <FastApiMlPredictorView />
        </div>
      )}
    </div>
  );
};
