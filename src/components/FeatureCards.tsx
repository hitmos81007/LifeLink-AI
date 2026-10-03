import React, { useState } from 'react';
import {
  Droplet,
  Bed,
  Ambulance,
  Pill,
  Activity,
  BarChart3,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  X,
  ArrowRight,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { FEATURE_CARDS_DATA } from '../data/featureData';
import { FeatureItem } from '../types/landing';

interface FeatureCardsProps {
  onSelectFeature?: (feature: FeatureItem) => void;
}

export const FeatureCards: React.FC<FeatureCardsProps> = () => {
  const [selectedFeature, setSelectedFeature] = useState<FeatureItem | null>(null);

  const getFeatureIcon = (name: string, colorClass: string) => {
    switch (name) {
      case 'Droplet':
        return <Droplet className={`w-6 h-6 ${colorClass}`} />;
      case 'Bed':
        return <Bed className={`w-6 h-6 ${colorClass}`} />;
      case 'Ambulance':
        return <Ambulance className={`w-6 h-6 ${colorClass}`} />;
      case 'Pill':
        return <Pill className={`w-6 h-6 ${colorClass}`} />;
      case 'Activity':
        return <Activity className={`w-6 h-6 ${colorClass}`} />;
      case 'BarChart3':
        return <BarChart3 className={`w-6 h-6 ${colorClass}`} />;
      default:
        return <Sparkles className={`w-6 h-6 ${colorClass}`} />;
    }
  };

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'rose':
        return {
          bg: 'bg-rose-50',
          border: 'border-rose-200',
          hoverBorder: 'hover:border-rose-400',
          iconBg: 'bg-rose-100',
          iconColor: 'text-rose-700',
          badgeBg: 'bg-rose-100 text-rose-800 border-rose-200',
          textAccent: 'text-rose-700',
          btnBg: 'bg-rose-600 hover:bg-rose-700 text-white'
        };
      case 'blue':
        return {
          bg: 'bg-blue-50/50',
          border: 'border-blue-200',
          hoverBorder: 'hover:border-blue-400',
          iconBg: 'bg-blue-100',
          iconColor: 'text-blue-700',
          badgeBg: 'bg-blue-100 text-blue-800 border-blue-200',
          textAccent: 'text-blue-700',
          btnBg: 'bg-blue-600 hover:bg-blue-700 text-white'
        };
      case 'emerald':
        return {
          bg: 'bg-emerald-50/50',
          border: 'border-emerald-200',
          hoverBorder: 'hover:border-emerald-400',
          iconBg: 'bg-emerald-100',
          iconColor: 'text-emerald-700',
          badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          textAccent: 'text-emerald-700',
          btnBg: 'bg-emerald-600 hover:bg-emerald-700 text-white'
        };
      case 'amber':
        return {
          bg: 'bg-amber-50/50',
          border: 'border-amber-200',
          hoverBorder: 'hover:border-amber-400',
          iconBg: 'bg-amber-100',
          iconColor: 'text-amber-800',
          badgeBg: 'bg-amber-100 text-amber-900 border-amber-200',
          textAccent: 'text-amber-800',
          btnBg: 'bg-amber-600 hover:bg-amber-700 text-white'
        };
      case 'purple':
        return {
          bg: 'bg-purple-50/50',
          border: 'border-purple-200',
          hoverBorder: 'hover:border-purple-400',
          iconBg: 'bg-purple-100',
          iconColor: 'text-purple-700',
          badgeBg: 'bg-purple-100 text-purple-800 border-purple-200',
          textAccent: 'text-purple-700',
          btnBg: 'bg-purple-600 hover:bg-purple-700 text-white'
        };
      default:
        return {
          bg: 'bg-indigo-50/50',
          border: 'border-indigo-200',
          hoverBorder: 'hover:border-indigo-400',
          iconBg: 'bg-indigo-100',
          iconColor: 'text-indigo-700',
          badgeBg: 'bg-indigo-100 text-indigo-800 border-indigo-200',
          textAccent: 'text-indigo-700',
          btnBg: 'bg-indigo-600 hover:bg-indigo-700 text-white'
        };
    }
  };

  return (
    <section id="features" className="py-20 bg-slate-50 dark:bg-slate-950 relative border-b border-slate-200 dark:border-slate-800 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3 mb-12">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-bold uppercase tracking-wider mono">
              Below Hero • Core AI Intelligence Modules
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Comprehensive Emergency Resource Modules
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
            Six interconnected AI engines built to unify emergency medical operations across municipal healthcare networks.
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURE_CARDS_DATA.map((feature) => {
            const style = getColorClasses(feature.accentColor);
            return (
              <div
                key={feature.id}
                id={`feature-card-${feature.id}`}
                onClick={() => setSelectedFeature(feature)}
                className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 transition-all duration-200 shadow-xs hover:shadow-md ${style.hoverBorder} cursor-pointer group flex flex-col justify-between relative overflow-hidden`}
              >
                <div>
                  {/* Top Bar Icon & Category */}
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-lg ${style.iconBg} dark:bg-slate-800`}>
                      {getFeatureIcon(feature.iconName, style.iconColor)}
                    </div>
                    <span className={`px-2.5 py-0.5 text-[10px] mono font-bold rounded border ${style.badgeBg} dark:bg-slate-800 dark:border-slate-700`}>
                      {feature.category}
                    </span>
                  </div>

                  {/* Feature Title */}
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors mb-2">
                    {feature.title}
                  </h3>

                  {/* Short Description */}
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                    {feature.shortDescription}
                  </p>
                </div>

                {/* Metrics Highlights & CTA */}
                <div>
                  <div className="grid grid-cols-3 gap-2 py-3 border-y border-slate-100 dark:border-slate-800 my-4 text-center">
                    {feature.metrics.map((m, idx) => (
                      <div key={idx}>
                        <p className={`text-xs font-bold mono ${style.textAccent}`}>{m.value}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">{m.label}</p>
                      </div>
                    ))}
                  </div>

                  <button className="w-full py-2 text-xs font-bold text-slate-700 dark:text-slate-300 group-hover:text-blue-700 dark:group-hover:text-blue-400 bg-slate-50 dark:bg-slate-800 group-hover:bg-blue-50 dark:group-hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                    <span>Explore Capability Details</span>
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Feature Deep-Dive Modal Drawer */}
      {selectedFeature && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative animate-in fade-in zoom-in duration-150 text-slate-900 dark:text-white">
            
            {/* Close Button */}
            <button
              onClick={() => setSelectedFeature(null)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center space-x-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className={`p-3 rounded-xl ${getColorClasses(selectedFeature.accentColor).iconBg} dark:bg-slate-800`}>
                {getFeatureIcon(selectedFeature.iconName, getColorClasses(selectedFeature.accentColor).iconColor)}
              </div>
              <div>
                <span className={`px-2 py-0.5 text-[10px] mono font-bold rounded border ${getColorClasses(selectedFeature.accentColor).badgeBg} dark:bg-slate-800 dark:border-slate-700`}>
                  {selectedFeature.category}
                </span>
                <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-0.5">
                  {selectedFeature.title}
                </h3>
              </div>
            </div>

            {/* Full Description */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mono">
                Platform Intelligence Overview
              </h4>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {selectedFeature.fullDescription}
              </p>
            </div>

            {/* Capabilities List */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mono">
                Key System Capabilities
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {selectedFeature.keyCapabilities.map((cap, idx) => (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span>{cap}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sample Output Simulation */}
            <div className="bg-slate-900 dark:bg-slate-950 text-white rounded-xl p-4 space-y-2 shadow-inner border border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-[10px] mono font-bold text-slate-400">
                  REAL-TIME SIMULATION FEED
                </span>
                <span className="text-[10px] mono text-emerald-400 font-bold flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  {selectedFeature.sampleOutput.time}
                </span>
              </div>
              <div>
                <span className="text-xs font-bold text-blue-300 mono">
                  [{selectedFeature.sampleOutput.status}]
                </span>
                <p className="text-xs text-slate-300 mt-1 font-mono">
                  {selectedFeature.sampleOutput.detail}
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Integrated via FastAPI Gateway
              </span>
              <button
                onClick={() => setSelectedFeature(null)}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs cursor-pointer"
              >
                Close Details
              </button>
            </div>

          </div>
        </div>
      )}

    </section>
  );
};
