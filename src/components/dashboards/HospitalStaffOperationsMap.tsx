import React, { useMemo, useState } from 'react';
import {
  Activity, AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, Clock,
  Copy, Cpu, Eye, Filter, Flame, HeartPulse, HelpCircle, Layers, Lock,
  Mail, Network, Phone, RefreshCw, Search, ShieldCheck, Stethoscope, User,
  Users, Wind, Zap
} from 'lucide-react';
import {
  OPERATIONAL_SCENARIOS, OperationalScenarioKey, SYNTHETIC_STAFF_LIST,
  SyntheticStaffProfile
} from '../../services/syntheticStaffData';
import { ICUInventoryTable, GeneralBedInventoryTable, MedicineInventoryTable, OxygenInventoryTable } from '../../types/database';

interface Props {
  hospitalId: string;
  icu?: ICUInventoryTable | null;
  general?: GeneralBedInventoryTable | null;
  oxygen?: OxygenInventoryTable[];
  medicines?: MedicineInventoryTable[];
}

const DISCIPLINE_COLORS: Record<string, { bg: string; text: string; border: string; glow: string; dot: string }> = {
  Surgeon: { bg: 'bg-purple-950/80', text: 'text-purple-300', border: 'border-purple-600', glow: '#a855f7', dot: '#c084fc' },
  Anesthesiologist: { bg: 'bg-indigo-950/80', text: 'text-indigo-300', border: 'border-indigo-600', glow: '#6366f1', dot: '#818cf8' },
  Physician: { bg: 'bg-emerald-950/80', text: 'text-emerald-300', border: 'border-emerald-600', glow: '#10b981', dot: '#34d399' },
  Nurse: { bg: 'bg-cyan-950/80', text: 'text-cyan-300', border: 'border-cyan-600', glow: '#06b6d4', dot: '#22d3ee' },
  'Respiratory Therapist': { bg: 'bg-amber-950/80', text: 'text-amber-300', border: 'border-amber-600', glow: '#f59e0b', dot: '#fbbf24' },
  Pharmacist: { bg: 'bg-pink-950/80', text: 'text-pink-300', border: 'border-pink-600', glow: '#ec4899', dot: '#f472b6' },
  Technician: { bg: 'bg-blue-950/80', text: 'text-blue-300', border: 'border-blue-600', glow: '#3b82f6', dot: '#60a5fa' },
  Support: { bg: 'bg-teal-950/80', text: 'text-teal-300', border: 'border-teal-600', glow: '#14b8a6', dot: '#2dd4bf' },
  Other: { bg: 'bg-slate-900', text: 'text-slate-300', border: 'border-slate-700', glow: '#64748b', dot: '#94a3b8' }
};

const WORKLOAD_BADGES: Record<string, { bg: string; text: string }> = {
  Normal: { bg: 'bg-emerald-950 text-emerald-300 border-emerald-800', text: 'text-emerald-300' },
  High: { bg: 'bg-sky-950 text-sky-300 border-sky-800', text: 'text-sky-300' },
  Overtime: { bg: 'bg-amber-950 text-amber-300 border-amber-800', text: 'text-amber-300' },
  Reassigned: { bg: 'bg-indigo-950 text-indigo-300 border-indigo-800', text: 'text-indigo-300' },
  Critical: { bg: 'bg-rose-950 text-rose-300 border-rose-800', text: 'text-rose-300' }
};

