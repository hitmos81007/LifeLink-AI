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
              One platform connecting hospitals, blood banks, ambulances and emergency resources using AI. Unifying critical healthcare infrastructure when seconds count.
            </p>

            {/* Live Operational System Badge */}
            <div className="inline-flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-200 font-semibold mono text-[11px]">
                All AI Emergency Networks Operational
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
              <li><a href="#features" className="hover:text-white transition-colors">Disease Outbreak Prediction</a></li>
              <li><a href="#features" className="hover:text-white transition-colors">Emergency Analytics</a></li>
            </ul>
          </div>

          {/* Col 2: Compliance & Standards */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mono">
              Compliance & Tech
            </h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li><span className="text-slate-300">HIPAA & GDPR Compliant</span></li>
              <li><span className="text-slate-300">HL7 FHIR v4 API Native</span></li>
              <li><span className="text-slate-300">Gemini 3.6 Flash Engine</span></li>
              <li><span className="text-slate-300">Firebase Auth & Firestore</span></li>
              <li><span className="text-slate-300">256-bit AES Encryption</span></li>
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
                → Request API Sandbox
              </button>
              <a href="#contact" className="text-slate-400 hover:text-white block">Contact Integration Team</a>
            </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© 2026 LifeLink AI Platforms Inc. All rights reserved.</p>

          <div className="flex items-center space-x-4 text-[11px] font-mono">
            <span>Built with React + Tailwind CSS</span>
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
