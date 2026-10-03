import React, { useState } from 'react';
import { X, Sparkles, CheckCircle2, ArrowRight, Building, ShieldCheck, Mail, Calendar } from 'lucide-react';

interface GetStartedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GetStartedModal: React.FC<GetStartedModalProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [orgType, setOrgType] = useState('Hospital');
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative animate-in fade-in zoom-in duration-150">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Title */}
        <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
          <div className="p-2.5 rounded-lg bg-blue-100 text-blue-700">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
              Get Started with LifeLink AI
            </h3>
            <p className="text-xs text-slate-500">
              Initiate instant pilot program deployment for your medical network
            </p>
          </div>
        </div>

        {submitted ? (
          <div className="text-center py-8 space-y-4 animate-in fade-in">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h4 className="text-xl font-bold text-slate-900">Pilot Application Submitted!</h4>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              Your LifeLink AI API keys and integration staging environment credentials have been reserved. An Integration Lead will reach out within 2 hours.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
            >
              Done & Return to Homepage
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            
            {/* Step Indicator */}
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 border-b border-slate-100 pb-3 mono">
              <span className={step === 1 ? 'text-blue-600 font-extrabold' : ''}>1. Organization Type</span>
              <span>→</span>
              <span className={step === 2 ? 'text-blue-600 font-extrabold' : ''}>2. Integration Scope</span>
              <span>→</span>
              <span className={step === 3 ? 'text-blue-600 font-extrabold' : ''}>3. Staging Sandbox</span>
            </div>

            {step === 1 && (
              <div className="space-y-4">
                <label className="text-xs font-bold text-slate-800 block">
                  Select Facility or Agency Type:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {['Hospital / ICU System', 'Blood Bank Hub', 'Ambulance & EMS Fleet', 'Health Ministry / Public Health'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setOrgType(type)}
                      className={`p-3 rounded-lg border text-left text-xs font-bold transition-all cursor-pointer ${
                        orgType === type
                          ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setStep(2)}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 cursor-pointer mt-4"
                >
                  <span>Continue to Step 2</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-800 block">
                    Target Primary Capability:
                  </label>
                  <select className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 font-medium">
                    <option>Real-Time ICU Bed Telemetry Sync</option>
                    <option>Blood Bank Inventory & Cross-Match Matrix</option>
                    <option>Ambulance Traffic Signal Green Corridor Preemption</option>
                    <option>Full Multi-Agency Emergency AI Engine</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-800 block">
                    Estimated Facility Bed or Fleet Count:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 250 Beds, 18 Ambulances"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setStep(1)}
                    className="w-1/3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    className="w-2/3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Final Step</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <p className="text-xs text-slate-600">
                  Provide your contact details to receive instant API staging credentials for <strong>{orgType}</strong>.
                </p>
                <div>
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    Contact Email *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. admin@healthsystem.org"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setStep(2)}
                    className="w-1/3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setSubmitted(true)}
                    className="w-2/3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Generate API Keys & Start Pilot</span>
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
};
