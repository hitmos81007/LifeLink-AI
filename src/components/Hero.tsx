import React from 'react';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Activity,
  Bed,
  Droplet,
  Ambulance,
  CheckCircle2,
  Clock,
  ExternalLink
} from 'lucide-react';

interface HeroProps {
  onOpenGetStarted: () => void;
  onOpenLearnMore: () => void;
  onExploreFeatures: () => void;
  onOpenMciReport?: () => void;
}

export const Hero: React.FC<HeroProps> = ({
  onOpenGetStarted,
  onOpenLearnMore,
  onExploreFeatures,
  onOpenMciReport,
}) => {
  return (
    <section id="home" className="pt-28 pb-16 lg:pt-36 lg:pb-24 bg-gradient-to-b from-blue-50/60 via-slate-50/30 to-white dark:from-slate-900 dark:via-slate-900/80 dark:to-slate-950 relative overflow-hidden border-b border-slate-100 dark:border-slate-800 transition-colors duration-200">
      {/* Background Decorative Accent Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-40 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Hero Content */}
          <div className="lg:col-span-7 space-y-6 text-left">
            
            {/* Live Operational Badge & Fast MCI Button */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center space-x-2 bg-white dark:bg-slate-800 px-3 py-1 rounded-full border border-blue-200 dark:border-blue-800 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  LifeLink AI Infrastructure v2.4
                </span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  HIPAA & FHIR Certified
                </span>
              </div>

              {onOpenMciReport && (
                <button
                  onClick={onOpenMciReport}
                  className="inline-flex items-center space-x-1.5 bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider shadow-md shadow-red-600/30 cursor-pointer animate-pulse transition-all active:scale-95"
                >
                  <span>🚨 Fast Accident / Disaster Report (Guest Mode)</span>
                </button>
              )}
            </div>

            {/* Main Title */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-[1.15]">
              AI Emergency Healthcare Resource Intelligence Platform
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 font-normal leading-relaxed max-w-2xl">
              Real-time patient request approval, nearest ICU &amp; blood bank matching, GPS green corridor ambulance tracking, and 1-tap mass casualty disaster triage.
            </p>

            {/* CTA Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                id="hero-get-started-btn"
                onClick={onOpenGetStarted}
                className="px-6 py-3.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 group active:scale-98"
              >
                <Sparkles className="w-4 h-4 text-blue-200 group-hover:rotate-12 transition-transform" />
                <span>Patient Emergency Portal</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>

              {onOpenMciReport && (
                <button
                  onClick={onOpenMciReport}
                  className="px-6 py-3.5 text-sm font-black text-white bg-red-600 hover:bg-red-500 rounded-xl shadow-lg shadow-red-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98"
                >
                  <span>🚨 Report Mass Casualty</span>
                </button>
              )}

              <button
                id="hero-learn-more-btn"
                onClick={onOpenLearnMore}
                className="px-5 py-3.5 text-xs font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Learn More</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            {/* Trust Highlights */}
            <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800 grid grid-cols-3 gap-4">
              <div>
                <p className="text-xl font-extrabold text-slate-900 dark:text-white mono">500+</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Hospitals Synced</p>
              </div>
              <div>
                <p className="text-xl font-extrabold text-slate-900 dark:text-white mono">&lt; 2.4s</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">AI Triage Latency</p>
              </div>
              <div>
                <p className="text-xl font-extrabold text-slate-900 dark:text-white mono">100%</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Live Telemetry</p>
              </div>
            </div>

          </div>

          {/* Right Hero Live Interactive Preview Component */}
          <div className="lg:col-span-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
              
              {/* Header Bar */}
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
                <div className="flex items-center space-x-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider mono">
                    Regional Command Center Feed
                  </span>
                </div>
                <span className="px-2 py-0.5 text-[10px] mono font-bold rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  LIVE STREAM
                </span>
              </div>

              {/* Grid of Real-Time Resource Status Cards */}
              <div className="space-y-3">
                
                {/* 1. ICU Availability */}
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-3.5 rounded-lg flex items-center justify-between hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                      <Bed className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-slate-900 dark:text-white">St. Jude Trauma Center</p>
                        <span className="text-[10px] mono font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1 rounded">2 Bays Free</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">ICU Bed #04 (Ventilator Active) • Ready</p>
                    </div>
                  </div>
                  <span className="text-[10px] mono text-slate-400 dark:text-slate-500 font-medium">0.8s ago</span>
                </div>

                {/* 2. Blood Intelligence */}
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-3.5 rounded-lg flex items-center justify-between hover:border-rose-300 dark:hover:border-rose-700 transition-colors">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300">
                      <Droplet className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-slate-900 dark:text-white">Central Red Cross Bank</p>
                        <span className="text-[10px] mono font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 px-1 rounded">O- Reserved</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">4 Units O- Negative Blood reserved for Trauma ER</p>
                    </div>
                  </div>
                  <span className="text-[10px] mono text-slate-400 dark:text-slate-500 font-medium">1.2s ago</span>
                </div>

                {/* 3. Ambulance Green Corridor */}
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-3.5 rounded-lg flex items-center justify-between hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                      <Ambulance className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-slate-900 dark:text-white">Paramedic Unit #12</p>
                        <span className="text-[10px] mono font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1 rounded">Preemption ON</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Expressway 9 Lights overridden to Green • ETA 4m</p>
                    </div>
                  </div>
                  <span className="text-[10px] mono text-slate-400 dark:text-slate-500 font-medium">Just now</span>
                </div>

                {/* 4. AI Triage Engine */}
                <div className="bg-slate-900 dark:bg-slate-950 text-white p-3.5 rounded-lg space-y-2 shadow-inner border border-slate-800">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center space-x-1.5">
                      <Activity className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-xs font-bold text-blue-300 mono">Gemini 3.6 Flash Triage</span>
                    </div>
                    <span className="text-[10px] mono text-emerald-400 font-bold bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800">
                      RED LEVEL - HIGH PRIORITY
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 font-mono">
                    STEMI Suspicion • Priority 92/100 • Cath Lab Alert Broadcasted
                  </p>
                </div>

              </div>

              {/* Card Footer status */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Auto-Syncing 1,420 City Sensors
                </span>
                <span className="mono text-[10px]">Region: Metro Zone 1</span>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
