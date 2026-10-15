import React from 'react';
import { X, FlaskConical, ShieldAlert } from 'lucide-react';

interface GetStartedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GetStartedModal: React.FC<GetStartedModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 sm:p-8 space-y-5 shadow-2xl relative">
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="p-2.5 rounded-lg bg-blue-100 text-blue-700"><FlaskConical className="w-5 h-5" /></div>
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Explore the LifeLink AI prototype</h3>
            <p className="text-xs text-slate-500">Supabase-backed demonstration • synthetic records</p>
          </div>
        </div>
        <ol className="list-decimal pl-5 space-y-2 text-xs text-slate-700">
          <li>Use an account configured in the Supabase project to access role-specific dashboards.</li>
          <li>Review resource workflows and simulated recommendations; human users retain decision authority.</li>
          <li>Transfer lifecycle changes require the current Supabase migrations to be applied.</li>
        </ol>
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <p>Prototype only. Do not enter personal health information or use this site to request real emergency care, dispatch, or resource allocation.</p>
        </div>
        <div className="flex justify-end pt-1">
          <button onClick={onClose} className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Close</button>
        </div>
      </div>
    </div>
  );
};
