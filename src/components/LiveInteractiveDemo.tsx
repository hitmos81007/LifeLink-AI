import React, { useState } from 'react';
import {
  Sparkles,
  Ambulance,
  MessageSquare,
  BarChart3,
  MapPin
} from 'lucide-react';
import { HealthcareChatAssistant } from './HealthcareChatAssistant';
import { GoogleMapsEmergencyView } from './GoogleMapsEmergencyView';
import { AnalyticsDashboardView } from './AnalyticsDashboardView';

export const LiveInteractiveDemo: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'analytics' | 'map' | 'chat' | 'dispatch'>('analytics');
  const [trafficLightsOverride, setTrafficLightsOverride] = useState(false);

  return (
    <section className="py-20 bg-slate-100 relative border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3 mb-12">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-xs font-bold uppercase tracking-wider mono">
              Live Sandbox • Try LifeLink AI
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Interactive Healthcare Operations Sandbox
          </h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-normal">
            Explore real-time hospital telemetry, emergency GIS routing, and decision-support assistance.
          </p>
        </div>

        {/* Interactive Widget Box */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-lg max-w-4xl mx-auto">
          
          {/* Tab Selection */}
          <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-4 mb-6">
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-2 ${
                activeTab === 'analytics'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              <span>📊 Recharts Analytics Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('map')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-2 ${
                activeTab === 'map'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <MapPin className="w-4 h-4 text-rose-300" />
              <span>🗺️ Live Google Maps GIS</span>
            </button>

            <button
              onClick={() => setActiveTab('chat')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-2 ${
                activeTab === 'chat'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>💬 Gemini AI Informational Assistant</span>
            </button>

            <button
              onClick={() => setActiveTab('dispatch')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-2 ${
                activeTab === 'dispatch'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Ambulance className="w-4 h-4 text-emerald-500" />
              <span>🚦 Emergency Corridor Telemetry</span>
            </button>
          </div>

          {/* Tab Analytics: Recharts Comprehensive Analytics */}
          {activeTab === 'analytics' && (
            <div className="pt-2">
              <AnalyticsDashboardView />
            </div>
          )}

          {/* Tab Map: Google Maps GIS */}
          {activeTab === 'map' && (
            <div className="pt-2">
              <GoogleMapsEmergencyView />
            </div>
          )}

          {/* Tab Chat: AI Healthcare Chat Assistant */}
          {activeTab === 'chat' && (
            <div className="pt-2">
              <HealthcareChatAssistant />
            </div>
          )}

          {/* Tab Dispatch: Corridor Telemetry & Preemption Simulation */}
          {activeTab === 'dispatch' && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Green Corridor Signal Preemption Simulation</h4>
                  <p className="text-xs text-slate-500">Overrides city traffic signals along simulated ambulance trajectory.</p>
                </div>
                <button
                  onClick={() => setTrafficLightsOverride(!trafficLightsOverride)}
                  className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    trafficLightsOverride
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  {trafficLightsOverride ? 'PREEMPTION ACTIVE 🟢' : 'TOGGLE OVERRIDE'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                <div className="bg-white border border-slate-200 p-3.5 rounded-lg">
                  <p className="text-xs text-slate-500 font-medium">Origin</p>
                  <p className="text-xs font-bold text-slate-900 mt-0.5">District 4 Incident Site</p>
                </div>
                <div className="bg-white border border-slate-200 p-3.5 rounded-lg">
                  <p className="text-xs text-slate-500 font-medium">Destination</p>
                  <p className="text-xs font-bold text-slate-900 mt-0.5">Central Trauma ER</p>
                </div>
                <div className="bg-white border border-slate-200 p-3.5 rounded-lg">
                  <p className="text-xs text-slate-500 font-medium">Calculated ETA</p>
                  <p className={`text-xs font-bold mt-0.5 mono ${trafficLightsOverride ? 'text-emerald-600' : 'text-slate-700'}`}>
                    {trafficLightsOverride ? '3.8 mins (Saved 4.2m)' : '8.0 mins (Standard)'}
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </section>
  );
};