export const HospitalStaffOperationsMap: React.FC<Props> = ({ hospitalId, icu, general, oxygen = [], medicines = [] }) => {
  const [selectedScenarioKey, setSelectedScenarioKey] = useState<OperationalScenarioKey>('baseline_24h');
  const [hoveredStaff, setHoveredStaff] = useState<SyntheticStaffProfile | null>(null);
  const [pinnedStaff, setPinnedStaff] = useState<SyntheticStaffProfile | null>(SYNTHETIC_STAFF_LIST[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'map' | 'table'>('map');
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);

  const scenario = OPERATIONAL_SCENARIOS[selectedScenarioKey];

  // Filtered staff list based on search and discipline filters
  const filteredStaff = useMemo(() => {
    return SYNTHETIC_STAFF_LIST.filter((staff) => {
      const matchesSearch =
        staff.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        staff.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        staff.staffCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        staff.department.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDiscipline = selectedDiscipline === 'All' || staff.discipline === selectedDiscipline;
      return matchesSearch && matchesDiscipline;
    });
  }, [searchQuery, selectedDiscipline]);

  const activeStaff = hoveredStaff || pinnedStaff || SYNTHETIC_STAFF_LIST[0];
  const activeWork = activeStaff.scenarios[selectedScenarioKey];

  // Map geometry calculations: Center at (450, 450) with radial orbital layout for 50 nodes
  const mapCenter = { x: 450, y: 450 };
  const orbitalRadius = 330;

  const staffNodes = useMemo(() => {
    const total = SYNTHETIC_STAFF_LIST.length;
    return SYNTHETIC_STAFF_LIST.map((person, index) => {
      const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
      // Stagger radius slightly for pleasant visual depth
      const radiusVariation = index % 2 === 0 ? 0 : (index % 4 === 1 ? 25 : -25);
      const r = orbitalRadius + radiusVariation;
      const x = mapCenter.x + r * Math.cos(angle);
      const y = mapCenter.y + r * Math.sin(angle);
      return {
        person,
        index,
        x,
        y,
        angle
      };
    });
  }, [orbitalRadius]);

  const copyCredentials = () => {
    const text = `LifeLink AI - 50 Synthetic Staff Credentials\nRange: vh16001@velhightech.com to vh16050@velhightech.com\nDefault Password: Mats@8905\nHospital ID: ${hospitalId}`;
    void navigator.clipboard?.writeText(text);
    setCopiedNotice('Copied 50 staff account credentials (vh16001-16050 with password Mats@8905)!');
    setTimeout(() => setCopiedNotice(null), 4000);
  };

  return (
    <section className="space-y-6 rounded-2xl border border-cyan-800/80 bg-slate-900 p-5 sm:p-7 shadow-2xl" aria-labelledby="staff-operations-map-heading">
      {/* Top Banner and Heading */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-950 border border-cyan-700 text-cyan-300 shadow-lg shadow-cyan-950/50">
              <Network className="h-5 w-5" />
            </span>
            <div>
              <h2 id="staff-operations-map-heading" className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                24-Hour Hospital Operations Topology Map
                <span className="rounded-full border border-cyan-700 bg-cyan-950/80 px-2.5 py-0.5 text-[10px] font-bold uppercase text-cyan-200">
                  50 Connected Staff Nodes
                </span>
              </h2>
              <p className="mt-1 text-xs text-slate-300 leading-relaxed max-w-3xl">
                Real-time visual command map linking 50 synthetic medical staff (<span className="font-mono text-cyan-300">vh16001–vh16050@velhightech.com</span>) to the central hospital operations hub. Hover or click any node to inspect their 24-hour work, shift assignments, and equipment under active constraint scenarios.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyCredentials}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-700 bg-cyan-950/70 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-900 transition-all shadow-sm"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy 50 Staff Credentials
          </button>
          <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => setViewMode('map')}
              className={`rounded px-3 py-1 text-xs font-bold transition-colors ${viewMode === 'map' ? 'bg-cyan-700 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Network Map
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`rounded px-3 py-1 text-xs font-bold transition-colors ${viewMode === 'table' ? 'bg-cyan-700 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Roster Table
            </button>
          </div>
        </div>
      </header>

      {copiedNotice && (
        <div className="rounded-xl border border-emerald-700 bg-emerald-950/40 p-3 text-xs font-bold text-emerald-200 flex items-center justify-between animate-fadeIn">
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{copiedNotice}</span>
          <button type="button" onClick={() => setCopiedNotice(null)} className="text-slate-400 hover:text-white text-xs">✕</button>
        </div>
      )}

      {/* 5 Operational Constraint Scenarios Selector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-cyan-400" />
            Select Operational Constraint Scenario (5 Live Modes)
          </h3>
          <span className="text-[11px] text-slate-400">All 50 staff assignments dynamically rebalance per constraint</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {(Object.keys(OPERATIONAL_SCENARIOS) as OperationalScenarioKey[]).map((key) => {
            const sc = OPERATIONAL_SCENARIOS[key];
            const isSelected = selectedScenarioKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedScenarioKey(key)}
                className={`relative flex flex-col justify-between rounded-xl border p-3 text-left transition-all ${
                  isSelected
                    ? 'border-cyan-400 bg-cyan-950/50 ring-2 ring-cyan-500/30 shadow-lg shadow-cyan-950/60'
                    : 'border-slate-800 bg-slate-950/80 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${sc.badgeColor}`}>
                      {key === 'baseline_24h' ? 'Mode 1' : key === 'mass_casualty_surge' ? 'Mode 2' : key === 'oxygen_crisis' ? 'Mode 3' : key === 'workforce_deficit' ? 'Mode 4' : 'Mode 5'}
                    </span>
                    {isSelected && <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />}
                  </div>
                  <h4 className={`text-xs font-bold leading-tight ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                    {sc.title}
                  </h4>
                  <p className="mt-1 text-[10px] text-slate-400 line-clamp-2 leading-relaxed">
                    {sc.subtitle}
                  </p>
                </div>
                <div className="mt-2.5 flex items-center justify-between border-t border-slate-800/80 pt-2 text-[10px]">
                  <span className={isSelected ? 'font-bold text-cyan-300' : 'text-slate-500'}>
                    {isSelected ? 'Active Scenario' : 'Switch Mode'}
                  </span>
                  <ChevronRight className={`h-3 w-3 ${isSelected ? 'text-cyan-300' : 'text-slate-600'}`} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Scenario Operational Summary & Priorities Banner */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-900/60 text-cyan-300 text-xs font-black">
              ★
            </span>
            <span className="text-sm font-bold text-white">{scenario.title}</span>
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${scenario.badgeColor}`}>
              {scenario.badge}
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            Workforce: <strong className="text-white">50 Staff Online</strong> · 100% Account Linked (<span className="text-cyan-300">Mats@8905</span>)
          </span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">{scenario.description}</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 text-[11px]">
          {scenario.operationalPriorities.map((priority, pIdx) => (
            <div key={pIdx} className="flex items-start gap-2 rounded-lg bg-slate-900/90 border border-slate-800/70 p-2 text-slate-300">
              <span className="text-cyan-400 font-bold shrink-0">{pIdx + 1}.</span>
              <span>{priority}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Resource Telemetry Collected for Active Constraint */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-cyan-400" />
            Hospital Resource Telemetry &amp; Capacity Indicators (Live Constraint)
          </h3>
          <span className="text-[10px] text-slate-500">Telemetry inputs collected directly on frontend</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Oxygen Telemetry */}
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                <Wind className="h-4 w-4 text-cyan-400" />
                Oxygen Supply
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                scenario.telemetry.oxygen.status === 'optimal' ? 'bg-emerald-950 text-emerald-300' :
                scenario.telemetry.oxygen.status === 'warning' ? 'bg-amber-950 text-amber-300' : 'bg-rose-950 text-rose-300'
              }`}>
                {scenario.telemetry.oxygen.status}
              </span>
            </div>
            <div>
              <p className="text-xl font-black text-white">{scenario.telemetry.oxygen.liquidOxygenLevelPct}% <span className="text-xs font-normal text-slate-400">LOX Tank</span></p>
              <p className="text-[11px] text-slate-300 mt-0.5">{scenario.telemetry.oxygen.cylindersAvailable} / {scenario.telemetry.oxygen.cylindersTotal} cylinders free</p>
            </div>
            <div className="border-t border-slate-800/80 pt-1 text-[10px] text-slate-400 flex justify-between">
              <span>{scenario.telemetry.oxygen.flowRateLpm} LPM burn rate</span>
              <span className="font-bold text-cyan-300">{scenario.telemetry.oxygen.reserveHours}h reserve</span>
            </div>
          </div>

          {/* ICU Beds Telemetry */}
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                <HeartPulse className="h-4 w-4 text-rose-400" />
                ICU Beds
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                scenario.telemetry.icuBeds.status === 'optimal' ? 'bg-emerald-950 text-emerald-300' :
                scenario.telemetry.icuBeds.status === 'warning' ? 'bg-amber-950 text-amber-300' : 'bg-rose-950 text-rose-300'
              }`}>
                {scenario.telemetry.icuBeds.status}
              </span>
            </div>
            <div>
              <p className="text-xl font-black text-white">{scenario.telemetry.icuBeds.available} <span className="text-xs font-normal text-slate-400">/ {scenario.telemetry.icuBeds.total} Free</span></p>
              <p className="text-[11px] text-slate-300 mt-0.5">{scenario.telemetry.icuBeds.occupied} beds actively occupied</p>
            </div>
            <div className="border-t border-slate-800/80 pt-1 text-[10px] text-slate-400 flex justify-between">
              <span>Min reserve: {scenario.telemetry.icuBeds.protectedReserve}</span>
              <span className="font-bold text-rose-300">{Math.round((scenario.telemetry.icuBeds.occupied / scenario.telemetry.icuBeds.total) * 100)}% load</span>
            </div>
          </div>

          {/* General Beds Telemetry */}
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                <Activity className="h-4 w-4 text-sky-400" />
                General Beds
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                scenario.telemetry.generalBeds.status === 'optimal' ? 'bg-emerald-950 text-emerald-300' :
                scenario.telemetry.generalBeds.status === 'warning' ? 'bg-amber-950 text-amber-300' : 'bg-rose-950 text-rose-300'
              }`}>
                {scenario.telemetry.generalBeds.status}
              </span>
            </div>
            <div>
              <p className="text-xl font-black text-white">{scenario.telemetry.generalBeds.available} <span className="text-xs font-normal text-slate-400">/ {scenario.telemetry.generalBeds.total} Free</span></p>
              <p className="text-[11px] text-slate-300 mt-0.5">{scenario.telemetry.generalBeds.occupied} inpatient beds occupied</p>
            </div>
            <div className="border-t border-slate-800/80 pt-1 text-[10px] text-slate-400 flex justify-between">
              <span>Buffer: {scenario.telemetry.generalBeds.protectedReserve}</span>
              <span className="font-bold text-sky-300">{Math.round((scenario.telemetry.generalBeds.occupied / scenario.telemetry.generalBeds.total) * 100)}% load</span>
            </div>
          </div>

          {/* Operating Rooms Telemetry */}
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                <Stethoscope className="h-4 w-4 text-purple-400" />
                Operating Theatres
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                scenario.telemetry.operatingRooms.status === 'optimal' ? 'bg-emerald-950 text-emerald-300' :
                scenario.telemetry.operatingRooms.status === 'warning' ? 'bg-amber-950 text-amber-300' : 'bg-rose-950 text-rose-300'
              }`}>
                {scenario.telemetry.operatingRooms.status}
              </span>
            </div>
            <div>
              <p className="text-xl font-black text-white">{scenario.telemetry.operatingRooms.emergencyActive} Emer / {scenario.telemetry.operatingRooms.electiveActive} Elec</p>
              <p className="text-[11px] text-slate-300 mt-0.5">{scenario.telemetry.operatingRooms.total} total OR suites</p>
            </div>
            <div className="border-t border-slate-800/80 pt-1 text-[10px] text-slate-400 flex justify-between">
              <span>Turnaround: {scenario.telemetry.operatingRooms.turnaround}</span>
              <span className="font-bold text-purple-300">{scenario.telemetry.operatingRooms.reserveFree} free</span>
            </div>
          </div>

          {/* Critical Devices & Supplies */}
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                <Zap className="h-4 w-4 text-amber-400" />
                Devices &amp; Kits
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                scenario.telemetry.suppliesAndDevices.status === 'optimal' ? 'bg-emerald-950 text-emerald-300' :
                scenario.telemetry.suppliesAndDevices.status === 'warning' ? 'bg-amber-950 text-amber-300' : 'bg-rose-950 text-rose-300'
              }`}>
                {scenario.telemetry.suppliesAndDevices.status}
              </span>
            </div>
            <div>
              <p className="text-xl font-black text-white">{scenario.telemetry.suppliesAndDevices.ventilatorsInUse} Vents <span className="text-xs font-normal text-slate-400">({scenario.telemetry.suppliesAndDevices.ventilatorsFree} Free)</span></p>
              <p className="text-[11px] text-slate-300 mt-0.5">{scenario.telemetry.suppliesAndDevices.emergencyKits} emergency trauma kits</p>
            </div>
            <div className="border-t border-slate-800/80 pt-1 text-[10px] text-slate-400 flex justify-between">
              <span>{scenario.telemetry.suppliesAndDevices.ivFluidBags} IV bags</span>
              <span className="font-bold text-amber-300">{scenario.telemetry.suppliesAndDevices.vasopressorVials} vials</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search staff by name, email (vh160XX), or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-900 pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-cyan-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={selectedDiscipline}
              onChange={(e) => setSelectedDiscipline(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-600 focus:outline-none"
            >
              <option value="All">All Disciplines (50)</option>
              <option value="Surgeon">Surgeons (8)</option>
              <option value="Anesthesiologist">Anesthesiologists (6)</option>
              <option value="Physician">Physicians (8)</option>
              <option value="Nurse">Nurses (17)</option>
              <option value="Respiratory Therapist">Respiratory Therapists (2)</option>
              <option value="Pharmacist">Pharmacists (3)</option>
              <option value="Technician">Technicians (4)</option>
              <option value="Support">Support (3)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Showing <strong className="text-white">{filteredStaff.length}</strong> of 50 Staff</span>
          <span className="text-slate-600">|</span>
          <span className="text-emerald-300 font-bold flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            50 Online
          </span>
        </div>
      </div>

      {/* Main View: Network Topology Map OR Tabular Roster */}
      {viewMode === 'map' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.85fr)] gap-5">
          {/* Interactive SVG Network Map */}
          <div className="relative rounded-2xl border border-slate-800 bg-slate-950/90 p-2 overflow-hidden flex flex-col items-center justify-center min-h-[580px] shadow-inner">
            {/* Background radial glow */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-950/20 via-slate-950/80 to-slate-950" />

            {/* Subtle Grid Pattern */}
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:30px_30px]" />

            <svg
              viewBox="0 0 900 900"
              className="w-full max-w-[760px] h-auto select-none overflow-visible relative z-10"
            >
              <defs>
                {/* Radial Glow Filters */}
                <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="glow-hub" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="10" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <linearGradient id="hubGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#083344" />
                  <stop offset="50%" stopColor="#0e7490" />
                  <stop offset="100%" stopColor="#155e75" />
                </linearGradient>
              </defs>

              {/* Orbital guide circles */}
              <circle cx={mapCenter.x} cy={mapCenter.y} r={orbitalRadius} fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="3 4" opacity="0.4" />
              <circle cx={mapCenter.x} cy={mapCenter.y} r={orbitalRadius - 25} fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 4" opacity="0.3" />
              <circle cx={mapCenter.x} cy={mapCenter.y} r={orbitalRadius + 25} fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 4" opacity="0.3" />

              {/* 50 Connecting Links from Center Hub to Staff Nodes */}
              {staffNodes.map(({ person, x, y, index }) => {
                const isHovered = hoveredStaff?.staff_id === person.staff_id;
                const isPinned = pinnedStaff?.staff_id === person.staff_id;
                const matchesFilter = filteredStaff.some((f) => f.staff_id === person.staff_id);
                const color = DISCIPLINE_COLORS[person.discipline] || DISCIPLINE_COLORS.Other;
                const work = person.scenarios[selectedScenarioKey];

                const strokeColor = isHovered || isPinned
                  ? '#38bdf8'
                  : work.workloadStatus === 'Critical'
                  ? '#f43f5e'
                  : work.workloadStatus === 'High'
                  ? '#38bdf8'
                  : color.glow;

                const strokeWidth = isHovered || isPinned ? 3 : matchesFilter ? 1.2 : 0.4;
                const opacity = matchesFilter ? (isHovered || isPinned ? 1 : 0.45) : 0.15;

                return (
                  <g key={`link-${person.staff_id}`}>
                    <line
                      x1={mapCenter.x}
                      y1={mapCenter.y}
                      x2={x}
                      y2={y}
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      opacity={opacity}
                      strokeDasharray={isHovered || isPinned ? undefined : '2 3'}
                      className="transition-all duration-300"
                    />
                    {/* Animated Pulse on active/hovered link */}
                    {(isHovered || isPinned || work.workloadStatus === 'Critical') && (
                      <circle
                        r={isHovered || isPinned ? 3 : 2}
                        fill={isHovered || isPinned ? '#38bdf8' : '#fb7185'}
                      >
                        <animateMotion
                          path={`M ${mapCenter.x} ${mapCenter.y} L ${x} ${y}`}
                          dur={isHovered || isPinned ? '1.8s' : '3s'}
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}
                  </g>
                );
              })}

              {/* CENTRAL NODE: 24h Hospital Operations Command Hub */}
              <g className="cursor-pointer">
                {/* Outer pulsating ring */}
                <circle cx={mapCenter.x} cy={mapCenter.y} r="85" fill="#083344" opacity="0.2">
                  <animate attributeName="r" values="80;95;80" dur="4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.2;0.05;0.2" dur="4s" repeatCount="indefinite" />
                </circle>

                <circle cx={mapCenter.x} cy={mapCenter.y} r="72" fill="url(#hubGrad)" filter="url(#glow-hub)" stroke="#38bdf8" strokeWidth="2.5" />

                {/* Center Hub Inner Graphics */}
                <circle cx={mapCenter.x} cy={mapCenter.y} r="58" fill="#021c27" stroke="#0e7490" strokeWidth="1" />

                <text x={mapCenter.x} y={mapCenter.y - 20} textAnchor="middle" fill="#7dd3fc" fontSize="10" fontWeight="900" letterSpacing="1">
                  HOSPITAL 24H HUB
                </text>
                <text x={mapCenter.x} y={mapCenter.y - 2} textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="900">
                  COMMAND CENTER
                </text>
                <text x={mapCenter.x} y={mapCenter.y + 16} textAnchor="middle" fill="#38bdf8" fontSize="10" fontWeight="bold">
                  50 Active Staff Links
                </text>
                <text x={mapCenter.x} y={mapCenter.y + 32} textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="600">
                  {scenario.title.slice(0, 24)}...
                </text>
              </g>

              {/* 50 Staff Nodes */}
              {staffNodes.map(({ person, x, y, index }) => {
                const isHovered = hoveredStaff?.staff_id === person.staff_id;
                const isPinned = pinnedStaff?.staff_id === person.staff_id;
                const matchesFilter = filteredStaff.some((f) => f.staff_id === person.staff_id);
                const color = DISCIPLINE_COLORS[person.discipline] || DISCIPLINE_COLORS.Other;
                const work = person.scenarios[selectedScenarioKey];
                const isCritical = work.workloadStatus === 'Critical';

                const nodeRadius = isHovered || isPinned ? 14 : matchesFilter ? 9.5 : 6;
                const nodeFill = isHovered || isPinned ? '#0284c7' : color.dot;
                const opacity = matchesFilter ? 1 : 0.25;

                return (
                  <g
                    key={`node-${person.staff_id}`}
                    transform={`translate(${x}, ${y})`}
                    className="cursor-pointer transition-transform duration-200"
                    onMouseEnter={() => setHoveredStaff(person)}
                    onMouseLeave={() => setHoveredStaff(null)}
                    onClick={() => setPinnedStaff(person)}
                  >
                    {/* Critical workload halo ring */}
                    {isCritical && (
                      <circle
                        r="18"
                        fill="none"
                        stroke="#f43f5e"
                        strokeWidth="1.5"
                        strokeDasharray="2 2"
                        className="animate-spin origin-center"
                        style={{ transformOrigin: '0 0' }}
                      />
                    )}

                    {/* Node Hover halo */}
                    {(isHovered || isPinned) && (
                      <circle
                        r="22"
                        fill="#0284c7"
                        opacity="0.25"
                        filter="url(#glow-cyan)"
                      />
                    )}

                    {/* The Node Circle */}
                    <circle
                      r={nodeRadius}
                      fill={nodeFill}
                      stroke={isHovered || isPinned ? '#ffffff' : isCritical ? '#f43f5e' : '#0f172a'}
                      strokeWidth={isHovered || isPinned ? 2.5 : 1.5}
                      opacity={opacity}
                      filter={isHovered || isPinned ? 'url(#glow-cyan)' : undefined}
                    />

                    {/* Inner core dot */}
                    <circle
                      r={nodeRadius * 0.4}
                      fill={isHovered || isPinned ? '#ffffff' : '#0f172a'}
                      opacity={opacity}
                    />

                    {/* Node label (always visible for hovered/pinned, otherwise on match) */}
                    {(isHovered || isPinned || (filteredStaff.length <= 15 && matchesFilter)) && (
                      <g transform={`translate(${x > mapCenter.x ? 18 : -18}, ${y > mapCenter.y ? 14 : -14})`}>
                        <rect
                          x={x > mapCenter.x ? 0 : -130}
                          y="-10"
                          width="130"
                          height="20"
                          rx="4"
                          fill="#020617"
                          stroke={isHovered || isPinned ? '#38bdf8' : '#334155'}
                          strokeWidth="1"
                          opacity="0.95"
                        />
                        <text
                          x={x > mapCenter.x ? 8 : -8}
                          y="4"
                          textAnchor={x > mapCenter.x ? 'start' : 'end'}
                          fill="#f8fafc"
                          fontSize="9"
                          fontWeight="bold"
                        >
                          {person.full_name}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>

            <div className="absolute bottom-3 left-3 text-[10px] text-slate-400 bg-slate-950/80 rounded-lg px-2.5 py-1.5 border border-slate-800 flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-400" /> Hover node for quick view</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400" /> Click node to lock inspector</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" /> Red ring = Critical Station</span>
            </div>
          </div>

          {/* Right Inspector Card: Hovered / Pinned Staff 24h Details */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-5 flex flex-col justify-between space-y-4 shadow-xl">
            <div className="space-y-4">
              {/* Header with Avatar & Details */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-800 to-slate-900 border border-cyan-600/50 text-white font-black text-lg shadow-md">
                    {activeStaff.full_name.replace('Dr. ', '').replace('Nurse ', '').replace('Technician ', '').replace('Pharmacist ', '').replace('Support ', '').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-black text-white">{activeStaff.full_name}</h4>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-cyan-300">
                        {activeStaff.staffCode}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 flex items-center gap-2 mt-0.5">
                      <span className="font-semibold text-cyan-200">{activeStaff.discipline}</span>
                      <span>·</span>
                      <span className="text-slate-400">{activeStaff.department}</span>
                    </p>
                  </div>
                </div>

                <span className={`rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase ${
                  WORKLOAD_BADGES[activeWork.workloadStatus]?.bg || 'bg-slate-800 text-slate-300'
                }`}>
                  {activeWork.workloadStatus}
                </span>
              </div>

              {/* Login Credentials & Contact Strip */}
              <div className="grid grid-cols-2 gap-2 text-[11px] rounded-xl bg-slate-900/90 border border-slate-800 p-2.5">
                <div>
                  <span className="text-slate-400 block text-[10px] flex items-center gap-1"><Mail className="h-3 w-3 text-cyan-400" /> Work Email:</span>
                  <span className="font-mono text-white text-xs font-bold truncate block">{activeStaff.email}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] flex items-center gap-1"><Lock className="h-3 w-3 text-amber-400" /> Default Password:</span>
                  <span className="font-mono text-amber-200 text-xs font-bold block">{activeStaff.defaultPassword}</span>
                </div>
                <div className="mt-1">
                  <span className="text-slate-400 block text-[10px] flex items-center gap-1"><Phone className="h-3 w-3 text-emerald-400" /> Direct Phone:</span>
                  <span className="text-slate-200 text-xs font-semibold">{activeStaff.phone}</span>
                </div>
                <div className="mt-1">
                  <span className="text-slate-400 block text-[10px] flex items-center gap-1"><Clock className="h-3 w-3 text-indigo-400" /> Contract Hours:</span>
                  <span className="text-slate-200 text-xs font-semibold">{activeStaff.contract_hours_per_week} hrs/week</span>
                </div>
              </div>

              {/* 24-Hour Duty & Individual Work Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-cyan-400" />
                    24h Duty Assignment ({scenario.title})
                  </h5>
                  <span className="text-[10px] text-slate-400 font-mono">{activeWork.shiftHours}</span>
                </div>

                {/* Assigned Unit & Role Banner */}
                <div className="rounded-xl border border-cyan-800/60 bg-cyan-950/30 p-3 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Assigned Station / Unit:</span>
                    <strong className="text-cyan-200">{activeWork.assignedUnit}</strong>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Scenario Role:</span>
                    <span className="text-white font-semibold">{activeWork.roleTitle}</span>
                  </div>
                </div>

                {/* Granular Individual Work Description */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 space-y-2">
                  <p className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    Primary 24-Hour Clinical / Operational Work
                  </p>
                  <p className="text-xs text-slate-200 leading-relaxed font-medium">
                    {activeWork.primaryWork}
                  </p>

                  <div className="border-t border-slate-800/80 pt-2">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Secondary Protocols &amp; Safety Checks</p>
                    <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                      {activeWork.secondaryWork}
                    </p>
                  </div>
                </div>

                {/* Critical Equipment / Supplies Assigned */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-400 shrink-0" />
                    <div>
                      <span className="block text-[10px] text-slate-400">Assigned Critical Device / Supply:</span>
                      <strong className="text-amber-200">{activeWork.criticalDeviceOrSupply}</strong>
                    </div>
                  </div>
                  <span className="rounded bg-slate-800 px-2 py-1 text-[9px] font-bold text-slate-300">
                    Verified
                  </span>
                </div>

                {/* Skills tags */}
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1.5">Certified Clinical Skills</span>
                  <div className="flex flex-wrap gap-1.5">
                    {activeStaff.skills.map((skill) => (
                      <span key={skill} className="rounded-md border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-300">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick action bar */}
            <div className="border-t border-slate-800 pt-3 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-400">
                Staff Account Status: <strong className="text-emerald-300">Active</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  const info = `Staff: ${activeStaff.full_name}\nEmail: ${activeStaff.email}\nPassword: ${activeStaff.defaultPassword}\nDepartment: ${activeStaff.department}\nScenario Work: ${activeWork.primaryWork}`;
                  void navigator.clipboard?.writeText(info);
                  setCopiedNotice(`Copied details for ${activeStaff.full_name}!`);
                  setTimeout(() => setCopiedNotice(null), 3000);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800"
              >
                <Copy className="h-3 w-3" />
                Copy Staff Work Plan
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Dense Tabular Roster of all 50 Synthetic Staff */
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left text-xs text-slate-300 min-w-[840px]">
            <thead className="bg-slate-900 text-[10px] font-bold uppercase text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-3">Staff Code &amp; Name</th>
                <th className="p-3">Work Email (vh160XX)</th>
                <th className="p-3">Discipline</th>
                <th className="p-3">Department</th>
                <th className="p-3">Shift Hours</th>
                <th className="p-3">Active Workload</th>
                <th className="p-3">24-Hour Individual Work ({scenario.title.slice(0, 16)}...)</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredStaff.map((person) => {
                const work = person.scenarios[selectedScenarioKey];
                const color = DISCIPLINE_COLORS[person.discipline] || DISCIPLINE_COLORS.Other;
                return (
                  <tr key={person.staff_id} className="hover:bg-slate-900/60 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color.dot }} />
                        {person.full_name}
                      </div>
                      <span className="text-[10px] font-mono text-cyan-300">{person.staffCode}</span>
                    </td>
                    <td className="p-3 font-mono text-xs text-slate-300">
                      {person.email}
                    </td>
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${color.bg} ${color.text} border ${color.border}`}>
                        {person.discipline}
                      </span>
                    </td>
                    <td className="p-3 text-slate-300">{person.department}</td>
                    <td className="p-3 text-[11px] text-slate-400">{work.shiftHours}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                        WORKLOAD_BADGES[work.workloadStatus]?.bg || 'bg-slate-800'
                      }`}>
                        {work.workloadStatus}
                      </span>
                    </td>
                    <td className="p-3 text-[11px] text-slate-300 max-w-xs truncate" title={work.primaryWork}>
                      {work.primaryWork}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setPinnedStaff(person);
                          setViewMode('map');
                        }}
                        className="rounded border border-cyan-800 px-2 py-1 text-[10px] font-bold text-cyan-300 hover:bg-cyan-950"
                      >
                        Inspect Map
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Governance & Privacy Notice */}
      <footer className="flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-[11px] text-slate-400">
        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Staff Operations Privacy &amp; Authority Notice:</strong> All 50 staff records (<span className="font-mono text-cyan-300">vh16001–vh16050@velhightech.com</span>) are synthetic demonstration fixtures dedicated to hospital operational simulation and constraint testing. No real identifiable clinician or patient personal information is utilized. Operational next steps require clinical director authorization before physical shifts or surgical allocations are altered.
        </p>
      </footer>
    </section>
  );
};
