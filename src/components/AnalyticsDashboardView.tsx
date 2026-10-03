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
import { EmptyState, LoadingState, ErrorState } from './common/EmptyState';

export const AnalyticsDashboardView: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | '90d'>('30d');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('Just now');
  const [exportNotice, setExportNotice] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
  const [resourceHealthScores, setResourceHealthScores] = useState<ResourceUtilizationData[]>([]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, tsRes, utilRes] = await Promise.all([
        getAnalyticsSummary(),
        getTimeSeriesData(timeRange),
        getResourceUtilization()
      ]);
      setSummary(sumRes);
      setTimeSeries(tsRes);
      setResourceHealthScores(utilRes);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Failed to load analytics data', err);
      setError('Failed to query centralized analytics service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [timeRange, selectedDistrict]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const handleExport = () => {
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
              <BarChart3 className="w-3.5 h-3.5 text-blue-400" /> National Intelligence Dashboard
            </span>
            <span className="px-2.5 py-1 text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded">
              Centralized Analytics Service
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">
            Healthcare System Analytics & Resource Health Score
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
            Integrated real-time analytics monitoring blood inventory deficits, ICU bed capacity, pharmaceutical reserve days, emergency ambulance traffic loads, and outbreak vector surveillance across all regional districts.
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

          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white text-xs font-bold rounded-xl p-2 font-mono focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Metro Districts</option>
            <option value="metro">Metro Central District</option>
            <option value="north">North Urban District</option>
            <option value="west">West Suburban District</option>
            <option value="east">East Industrial Zone</option>
          </select>

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
          Exporting analytics telemetry to JSON/CSV report...
        </div>
      )}

      {loading ? (
        <LoadingState message="Fetching analytics from central intelligence service..." />
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : (
        <div className="space-y-6">
          {/* Top Key Performance Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-white space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase mono">Total Incidents</p>
              <h3 className="text-xl font-black text-white">{summary ? summary.totalIncidents : 0}</h3>
              <p className="text-[10px] text-emerald-400 font-medium">Logged in region</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-white space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase mono">Avg Response Time</p>
              <h3 className="text-xl font-black text-white">{summary ? `${summary.averageResponseTimeMinutes} min` : '0 min'}</h3>
              <p className="text-[10px] text-emerald-400 font-medium">Dispatch to scene</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-white space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase mono">Lives Saved</p>
              <h3 className="text-xl font-black text-emerald-400">{summary ? summary.livesSaved : 0}</h3>
              <p className="text-[10px] text-slate-400 font-medium">Emergency Triage</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-white space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase mono">ICU Occupancy</p>
              <h3 className="text-xl font-black text-amber-400">{summary ? `${summary.icuOccupancyRate}%` : '0%'}</h3>
              <p className="text-[10px] text-slate-400 font-medium">Regional beds</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-white space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase mono">Blood Fulfillment</p>
              <h3 className="text-xl font-black text-blue-400">{summary ? `${summary.bloodFulfillmentRate}%` : '0%'}</h3>
              <p className="text-[10px] text-slate-400 font-medium">Orders delivered</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-white space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase mono">System Uptime</p>
              <h3 className="text-xl font-black text-emerald-400">{summary ? `${summary.systemUptimePercent}%` : '0%'}</h3>
              <p className="text-[10px] text-slate-400 font-medium">EHR & Telemetry</p>
            </div>
          </div>

          {/* Resource Utilization Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white space-y-4">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-300 mono flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              Resource Health & Capacity Sub-Indices
            </h3>

            {resourceHealthScores.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No analytics available."
                description="No resource health utilization metrics logged in the centralized analytics database."
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
              Healthcare Demand vs Supply Trends ({timeRange.toUpperCase()})
            </h3>

            {timeSeries.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No analytics available."
                description="No time-series trends recorded for this selected time frame."
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
                    <Area type="monotone" dataKey="demand" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.2} name="Demand Units" />
                    <Area type="monotone" dataKey="supply" stroke="#10b981" fill="#10b981" fillOpacity={0.2} name="Supply Units" />
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
