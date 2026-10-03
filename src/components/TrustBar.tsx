import React from 'react';
import { ShieldCheck, Server, Cpu, Database, Award, Activity } from 'lucide-react';

export const TrustBar: React.FC = () => {
  return (
    <section className="bg-slate-900 text-white py-10 border-y border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Compliance Badges Header */}
        <div className="text-center mb-8">
          <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mono">
            Enterprise Healthcare Security & Interoperability Standards
          </p>
        </div>

        {/* Badges & Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 items-center text-center">
          
          <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/60 flex flex-col items-center">
            <ShieldCheck className="w-5 h-5 text-emerald-400 mb-1" />
            <p className="text-xs font-bold text-slate-200">HIPAA Compliant</p>
            <p className="text-[10px] text-slate-400">256-bit AES Data Encryption</p>
          </div>

          <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/60 flex flex-col items-center">
            <Database className="w-5 h-5 text-blue-400 mb-1" />
            <p className="text-xs font-bold text-slate-200">HL7 / FHIR v4</p>
            <p className="text-[10px] text-slate-400">Standardized EHR Sync</p>
          </div>

          <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/60 flex flex-col items-center">
            <Cpu className="w-5 h-5 text-purple-400 mb-1" />
            <p className="text-xs font-bold text-slate-200">Gemini 3.6 Flash</p>
            <p className="text-[10px] text-slate-400">Server-Side Clinical AI</p>
          </div>

          <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/60 flex flex-col items-center">
            <Server className="w-5 h-5 text-amber-400 mb-1" />
            <p className="text-xs font-bold text-slate-200">99.99% Uptime</p>
            <p className="text-[10px] text-slate-400">Multi-Region Redundancy</p>
          </div>

          <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/60 flex flex-col items-center">
            <Award className="w-5 h-5 text-indigo-400 mb-1" />
            <p className="text-xs font-bold text-slate-200">ISO 27001</p>
            <p className="text-[10px] text-slate-400">Certified Governance</p>
          </div>

          <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/60 flex flex-col items-center">
            <Activity className="w-5 h-5 text-rose-400 mb-1" />
            <p className="text-xs font-bold text-slate-200">Sub-Second Sync</p>
            <p className="text-[10px] text-slate-400">Real-Time Event Bus</p>
          </div>

        </div>

      </div>
    </section>
  );
};
