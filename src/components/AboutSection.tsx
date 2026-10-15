import React, { useState } from 'react';
import {
  Shield,
  Zap,
  Network,
  Lock,
  Building2,
  Droplet,
  Ambulance,
  Globe,
  CheckCircle2,
  Sparkles,
  ArrowRight
} from 'lucide-react';

export const AboutSection: React.FC<{ onOpenGetStarted: () => void }> = ({ onOpenGetStarted }) => {
  const [activeTab, setActiveTab] = useState<'hospitals' | 'blood' | 'dispatch' | 'authority'>('hospitals');

  return (
    <section id="about" className="py-20 bg-white dark:bg-slate-950 relative border-b border-slate-200 dark:border-slate-800 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3 mb-16">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-bold uppercase tracking-wider mono">
              About LifeLink AI
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            A Prototype for Coordinated Emergency Resources
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            LifeLink AI explores how hospitals and emergency teams could coordinate resource availability. This prototype uses synthetic data and is not connected to live care systems.
          </p>
        </div>

        {/* 4 Core Architectural Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="p-2.5 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 w-fit">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Supabase-backed workflows</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Supabase Auth and PostgreSQL support the prototype's account and resource workflows. The displayed scenarios are not live telemetry.
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 w-fit">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">AI as decision support</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Rule-based prototype matches are advisory, not validated probabilities. A qualified human must review clinical and resource decisions.
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="p-2.5 rounded-lg bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 w-fit">
              <Network className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Integration roadmap</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              EHR, FHIR, and emergency-service integrations are planned and are not connected in this prototype.
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="p-2.5 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 w-fit">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Role-scoped access</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Supabase Auth and PostgreSQL row-level security are used for account-scoped data access. This is not a compliance certification.
            </p>
          </div>

        </div>

        {/* Interactive Stakeholder Ecosystem Breakdown */}
        <div className="bg-slate-900 dark:bg-slate-900 border border-slate-800 text-white rounded-2xl p-6 sm:p-8 shadow-xl">
          <div className="border-b border-slate-800 pb-6 mb-6">
            <span className="text-xs font-bold text-blue-400 uppercase tracking-widest mono block mb-1">
              Multi-Tenant Stakeholder Ecosystem
            </span>
            <h3 className="text-xl sm:text-2xl font-bold text-white">
              How LifeLink AI Empowers Every Emergency Partner
            </h3>
            <p className="mt-2 text-xs text-amber-200">These panels describe planned workflows. External hospital, blood bank, ambulance, and traffic systems are not connected.</p>
          </div>

          {/* Role Tabs */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setActiveTab('hospitals')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-2 ${
                activeTab === 'hospitals'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Hospitals & ICU Units</span>
            </button>

            <button
              onClick={() => setActiveTab('blood')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-2 ${
                activeTab === 'blood'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              <Droplet className="w-4 h-4 text-rose-400" />
              <span>Blood Banks & Depots</span>
            </button>

            <button
              onClick={() => setActiveTab('dispatch')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-2 ${
                activeTab === 'dispatch'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              <Ambulance className="w-4 h-4 text-emerald-400" />
              <span>Ambulances & Paramedics</span>
            </button>

            <button
              onClick={() => setActiveTab('authority')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-2 ${
                activeTab === 'authority'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              <Shield className="w-4 h-4 text-amber-400" />
              <span>Health Ministries & Authorities</span>
            </button>
          </div>

          {/* Tab Content Panels */}
          <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-4">
            {activeTab === 'hospitals' && (
              <div className="space-y-3">
                <h4 className="text-base font-bold text-blue-300">
                  Hospital Command Center Integration
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  The prototype explores hospital resource coordination. EHR integration, paramedic synchronization, and automated notifications are not connected.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Planned: ICU and CCU resource visibility</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Planned: specialized resource workflows</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'blood' && (
              <div className="space-y-3">
                <h4 className="text-base font-bold text-rose-300">
                  Regional Blood Supply Network
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Blood inventory coordination is a product direction. This prototype does not forecast stockouts, make transfusion decisions, or arrange transport.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Planned: clinician-reviewed compatibility workflow</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Planned: verified blood bank notifications</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'dispatch' && (
              <div className="space-y-3">
                <h4 className="text-base font-bold text-emerald-300">
                  Emergency Medical Dispatch & Green Corridor
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  The roadmap includes routing and traffic coordination concepts. This prototype does not control signals, dispatch responders, or stream patient vitals.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Planned: traffic coordination integration</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Planned: responder data integration</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'authority' && (
              <div className="space-y-3">
                <h4 className="text-base font-bold text-amber-300">
                  Epidemiological & Emergency Resource Oversight
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  The district dashboard demonstrates threshold-based early-warning signals from synthetic aggregate case counts, admissions, and resource-use proxies. It is not connected to public-health surveillance, does not diagnose outbreaks, and does not report SLA compliance.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Demo: early-warning signals from aggregated synthetic trends</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Demo: district trend source windows and data freshness</span>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={onOpenGetStarted}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <span>Request Enterprise Network Access</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
