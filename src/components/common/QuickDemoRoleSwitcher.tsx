import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Users,
  Stethoscope,
  HeartPulse,
  Building2,
  Truck,
  Droplets,
  Shield,
  Sparkles,
  ChevronDown,
  Zap,
  CheckCircle2
} from 'lucide-react';
import { AppRole, UserRole } from '../../types/database';

interface RoleOption {
  role: UserRole;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  color: string;
  email: string;
  fullName: string;
  hospitalId?: string;
  bloodBankId?: string;
}

const DEMO_ROLES: RoleOption[] = [
  {
    role: 'patient',
    label: 'Patient',
    sublabel: 'Request Care & Track Live Ambulance',
    icon: HeartPulse,
    color: 'bg-rose-600 text-white',
    email: 'patient.demo@lifelink.ai',
    fullName: 'Rahul Sharma (Patient)'
  },
  {
    role: 'clinician_reviewer',
    label: 'Clinician Reviewer',
    sublabel: 'Evaluate Triage & Approve Hospital Matches',
    icon: Stethoscope,
    color: 'bg-teal-600 text-white',
    email: 'dr.verma@lifelink.ai',
    fullName: 'Dr. Ananya Verma (Chief Clinician)'
  },
  {
    role: 'hospital_approver',
    label: 'Hospital Approver',
    sublabel: 'Authorize Bed & Resource Movements',
    icon: Building2,
    color: 'bg-indigo-600 text-white',
    email: 'approver.metro@lifelink.ai',
    fullName: 'Director S. Raman (Metro Trauma)',
    hospitalId: 'hosp-01'
  },
  {
    role: 'ambulance_admin',
    label: 'Ambulance Dispatcher',
    sublabel: 'GPS Fleet Management & Response',
    icon: Truck,
    color: 'bg-amber-600 text-white',
    email: 'dispatch.als@lifelink.ai',
    fullName: 'Capt. Marcus Vance (ALS Command)'
  },
  {
    role: 'blood_bank_admin',
    label: 'Blood Bank Admin',
    sublabel: 'Cold-Chain Reserve & Blood Units',
    icon: Droplets,
    color: 'bg-red-600 text-white',
    email: 'redcross.delhi@lifelink.ai',
    fullName: 'Dr. Neha Patel (Red Cross Bank)',
    bloodBankId: 'blood-01'
  },
  {
    role: 'government_admin',
    label: 'Government Health Dept',
    sublabel: 'City-Wide Disaster & Resource Grid',
    icon: Shield,
    color: 'bg-purple-600 text-white',
    email: 'health.commissioner@gov.in',
    fullName: 'Commissioner P. K. Mishra'
  }
];

export const QuickDemoRoleSwitcher: React.FC = () => {
  const { userProfile, setViewMode } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const currentRole = userProfile?.role || 'patient';

  const handleSelectRole = (demo: RoleOption) => {
    // Overwrite local userProfile in state/storage for rapid evaluation
    const mockProfile = {
      user_id: `user_${demo.role}_demo`,
      full_name: demo.fullName,
      email: demo.email,
      phone: '+91-98765-43210',
      role: demo.role,
      hospital_id: demo.hospitalId || null,
      blood_bank_id: demo.bloodBankId || null,
      ambulance_provider_id: demo.role === 'ambulance_admin' ? 'prov-1' : null,
      status: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      localStorage.setItem('lifelink_active_demo_user', JSON.stringify(mockProfile));
      // Trigger a synthetic session switch
      window.dispatchEvent(new CustomEvent('lifelink_demo_role_change', { detail: mockProfile }));
    } catch (e) {
      console.warn('Demo switch notice:', e);
    }

    setToast(`Switched to: ${demo.label}`);
    setTimeout(() => setToast(null), 2500);
    setIsOpen(false);
    setViewMode('dashboard');
  };

  return (
    <div className="relative inline-block text-left">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 border border-emerald-400 text-xs font-bold animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toast}</span>
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl shadow-md flex items-center gap-2 text-xs font-bold cursor-pointer transition-all border border-blue-400/30"
      >
        <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300 animate-pulse" />
        <span className="hidden sm:inline">1-Click Role Switcher:</span>
        <span className="font-extrabold capitalize underline decoration-amber-300">
          {currentRole.replace('_', ' ')}
        </span>
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-2 z-[9999] space-y-1 backdrop-blur-md animate-in fade-in zoom-in duration-150">
          <div className="p-2 border-b border-slate-800 text-[11px] font-bold text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-blue-400">
              <Sparkles className="w-3.5 h-3.5" /> Live Stakeholder Roles
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Demo Evaluation</span>
          </div>

          <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
            {DEMO_ROLES.map((demo) => {
              const Icon = demo.icon;
              const isCurrent = currentRole === demo.role;

              return (
                <button
                  key={demo.role}
                  onClick={() => handleSelectRole(demo)}
                  className={`w-full p-2.5 rounded-xl text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-blue-600/20 border border-blue-500 text-white'
                      : 'hover:bg-slate-800/80 text-slate-300 border border-transparent'
                  }`}
                >
                  <div className={`p-2 rounded-lg shrink-0 ${demo.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-white truncate">{demo.label}</span>
                      {isCurrent && <span className="text-[10px] text-blue-400 font-mono font-bold">Active</span>}
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-1">{demo.sublabel}</p>
                    <p className="text-[10px] font-mono text-slate-500 mt-0.5">{demo.fullName}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
