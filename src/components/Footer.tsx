import React from 'react';
import { Activity, ShieldCheck, Heart, ArrowUp } from 'lucide-react';

interface FooterProps {
  onOpenLogin: () => void;
  onOpenGetStarted: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenLogin, onOpenGetStarted }) => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="bg-slate-900 text-slate-300 pt-16 pb-12 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Top Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-slate-800">
          
          {/* Brand Col */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
                <Activity className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-extrabold text-white tracking-tight">
                LifeLink <span className="text-blue-400">AI</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-sm font-normal">
              A demonstration prototype for emergency resource coordination. It uses synthetic records and is not connected to live care networks.
            </p>

            {/* Live Operational System Badge */}
            <div className="inline-flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700 text-xs">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-slate-200 font-semibold mono text-[11px]">
                Prototype • Synthetic data only
              </span>
            </div>
          </div>

          {/* Col 1: Platform Modules */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mono">
              Emergency Modules
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li><a href="#features" className="hover:text-white transition-colors">Blood Intelligence</a></li>
              <li><a href="#features" className="hover:text-white transition-colors">ICU Availability</a></li>
              <li><a href="#features" className="hover:text-white transition-colors">Ambulance Coordination</a></li>
              <li><a href="#features" className="hover:text-white transition-colors">Medicine Intelligence</a></li>
              <li><a href="#features" className="hover:text-white transition-colors">Disease Trend Early-Warning Demo</a></li>
              <li><a href="#features" className="hover:text-white transition-colors">Emergency Analytics</a></li>
            </ul>
          </div>

          {/* Col 2: Compliance & Standards */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mono">
              Prototype Stack
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li><span className="text-slate-300">Supabase Auth</span></li>
              <li><span className="text-slate-300">PostgreSQL + row-level security</span></li>
              <li><span className="text-slate-300">Human-reviewed workflows</span></li>
              <li><span className="text-slate-300">AI recommendations are advisory</span></li>
            </ul>
          </div>

          {/* Col 3: Portal & Actions */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mono">
              Quick Links
            </h4>
            <div className="space-y-2 text-xs">
              <button
                onClick={onOpenLogin}
                className="text-blue-400 hover:text-blue-300 block font-semibold cursor-pointer"
              >
                → Stakeholder Login Portal
              </button>
              <button
                onClick={onOpenGetStarted}
                className="text-emerald-400 hover:text-emerald-300 block font-semibold cursor-pointer"
              >
                → Prototype guide
              </button>
              <a href="#contact" className="text-slate-400 hover:text-white block">Prototype information</a>
              <a href="#faq" className="text-slate-400 hover:text-white block">Frequently asked questions</a>
            </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© Copyright, Made with love and code - Segfault Squad</p>

          <div className="flex items-center space-x-4 text-[11px] font-mono">
            <span>LifeLink AI • Demonstration prototype</span>
            <span>•</span>
            <button
              onClick={scrollToTop}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer flex items-center gap-1"
              aria-label="Back to top"
            >
              <span>Top</span>
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>
    </footer>
  );
};
