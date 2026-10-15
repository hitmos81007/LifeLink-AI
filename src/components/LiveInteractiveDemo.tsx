import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  Sparkles,
  Ambulance,
  MessageSquare,
  BarChart3,
  MapPin
} from 'lucide-react';

const HealthcareChatAssistant = lazy(() => import('./HealthcareChatAssistant').then((module) => ({ default: module.HealthcareChatAssistant })));
const GoogleMapsEmergencyView = lazy(() => import('./GoogleMapsEmergencyView').then((module) => ({ default: module.GoogleMapsEmergencyView })));
const AnalyticsDashboardView = lazy(() => import('./AnalyticsDashboardView').then((module) => ({ default: module.AnalyticsDashboardView })));

export const LiveInteractiveDemo: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'analytics' | 'map' | 'chat' | 'dispatch'>('map');
  const [trafficLightsOverride, setTrafficLightsOverride] = useState(false);

  useEffect(() => {
    const openResources = () => setActiveTab('map');
    window.addEventListener('lifelink:open-public-resources', openResources);
    return () => window.removeEventListener('lifelink:open-public-resources', openResources);
  }, []);

  return (
    <section id="resources" className="py-20 bg-slate-100 relative border-b border-slate-200 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3 mb-12">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-xs font-bold uppercase tracking-wider mono">
              Synthetic Sandbox • Prototype Interactions
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Interactive Prototype Sandbox
          </h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-normal">
            Explore demonstration scenarios. There is no live hospital telemetry, traffic-signal control, or emergency dispatch connection.
          </p>
        </div>

        {/* Interactive Widget Box */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-lg max-w-7xl mx-auto">
          
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
              <span>🗺️ Find resources</span>
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
              <span>💬 AI informational assistant</span>
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
              <span>🚦 Traffic-signal simulation</span>
            </button>
          </div>

          <Suspense fallback={<div className="min-h-48 flex items-center justify-center text-sm text-slate-500" role="status">Loading prototype panel…</div>}>
            {/* Tab Analytics: Recharts Comprehensive Analytics */}
            {activeTab === 'analytics' && (
              <div className="pt-2">
                <AnalyticsDashboardView />
              </div>
            )}

            {/* Tab Map: Public resource finder */}
            {activeTab === 'map' && (
              <div className="pt-2">
                <GoogleMapsEmergencyView />
              </div>
            )}

            {/* Tab Chat: Informational AI assistant */}
            {activeTab === 'chat' && (
              <div className="pt-2">
                <HealthcareChatAssistant />
              </div>
            )}

            {/* Tab Dispatch: Local-only simulation */}
            {activeTab === 'dispatch' && (
              <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Green Corridor Signal Preemption Simulation</h4>
                    <p className="text-xs text-slate-500">Changes this scenario only; no traffic signals are controlled.</p>
                  </div>
                  <button
                    onClick={() => setTrafficLightsOverride(!trafficLightsOverride)}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      trafficLightsOverride
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    }`}
                  >
                    {trafficLightsOverride ? 'SIMULATION ACTIVE' : 'Run simulation'}
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
                    <p className="text-xs text-slate-500 font-medium">Illustrative ETA</p>
                    <p className={`text-xs font-bold mt-0.5 mono ${trafficLightsOverride ? 'text-emerald-600' : 'text-slate-700'}`}>
                      {trafficLightsOverride ? '6.0 mins (simulated)' : '8.0 mins (simulated)'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Suspense>

        </div>

      </div>
    </section>
  );
};
