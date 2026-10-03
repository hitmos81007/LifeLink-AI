import React from 'react';
import { TabType, UserRole } from '../types/architecture';
import { 
  FileText, 
  FolderTree, 
  Database, 
  Network, 
  ShieldCheck, 
  Layers, 
  Workflow, 
  Sparkles,
  Activity,
  Zap,
  Server
} from 'lucide-react';

interface HeaderProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  currentRole: UserRole;
  onSelectRole: (role: UserRole) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  currentRole,
  onSelectRole
}) => {
  const tabs: { id: TabType; label: string; icon: React.ReactNode; count?: string }[] = [
    { id: 'doc', label: '1. Architecture Document', icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'folder', label: '2. Directory Explorer', icon: <FolderTree className="w-3.5 h-3.5" /> },
    { id: 'firestore', label: '3. Firestore Schema', icon: <Database className="w-3.5 h-3.5" /> },
    { id: 'api', label: '4. REST API Spec', icon: <Network className="w-3.5 h-3.5" /> },
    { id: 'roles', label: '5. RBAC Roles', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
    { id: 'components', label: '6. Component Tree', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'sequence', label: '7. Sequence Flows', icon: <Workflow className="w-3.5 h-3.5" /> },
    { id: 'ai-simulator', label: '8. Gemini AI Dispatch', icon: <Sparkles className="w-3.5 h-3.5" />, count: 'LIVE' },
  ];

  return (
    <header className="bg-[#0F172A] border-b border-slate-800 text-slate-100 sticky top-0 z-50 shadow-md">
      {/* Top Enterprise Control Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white text-xs shadow-md shadow-blue-600/30">
            LL
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-sm font-bold text-white leading-tight font-sans">
                LifeLink AI
              </h1>
              <span className="text-[10px] mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-semibold border border-blue-500/30">
                v2.4 Enterprise
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                GCP Blueprint
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-sans">
              Google AI Healthcare Emergency Logistics Architecture
            </p>
          </div>
        </div>

        {/* High Density Metric Counters & Role Selector */}
        <div className="flex items-center space-x-4">
          <div className="hidden lg:flex items-center space-x-4 border-r border-slate-800 pr-4 text-center">
            <div>
              <div className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider">Missions</div>
              <div className="text-xs font-bold text-white mono">128 Active</div>
            </div>
            <div>
              <div className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider">Fleet Uptime</div>
              <div className="text-xs font-bold text-emerald-400 mono">99.4%</div>
            </div>
            <div>
              <div className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider">API Latency</div>
              <div className="text-xs font-bold text-blue-400 mono">14ms</div>
            </div>
          </div>

          <div className="flex items-center space-x-2 bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider hidden sm:inline">Role:</span>
            <select
              value={currentRole}
              onChange={(e) => onSelectRole(e.target.value as UserRole)}
              className="bg-transparent text-xs text-blue-400 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="PATIENT" className="bg-slate-900 text-slate-200">Patient / Citizen</option>
              <option value="HOSPITAL_ADMIN" className="bg-slate-900 text-slate-200">Hospital Admin</option>
              <option value="BLOOD_BANK_MGR" className="bg-slate-900 text-slate-200">Blood Bank Mgr</option>
              <option value="AMBULANCE_DISPATCH" className="bg-slate-900 text-slate-200">Paramedic Dispatch</option>
              <option value="GOVT_AUTHORITY" className="bg-slate-900 text-slate-200">Govt Health Auth</option>
            </select>
          </div>
        </div>
      </div>

      {/* Navigation Tabs (High Density Pill Navigation) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center overflow-x-auto no-scrollbar">
        <nav className="flex space-x-1 py-1.5 min-w-max">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.count && (
                  <span className="ml-1 px-1.5 py-0.2 text-[9px] font-bold rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};

