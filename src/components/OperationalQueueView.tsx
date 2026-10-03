import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  ListOrdered,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  Droplets,
  Truck,
  Wind,
  ShieldCheck,
  RefreshCw,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  UserCheck,
  Info,
  Sparkles,
  Layers
} from 'lucide-react';
import {
  getOperationalQueue,
  OperationalQueueItem
} from '../services/emergencyCaseService';
import { subscribeToSupabaseRealtime } from '../services/supabaseDataLayer';
import { LoadingState, ErrorState } from './common/EmptyState';

interface OperationalQueueViewProps {
  title?: string;
  subtitle?: string;
  filterHospitalId?: string; // Optional: filter queue for specific hospital
}

export const OperationalQueueView: React.FC<OperationalQueueViewProps> = ({
  title = "Operational Emergency Priority Queue",
  subtitle = "Deterministic triage queue governed by clinical severity tiers and multi-factor operational capacity scoring.",
  filterHospitalId
}) => {
  const { userProfile } = useAuth();
  const [queueItems, setQueueItems] = useState<OperationalQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const fetchQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      let items = await getOperationalQueue();
      if (filterHospitalId) {
        items = items.filter(
          (item) => item.assigned_hospital?.hospital_id === filterHospitalId
        );
        // Recalculate positions after filtering
        items = items.map((item, idx) => ({ ...item, queue_position: idx + 1 }));
      }
      setQueueItems(items);
    } catch (err: any) {
      console.error('Fetch queue error:', err);
      setError('Failed to load operational priority queue from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();

    const unsubscribe = subscribeToSupabaseRealtime(
      ['patient_requests', 'emergency_cases', 'ai_recommendations', 'hospitals', 'blood_banks', 'ambulances'],
      () => fetchQueue()
    );

    return () => unsubscribe();
  }, [filterHospitalId]);

  const toggleExpand = (caseId: string) => {
    setExpandedItemId((prev) => (prev === caseId ? null : caseId));
  };

  const getPriorityBadgeStyle = (tier: string) => {
    switch (tier) {
      case 'Critical':
        return 'bg-rose-950/90 text-rose-300 border-rose-800 animate-pulse';
      case 'High':
        return 'bg-amber-950/90 text-amber-300 border-amber-800';
      case 'Medium':
        return 'bg-blue-950/90 text-blue-300 border-blue-800';
      case 'Low':
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'Assigned':
      case 'In Progress':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800';
      case 'Completed':
        return 'bg-blue-950/80 text-blue-300 border-blue-800';
      case 'Cancelled':
        return 'bg-slate-800 text-slate-400 border-slate-700';
      case 'Open':
      default:
        return 'bg-amber-950/60 text-amber-300 border-amber-700/80';
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-6 shadow-2xl">
      {/* Toast Notification */}
      {actionSuccess && (
        <div className="bg-emerald-950/90 border border-emerald-700 text-emerald-200 p-3 rounded-xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <ListOrdered className="w-5 h-5 text-sky-400" />
            <h2 className="text-lg font-black text-white">{title}</h2>
            <span className="bg-sky-950 text-sky-300 border border-sky-800 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
              {queueItems.length} Active Cases
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">{subtitle}</p>
        </div>

        <button
          onClick={fetchQueue}
          disabled={loading}
          className="self-start md:self-auto p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl cursor-pointer transition-all flex items-center gap-1.5 text-xs font-bold"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Triage Protocol & Academic Disclaimer Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-white block">Deterministic Triage Hierarchy</span>
            <p className="text-[11px] text-slate-400 leading-normal">
              1. Confirmed Priority Tier (Critical &gt; High &gt; Medium &gt; Low) <br />
              2. Multi-factor Score Descending &rarr; 3. Waiting Time Ascending &rarr; 4. UUID Tie-Break
            </p>
          </div>
        </div>

        <div className="bg-amber-950/30 p-3.5 rounded-xl border border-amber-500/30 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-amber-300 block">Mandatory Human Confirmation</span>
            <p className="text-[11px] text-amber-200/80 leading-normal">
              AI algorithms calculate operational feasibility only. Human operators MUST explicitly review and finalize provider assignments prior to dispatch.
            </p>
          </div>
        </div>
      </div>

      {/* Main Queue Table / Cards */}
      {loading ? (
        <LoadingState message="Calculating deterministic priority queue metrics..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchQueue} />
      ) : queueItems.length === 0 ? (
        <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-8 text-center space-y-3">
          <div className="w-10 h-10 bg-slate-900 border border-slate-800 text-slate-500 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <h3 className="text-sm font-bold text-white">No Pending Cases in Operational Queue</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            All patient emergency requests have been reviewed or resolved. New incoming patient requests will appear here automatically in real-time.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {queueItems.map((item) => {
            const isConfirmed = item.case_status === 'Assigned' || item.case_status === 'In Progress' || item.case_status === 'Completed';
            const isExpanded = expandedItemId === item.case_id;

            return (
              <div
                key={item.case_id}
                className={`bg-slate-950 border rounded-2xl p-4 sm:p-5 transition-all space-y-4 ${
                  isConfirmed
                    ? 'border-emerald-800/60 bg-slate-950/90'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Row Header: Rank, Priority Tier, Case ID, Score, Action */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  
                  {/* Left: Rank & Identifier Badges */}
                  <div className="flex items-center flex-wrap gap-2.5">
                    {/* Queue Position Pill */}
                    <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 text-white flex items-center justify-center font-black font-mono text-sm shrink-0">
                      #{item.queue_position}
                    </div>

                    {/* Severity Badge */}
                    <span
                      className={`px-3 py-1 rounded-xl text-xs font-black uppercase border tracking-wide ${getPriorityBadgeStyle(
                        item.priority_tier
                      )}`}
                    >
                      {item.priority_tier} Priority
                    </span>

                    {/* Operational Priority Score Pill */}
                    <div className="bg-blue-950/80 text-blue-200 border border-blue-800/80 px-3 py-1 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                      <span>Score: <strong className="text-white">{item.priority_score}</strong>/100</span>
                    </div>

                    {/* Waiting Time */}
                    <div className="bg-slate-900 border border-slate-800 text-slate-300 px-3 py-1 rounded-xl text-xs font-mono flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>{item.waiting_time_minutes}m wait</span>
                    </div>

                    {/* Case Status */}
                    <span
                      className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold border ${getStatusBadgeStyle(
                        item.case_status
                      )}`}
                    >
                      {item.case_status}
                    </span>
                  </div>

                  {/* Right: Human Confirmation Action Button */}
                  <div className="flex items-center gap-2 self-end lg:self-auto">
                    <button
                      onClick={() => toggleExpand(item.case_id)}
                      className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      title="View score breakdown"
                    >
                      <Info className="w-3.5 h-3.5 text-sky-400" />
                      <span className="hidden sm:inline">Factors</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {!isConfirmed ? (
                      <div className="px-3 py-1.5 bg-slate-900 border border-slate-800 text-slate-400 rounded-xl text-xs flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                        <span className="text-[11px]">Only an authorised Clinician Reviewer can confirm urgency.</span>
                      </div>
                    ) : (
                      <div className="px-3.5 py-1.5 bg-emerald-950/80 border border-emerald-700/80 text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Clinician Confirmed</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Identifiers & Demand Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-xs">
                  {/* Case & Request IDs */}
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800/80 space-y-1">
                    <div className="text-[10px] text-slate-500 uppercase font-mono font-bold">Identifiers</div>
                    <div className="font-mono text-slate-200 text-[11px] truncate">
                      Case ID: <span className="text-sky-300">{item.case_id}</span>
                    </div>
                    <div className="font-mono text-slate-400 text-[11px] truncate">
                      Req ID: <span className="text-slate-300">{item.request_id}</span>
                    </div>
                  </div>

                  {/* Demanded Clinical Resources */}
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800/80 space-y-1 md:col-span-2">
                    <div className="text-[10px] text-slate-500 uppercase font-mono font-bold">
                      Requested Emergency Resources ({item.required_resources.emergency_type})
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {item.required_resources.needs_icu && (
                        <span className="bg-rose-950/70 border border-rose-800 text-rose-300 text-[10px] px-2 py-0.5 rounded font-bold">
                          ICU Bed
                        </span>
                      )}
                      {item.required_resources.needs_general_bed && (
                        <span className="bg-blue-950/70 border border-blue-800 text-blue-300 text-[10px] px-2 py-0.5 rounded font-bold">
                          General Bed
                        </span>
                      )}
                      {item.required_resources.needs_oxygen && (
                        <span className="bg-sky-950/70 border border-sky-800 text-sky-300 text-[10px] px-2 py-0.5 rounded font-bold flex items-center gap-1">
                          <Wind className="w-3 h-3 text-sky-400" />
                          Oxygen
                        </span>
                      )}
                      {item.required_resources.needs_blood && (
                        <span className="bg-red-950/70 border border-red-800 text-red-300 text-[10px] px-2 py-0.5 rounded font-bold flex items-center gap-1">
                          <Droplets className="w-3 h-3 text-red-400" />
                          Blood ({item.required_resources.blood_group || 'Any'})
                        </span>
                      )}
                      {item.required_resources.needs_ambulance && (
                        <span className="bg-amber-950/70 border border-amber-800 text-amber-300 text-[10px] px-2 py-0.5 rounded font-bold flex items-center gap-1">
                          <Truck className="w-3 h-3 text-amber-400" />
                          Ambulance
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Associated Real Providers Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                  {/* Hospital */}
                  <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5 text-blue-400 font-bold text-[11px]">
                      <Building2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Recommended Hospital</span>
                    </div>
                    {item.assigned_hospital ? (
                      <div>
                        <p className="font-bold text-white text-xs truncate">{item.assigned_hospital.hospital_name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{item.assigned_hospital.district}, {item.assigned_hospital.state}</p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 italic">No hospital assigned</p>
                    )}
                  </div>

                  {/* Blood Bank */}
                  <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5 text-rose-400 font-bold text-[11px]">
                      <Droplets className="w-3.5 h-3.5 shrink-0" />
                      <span>Blood Bank Allocation</span>
                    </div>
                    {item.assigned_blood_bank ? (
                      <div>
                        <p className="font-bold text-white text-xs truncate">{item.assigned_blood_bank.blood_bank_name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{item.assigned_blood_bank.district}</p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 italic">
                        {item.required_resources.needs_blood ? 'Evaluating blood bank...' : 'Blood not required'}
                      </p>
                    )}
                  </div>

                  {/* Ambulance */}
                  <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
                      <Truck className="w-3.5 h-3.5 shrink-0" />
                      <span>Ambulance Unit</span>
                    </div>
                    {item.assigned_ambulance ? (
                      <div>
                        <p className="font-bold text-white text-xs truncate">Unit {item.assigned_ambulance.vehicle_number}</p>
                        <p className="text-[10px] text-slate-400 truncate">Driver: {item.assigned_ambulance.driver_name || 'Assigned'} ({item.assigned_ambulance.ambulance_type})</p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 italic">
                        {item.required_resources.needs_ambulance ? 'Dispatching unit...' : 'Transit not requested'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Score Factor Expandable Drawer */}
                {isExpanded && (
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3 animate-in fade-in duration-200 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="font-bold text-white text-xs flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                        Operational Priority Score Breakdown (Total: {item.priority_score}/100)
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Formula: Sum(Factor &times; Weight)</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
                        <span className="text-[10px] text-slate-400 block">Time to Need (35%)</span>
                        <p className="font-mono font-bold text-sky-300">{item.score_factors.time_to_need}</p>
                        <p className="text-[9px] text-slate-500 font-mono">35 &times; {item.score_factors.time_to_need} = {Math.round(35 * item.score_factors.time_to_need)}</p>
                      </div>

                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
                        <span className="text-[10px] text-slate-400 block">Capped Wait (25%)</span>
                        <p className="font-mono font-bold text-sky-300">{item.score_factors.capped_waiting_time}</p>
                        <p className="text-[9px] text-slate-500 font-mono">25 &times; {item.score_factors.capped_waiting_time} = {Math.round(25 * item.score_factors.capped_waiting_time)}</p>
                      </div>

                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
                        <span className="text-[10px] text-slate-400 block">No Alt Avail (15%)</span>
                        <p className="font-mono font-bold text-sky-300">{item.score_factors.no_alternative_available}</p>
                        <p className="text-[9px] text-slate-500 font-mono">15 &times; {item.score_factors.no_alternative_available} = {Math.round(15 * item.score_factors.no_alternative_available)}</p>
                      </div>

                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
                        <span className="text-[10px] text-slate-400 block">Resource Compat (10%)</span>
                        <p className="font-mono font-bold text-sky-300">{item.score_factors.resource_compatibility}</p>
                        <p className="text-[9px] text-slate-500 font-mono">10 &times; {item.score_factors.resource_compatibility} = {Math.round(10 * item.score_factors.resource_compatibility)}</p>
                      </div>

                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
                        <span className="text-[10px] text-slate-400 block">Logistics Feas (10%)</span>
                        <p className="font-mono font-bold text-sky-300">{item.score_factors.logistics_feasibility}</p>
                        <p className="text-[9px] text-slate-500 font-mono">10 &times; {item.score_factors.logistics_feasibility} = {Math.round(10 * item.score_factors.logistics_feasibility)}</p>
                      </div>

                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 space-y-1">
                        <span className="text-[10px] text-slate-400 block">Data Conf (5%)</span>
                        <p className="font-mono font-bold text-sky-300">{item.score_factors.data_confidence}</p>
                        <p className="text-[9px] text-slate-500 font-mono">5 &times; {item.score_factors.data_confidence} = {Math.round(5 * item.score_factors.data_confidence)}</p>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 italic">
                      {item.recommendation_reason || 'Facility evaluations verified.'}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
