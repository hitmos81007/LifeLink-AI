import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Activity,
  Droplets,
  Building2,
  Pill,
  Ambulance,
  ShieldCheck,
  RefreshCw,
  Filter,
  Download,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  Layers,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Sliders
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell
} from 'recharts';
import {
  getAnalyticsSummary,
  getTimeSeriesData,
  getResourceUtilization
} from '../services/analyticsService';
import {
  AnalyticsSummary,
  TimeSeriesPoint,
  ResourceUtilizationData
} from '../types/entities';
import { EmptyState, LoadingState } from './common/EmptyState';

export const AnalyticsDashboardView: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | '90d'>('30d');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [exportNotice, setExportNotice] = useState(false);

  const [loading, setLoading] = useState(true);
  const [sectionErrors, setSectionErrors] = useState<string[]>([]);

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
  const [resourceHealthScores, setResourceHealthScores] = useState<ResourceUtilizationData[]>([]);

  const loadData = async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      getAnalyticsSummary(),
      getTimeSeriesData(timeRange),
      getResourceUtilization()
    ]);
    const errors: string[] = [];
    const [summaryResult, trendsResult, utilizationResult] = results;

    if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value);
    else {
      setSummary(null);
      errors.push(`Summary unavailable: ${summaryResult.reason?.message || 'query failed'}`);
    }
    if (trendsResult.status === 'fulfilled') setTimeSeries(trendsResult.value);
    else {
      setTimeSeries([]);
      errors.push(`Request trends unavailable: ${trendsResult.reason?.message || 'query failed'}`);
    }
    if (utilizationResult.status === 'fulfilled') setResourceHealthScores(utilizationResult.value);
    else {
      setResourceHealthScores([]);
      errors.push(`ICU capacity unavailable: ${utilizationResult.reason?.message || 'query failed'}`);
    }

    setSectionErrors(errors);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [timeRange]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const handleExport = () => {
    const rows: (string | number | null)[][] = [
      ['metric', 'value'],
      ['patient_requests_visible', summary?.totalRequests ?? null],
      ['average_response_time_minutes', summary?.averageResponseTimeMinutes ?? null],
      ['lives_saved', summary?.livesSaved ?? null],
      ['icu_committed_capacity_percent', summary?.icuCommittedRate ?? null],
      ['blood_assignment_percent', summary?.bloodAssignmentRate ?? null],
      ['system_uptime_percent', summary?.systemUptimePercent ?? null]
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `lifelink-prototype-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExportNotice(true);
    setTimeout(() => setExportNotice(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-4">
      {/* Executive Command Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
              <span className="px-2.5 py-1 text-xs font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded flex items-center gap-1">
              <BarChart3 className="w-3.5 h-3.5 text-blue-400" /> Prototype Analytics
            </span>
            <span className="px-2.5 py-1 text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded">
              Supabase-backed
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Healthcare Resource Summary
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
            Counts and occupancy are calculated from records visible to your account. Response outcomes and system uptime are not currently measured.
          </p>
        </div>

        {/* Global Controls & Refresh */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="bg-slate-800 p-1 rounded-xl border border-slate-700 flex gap-1 text-xs font-mono">
            {(['24h', '7d', '30d', '90d'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTimeRange(t)}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  timeRange === t ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          <span className="bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold rounded-xl p-2 font-mono">All accessible facilities</span>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl cursor-pointer transition-all flex items-center gap-2 text-xs font-bold"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh Data</span>
          </button>

          <button
            onClick={handleExport}
            className="px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-blue-600/30"
          >
            <Download className="w-4 h-4" />
            <span>Export Analytics</span>
          </button>
        </div>
      </div>

      {exportNotice && (
        <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 rounded-xl text-xs font-bold text-center animate-in fade-in">
          Prototype analytics CSV downloaded.
        </div>
      )}

      {loading ? (
        <LoadingState message="Loading analytics from the records available to this Supabase account..." />
      ) : (
        <div className="space-y-6">
          {sectionErrors.length > 0 && (
            <div className="rounded-xl border border-amber-700/60 bg-amber-950/40 p-4 text-xs text-amber-200" role="status">
              <p className="font-bold">Some analytics sections could not be loaded. Available sections remain visible.</p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                {sectionErrors.map((message) => <li key={message}>{message}</li>)}
              </ul>
              <button type="button" onClick={loadData} className="mt-3 rounded-lg border border-amber-700 px-3 py-1.5 font-bold hover:bg-amber-900/50">Retry unavailable sections</button>
            </div>
          )}
          {/* Top Key Performance Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-white space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase mono">Patient Requests</p>
              <h3 className="text-xl font-black text-white">{summary?.totalRequests ?? '—'}</h3>
              <p className="text-[10px] text-slate-400 font-medium">Visible to this account</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-white space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase mono">Avg Response Time</p>
              <h3 className="text-xl font-black text-white">{summary?.averageResponseTimeMinutes != null ? `${summary.averageResponseTimeMinutes} min` : 'Not tracked'}</h3>
              <p className="text-[10px] text-slate-400 font-medium">No verified timing data</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-white space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase mono">Lives Saved</p>
              <h3 className="text-xl font-black text-emerald-400">{summary?.livesSaved ?? 'Not tracked'}</h3>
              <p className="text-[10px] text-slate-400 font-medium">No outcome data recorded</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-white space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase mono">ICU Capacity Committed</p>
              <h3 className="text-xl font-black text-amber-400">{summary?.icuCommittedRate != null ? `${summary.icuCommittedRate}%` : 'No data'}</h3>
              <p className="text-[10px] text-slate-400 font-medium">Occupied + reserved beds / total</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-white space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase mono">Blood Assignment</p>
              <h3 className="text-xl font-black text-blue-400">{summary?.bloodAssignmentRate != null ? `${summary.bloodAssignmentRate}%` : 'No data'}</h3>
              <p className="text-[10px] text-slate-400 font-medium">Cases assigned a blood bank</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-white space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase mono">System Uptime</p>
              <h3 className="text-xl font-black text-emerald-400">{summary?.systemUptimePercent != null ? `${summary.systemUptimePercent}%` : 'Not tracked'}</h3>
              <p className="text-[10px] text-slate-400 font-medium">No uptime monitor configured</p>
            </div>
          </div>

          {/* Resource Utilization Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white space-y-4">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-300 mono flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              ICU Capacity
            </h3>

            {resourceHealthScores.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No analytics available."
                description="No ICU inventory is visible to this account yet."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {resourceHealthScores.map((score, i) => (
                  <div key={i} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-white">{score.category}</span>
                      <span className="font-mono font-bold text-emerald-400">{score.percentage}%</span>
                    </div>
                    <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-500 h-full rounded-full transition-all"
                        style={{ width: `${score.percentage}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Used: {score.used}</span>
                      <span>Total: {score.total}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Time Series Telemetry Charts */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white space-y-4">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-300 mono flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Synthetic Requests vs Confirmed Cases ({timeRange.toUpperCase()})
            </h3>

            {timeSeries.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No analytics available."
                description="No synthetic requests or confirmed cases were recorded in this time frame."
              />
            ) : (
              <div className="h-72 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="period" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                    <Legend />
                    <Area type="monotone" dataKey="demand" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.2} name="Synthetic requests" />
                    <Area type="monotone" dataKey="supply" stroke="#10b981" fill="#10b981" fillOpacity={0.2} name="Confirmed cases from synthetic requests" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
