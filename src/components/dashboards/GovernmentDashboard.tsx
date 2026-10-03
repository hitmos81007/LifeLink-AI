import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Building2,
  Droplets,
  Truck,
  HeartPulse,
  Activity,
  BarChart3,
  RefreshCw,
  Globe,
  Layers,
  FileText,
  ShieldCheck,
  Zap,
  Clock,
  AlertTriangle,
  Lock
} from 'lucide-react';
import { ResourceTransferManager } from '../ResourceTransferManager';
import { OperationalPredictionManager } from '../OperationalPredictionManager';
import {
  getGovernmentOverviewMetrics,
  getGovernmentEmergencyCaseCounts,
  getResourceTransfers,
  getAuditLogs,
  GovernmentOverviewMetrics,
  GovernmentEmergencyCounts
} from '../../services/governmentService';
import { ResourceTransferTable, AuditLogTable } from '../../types/database';
import { subscribeToSupabaseRealtime } from '../../services/supabaseDataLayer';
import { LoadingState, ErrorState } from '../common/EmptyState';

export const GovernmentDashboard: React.FC = () => {
  const { userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [metrics, setMetrics] = useState<GovernmentOverviewMetrics>({
    totalHospitals: 0,
    totalBloodBanks: 0,
    totalAmbulanceProviders: 0,
    totalAmbulances: 0,
    totalPatientRequests: 0,
    activeEmergencyCases: 0,
    totalResourceTransfers: 0,
    totalAuditLogs: 0
  });

  const [emergencyCounts, setEmergencyCounts] = useState<GovernmentEmergencyCounts>({
    pendingPatientRequests: 0,
    confirmedEmergencyCases: 0
  });

  const [transfers, setTransfers] = useState<ResourceTransferTable[]>([]);
  const [logs, setLogs] = useState<AuditLogTable[]>([]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, counts, tr, lg] = await Promise.all([
        getGovernmentOverviewMetrics(),
        getGovernmentEmergencyCaseCounts(),
        getResourceTransfers(),
        getAuditLogs()
      ]);
      setMetrics(m);
      setEmergencyCounts(counts);
      setTransfers(tr);
      setLogs(lg);
    } catch (err: any) {
      console.error('GovernmentDashboard load error:', err);
      setError('Failed to fetch state oversight metrics from Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const unsubscribe = subscribeToSupabaseRealtime(
      ['hospitals', 'blood_banks', 'ambulance_providers', 'ambulances', 'patient_requests', 'emergency_cases', 'resource_transfers', 'audit_logs'],
      () => fetchData()
    );

    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6 rounded-2xl border border-slate-800 shadow-2xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Globe className="w-6 h-6 text-sky-400" />
            <h1 className="text-xl font-black text-white">Government Oversight Dashboard</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Logged in as: <strong className="text-white">{userProfile?.full_name || 'State Administrator'}</strong> (Role: <span className="text-sky-400 font-bold">government_admin</span>)
          </p>
        </div>

        <button
          onClick={fetchData}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl cursor-pointer transition-all flex items-center gap-1.5 text-xs font-bold"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Sync State Data</span>
        </button>
      </div>

      {loading ? (
        <LoadingState message="Loading state healthcare metrics from Supabase..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchData} />
      ) : (
        <div className="space-y-6">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-1">
              <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
                <Building2 className="w-4 h-4 text-sky-400" />
                <span>Hospitals</span>
              </div>
              <p className="text-2xl font-black text-white font-mono">{metrics.totalHospitals}</p>
            </div>

            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-1">
              <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
                <Droplets className="w-4 h-4 text-red-400" />
                <span>Blood Banks</span>
              </div>
              <p className="text-2xl font-black text-white font-mono">{metrics.totalBloodBanks}</p>
            </div>

            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-1">
              <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
                <Truck className="w-4 h-4 text-amber-400" />
                <span>Ambulances</span>
              </div>
              <p className="text-2xl font-black text-white font-mono">{metrics.totalAmbulances} <span className="text-xs text-slate-500 font-normal">({metrics.totalAmbulanceProviders} providers)</span></p>
            </div>

            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-1">
              <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
                <HeartPulse className="w-4 h-4 text-rose-400" />
                <span>Active Cases</span>
              </div>
              <p className="text-2xl font-black text-rose-400 font-mono">{metrics.activeEmergencyCases} <span className="text-xs text-slate-500 font-normal">/ {metrics.totalPatientRequests} requests</span></p>
            </div>
          </div>

          {/* Emergency Triage & Case Oversight (Read-Only Aggregate View - GAP-01, GAP-02) */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span>State Emergency Triage & Case Oversight</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  High-level oversight of incoming emergency requests and verified cases across the district.
                </p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-[11px] text-slate-400 font-mono">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Aggregated District View</span>
              </div>
            </div>

            {/* Authority Isolation Notice Banner */}
            <div className="p-4 bg-blue-950/40 border border-blue-800/60 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <p className="font-bold text-blue-200">Clinical Authority Boundary</p>
                <p className="text-blue-300/90 leading-relaxed">
                  Clinical urgency confirmation is restricted to authorised Clinician Reviewers. Government administrators monitor macro-level aggregate metrics and do not alter clinical triage tiers or individual emergency records.
                </p>
              </div>
            </div>

            {/* Read-Only Aggregate Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pending Patient Requests</span>
                  <HeartPulse className="w-4 h-4 text-amber-400" />
                </div>
                <p className="text-3xl font-black text-amber-300 font-mono">
                  {emergencyCounts.pendingPatientRequests}
                </p>
                <p className="text-[11px] text-slate-500">
                  Patient SOS submissions currently awaiting clinician review.
                </p>
              </div>

              <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clinician-Confirmed Cases</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-3xl font-black text-emerald-400 font-mono">
                  {emergencyCounts.confirmedEmergencyCases}
                </p>
                <p className="text-[11px] text-slate-500">
                  Verified emergency cases with authorized clinical urgency ratings.
                </p>
              </div>
            </div>
          </div>

          {/* Inter-Hospital Resource Transfers Manager */}
          <ResourceTransferManager
            title="Statewide Inter-Hospital Resource Transfers"
            subtitle="Government authority monitoring and approval workflow for inter-hospital asset transfers."
          />

          {/* Statewide Operational Demand Predictions & Aggregated Stockout Risks */}
          <OperationalPredictionManager
            isGovtAdmin={true}
            title="Statewide Aggregated Operational Demand Predictions"
            subtitle="Authorized government view displaying aggregated stockout forecasts across all regional medical facilities calculated from live Supabase inventory and demand logs."
          />

          {/* Resource Transfers & Audit Logs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Resource Transfers Table */}
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4">
              <div>
                <h2 className="text-base font-black text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-400" />
                  <span>Inter-Hospital Resource Transfers (resource_transfers)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">Live allocation workflows across regional medical facilities.</p>
              </div>

              {transfers.length === 0 ? (
                <p className="text-xs text-slate-500">No active resource transfers.</p>
              ) : (
                <div className="space-y-3">
                  {transfers.map((tr) => (
                    <div key={tr.transfer_id} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="font-extrabold text-white text-sm">{tr.resource_type}: {tr.resource_name || 'Generic Asset'}</span>
                        <span className="px-2.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded font-bold text-[10px]">
                          {tr.status}
                        </span>
                      </div>
                      <p className="text-slate-400 font-mono">Quantity: {tr.quantity} units</p>
                      {tr.remarks && <p className="text-slate-400 text-[11px]">Remarks: {tr.remarks}</p>}
                      <p className="text-[10px] text-slate-500 font-mono">Created: {new Date(tr.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Audit Logs Stream */}
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4">
              <div>
                <h2 className="text-base font-black text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span>System Audit Stream (audit_logs)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">Automated security and compliance logging.</p>
              </div>

              {logs.length === 0 ? (
                <p className="text-xs text-slate-500">No audit logs recorded yet.</p>
              ) : (
                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                  {logs.map((log) => (
                    <div key={log.log_id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1 text-xs">
                      <div className="flex justify-between items-center font-mono">
                        <span className="text-sky-400 font-bold">{log.action} on `{log.table_name}`</span>
                        <span className="text-[10px] text-slate-500">{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-slate-400 text-[11px] truncate">User Agent: {log.user_agent || 'System Trigger'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
