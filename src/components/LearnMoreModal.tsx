import React from 'react';
import { X, ShieldCheck, Cpu, Database, Network, Clock, CheckCircle2, FileText, ArrowRight } from 'lucide-react';

interface LearnMoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenGetStarted: () => void;
}

export const LearnMoreModal: React.FC<LearnMoreModalProps> = ({ isOpen, onClose, onOpenGetStarted }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
          <div className="p-2.5 rounded-lg bg-blue-100 text-blue-700">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
              LifeLink AI Architectural Whitepaper & Overview
            </h3>
            <p className="text-xs text-slate-500">
              Technical Specification, Security Framework, and Operational ROI
            </p>
          </div>
        </div>

        {/* Section 1: Core Architecture */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-blue-700 mono flex items-center gap-1.5">
            <Cpu className="w-4 h-4" />
            1. Server-Side Gemini 3.6 Flash Intelligence
          </h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            Unlike legacy static dispatch software, LifeLink AI utilizes server-side Gemini 3.6 Flash models via secure REST endpoints. The AI continuously parses patient triage logs, evaluates hospital bed congestion rates, and calculates Green Corridor preemption vectors.
          </p>
        </div>

        {/* Section 2: Security & Governance */}
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 mono flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            2. Zero-Trust HIPAA & FHIR Compliance
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-50 p-2.5 rounded border border-slate-200 text-slate-700">
              <strong>Firebase Auth Claims:</strong> Role-based access control with custom JWT claims.
            </div>
            <div className="bg-slate-50 p-2.5 rounded border border-slate-200 text-slate-700">
              <strong>HL7 / FHIR v4:</strong> Direct bi-directional synchronization with hospital EHRs.
            </div>
          </div>
        </div>

        {/* Section 3: Verified Impact & ROI */}
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-purple-700 mono flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            3. Proven Clinical & Operational Impact
          </h4>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
              <p className="text-lg font-bold text-blue-800 mono">-4.2 mins</p>
              <p className="text-[10px] text-slate-600">Avg ER Arrival ETA</p>
            </div>
            <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200">
              <p className="text-lg font-bold text-emerald-800 mono">42%</p>
              <p className="text-[10px] text-slate-600">Blood Bag Wastage Saved</p>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
              <p className="text-lg font-bold text-purple-800 mono">100%</p>
              <p className="text-[10px] text-slate-600">ICU Bed Visibility</p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            Close Overview
          </button>
          <button
            onClick={() => {
              onClose();
              onOpenGetStarted();
            }}
            className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <span>Request Demo Access</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </div>
  );
};
