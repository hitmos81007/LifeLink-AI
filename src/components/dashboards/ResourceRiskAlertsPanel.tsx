import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Clock3, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToSupabaseRealtime } from '../../services/supabaseDataLayer';
import { getRiskAlertEvents, getRiskAlerts, RiskAlertAction, RISK_ALERT_ACTION_NOTES, transitionRiskAlert } from '../../services/riskAlertService';
import { AlertEventTable, RiskAlertStatus, RiskAlertTable } from '../../types/database';

const FILTERS: Array<{ label: string; value: RiskAlertStatus | 'active' }> = [
  { label: 'Open & acknowledged', value: 'active' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Dismissed', value: 'dismissed' }
];

const canReviewAlerts = (profile: { role?: string; status?: boolean } | null | undefined) =>
  profile?.status === true && (
    profile.role === 'government_admin' || profile.role === 'hospital_admin' ||
    profile.role === 'hospital_approver' || profile.role === 'blood_bank_admin'
  );

export const ResourceRiskAlertsPanel: React.FC = () => {
  const { userProfile } = useAuth();
  const userId = userProfile?.user_id;
  const mayReview = canReviewAlerts(userProfile);
  const [alerts, setAlerts] = useState<RiskAlertTable[]>([]);
  const [events, setEvents] = useState<AlertEventTable[]>([]);
  const [filter, setFilter] = useState<RiskAlertStatus | 'active'>('active');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const refreshSequence = useRef(0);

  const refresh = useCallback(async () => {
    const requestSequence = ++refreshSequence.current;
    if (!userId) {
      setAlerts([]);
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextAlerts = await getRiskAlerts(filter);
      const history = await getRiskAlertEvents(nextAlerts.map((alert) => alert.alert_id));
      if (requestSequence !== refreshSequence.current) return;
      setAlerts(nextAlerts);
      setEvents(history);
    } catch (err) {
      if (requestSequence !== refreshSequence.current) return;
      setError(err instanceof Error ? err.message : 'Could not load resource risk alerts.');
    } finally {
      if (requestSequence === refreshSequence.current) setLoading(false);
    }
  }, [userId, filter]);

  useEffect(() => {
    setAlerts([]);
    setEvents([]);
    void refresh();
    if (!userId) return;
    const unsubscribe = subscribeToSupabaseRealtime(['risk_alerts', 'alert_events'], () => void refresh());
    return () => {
      refreshSequence.current += 1;
      unsubscribe();
    };
  }, [userId, refresh]);

  const visibleAlerts = useMemo(() => alerts.filter((alert) => {
    if (filter === 'active') return alert.status === 'open' || alert.status === 'acknowledged';
    return alert.status === filter;
  }), [alerts, filter]);
  const eventsByAlert = useMemo(() => {
    const grouped = new Map<string, AlertEventTable[]>();
    events.forEach((event) => grouped.set(event.alert_id, [...(grouped.get(event.alert_id) || []), event]));
    return grouped;
  }, [events]);

  const act = async (alert: RiskAlertTable, action: RiskAlertAction) => {
    const note = notes[alert.alert_id]?.trim() || '';
    if (action === 'resolved' && !note) {
      setActionError('A resolution note is required.');
      return;
    }
    if (action === 'dismissed' && alert.risk_level === 'critical' && !note) {
      setActionError('A reason is required to dismiss a critical alert.');
      return;
    }
    setBusyId(alert.alert_id);
    setActionError(null);
    try {
      const updated = await transitionRiskAlert(alert.alert_id, action, note || undefined);
      setAlerts((current) => current.map((row) => row.alert_id === updated.alert_id ? updated : row));
      setNotes((current) => ({ ...current, [alert.alert_id]: '' }));
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update this alert.');
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 space-y-4" aria-labelledby="risk-alerts-heading">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <h2 id="risk-alerts-heading" className="text-base font-black text-white">Resource Risk Alerts</h2>
          </div>
          <p className="mt-1 text-xs text-slate-400">Threshold alerts use saved inventory values. Confirm the inventory and review replenishment with an authorised colleague.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="risk-alert-filter">Filter risk alerts</label>
          <select id="risk-alert-filter" value={filter} onChange={(event) => setFilter(event.target.value as RiskAlertStatus | 'active')}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-200">
            {FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button onClick={() => void refresh()} disabled={loading} aria-label="Refresh resource risk alerts"
            className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {!mayReview && <p className="text-xs text-slate-400">Alert actions are available to active hospital operations and district accounts.</p>}
      {actionError && <p className="rounded-lg border border-rose-800 bg-rose-950/40 p-3 text-xs text-rose-200" role="alert">{actionError}</p>}
      {error ? (
        <div className="rounded-xl border border-rose-900 bg-rose-950/30 p-4 text-xs text-rose-200" role="alert">
          <p>{error}</p><button onClick={() => void refresh()} className="mt-2 underline">Retry</button>
        </div>
      ) : loading && alerts.length === 0 ? (
        <p className="py-5 text-center text-xs text-slate-400" role="status">Loading saved alerts…</p>
      ) : visibleAlerts.length === 0 ? (
        <p className="rounded-xl border border-slate-800 bg-slate-950/50 p-5 text-center text-xs text-slate-400">No {filter === 'active' ? 'open' : filter} resource alerts.</p>
      ) : (
        <div className="space-y-3">
          {visibleAlerts.map((alert) => {
            const history = eventsByAlert.get(alert.alert_id) || [];
            const active = alert.status === 'open' || alert.status === 'acknowledged';
            return (
              <article key={alert.alert_id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${alert.risk_level === 'critical' ? 'border-rose-800 bg-rose-950 text-rose-300' : alert.risk_level === 'warning' ? 'border-amber-800 bg-amber-950 text-amber-300' : 'border-sky-800 bg-sky-950 text-sky-300'}`}>{alert.risk_level}</span>
                      <h3 className="text-sm font-bold text-white">{alert.resource_name} · {alert.resource_type}</h3>
                      <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-300">{alert.status}</span>
                    </div>
                    <p className="text-[10px] text-slate-400">{alert.facility_name}</p>
                    <p className="text-xs text-slate-300">{alert.reason}</p>
                    <p className="text-[10px] text-slate-500">
                      Recorded: {alert.observed_value} · Minimum: {alert.threshold_value}
                      {alert.predicted_value !== null && ` · Synthetic ${alert.forecast_horizon_days}-day estimate: ${alert.predicted_value}`}
                    </p>
                    <p className="text-[11px] text-sky-200">Review: {alert.recommended_action}</p>
                  </div>
                  <p className="inline-flex items-center gap-1 text-[10px] text-slate-500 whitespace-nowrap"><Clock3 className="h-3 w-3" /> Updated {new Date(alert.last_detected_at).toLocaleString()}</p>
                </div>
                {active && mayReview && (
                  <div className="space-y-2">
                    <label className="block text-[10px] font-semibold text-slate-400" htmlFor={`alert-note-${alert.alert_id}`}>Review note {alert.risk_level === 'critical' ? '(required to resolve or dismiss)' : '(required to resolve)'}</label>
                    <select id={`alert-note-${alert.alert_id}`} value={notes[alert.alert_id] || ''}
                      onChange={(event) => setNotes((current) => ({ ...current, [alert.alert_id]: event.target.value }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white">
                      <option value="">Select a reason</option>
                      {RISK_ALERT_ACTION_NOTES.map((note) => <option key={note} value={note}>{note}</option>)}
                    </select>
                    <div className="flex flex-wrap gap-2">
                      {alert.status === 'open' && <button disabled={busyId === alert.alert_id} onClick={() => void act(alert,'acknowledged')} className="inline-flex items-center gap-1 rounded-lg border border-sky-800 bg-sky-950/60 px-3 py-2 text-[11px] font-bold text-sky-200 disabled:opacity-50"><Check className="h-3.5 w-3.5" />Acknowledge</button>}
                      <button disabled={busyId === alert.alert_id} onClick={() => void act(alert,'resolved')} className="inline-flex items-center gap-1 rounded-lg border border-emerald-800 bg-emerald-950/50 px-3 py-2 text-[11px] font-bold text-emerald-200 disabled:opacity-50"><ShieldCheck className="h-3.5 w-3.5" />Resolve</button>
                      <button disabled={busyId === alert.alert_id} onClick={() => void act(alert,'dismissed')} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] font-bold text-slate-300 disabled:opacity-50"><X className="h-3.5 w-3.5" />Dismiss</button>
                    </div>
                  </div>
                )}
                <details className="border-t border-slate-800 pt-2">
                  <summary className="cursor-pointer text-[10px] font-semibold text-slate-400">Alert history ({history.length} events)</summary>
                  <ol className="mt-2 space-y-1.5">
                    {history.length === 0 ? <li className="text-[10px] text-slate-500">No history is available.</li> : history.map((event) => (
                      <li key={event.event_id} className="text-[10px] text-slate-400">{event.action.replaceAll('_',' ')} · {new Date(event.occurred_at).toLocaleString()}{event.note ? ` · ${event.note}` : ''}</li>
                    ))}
                  </ol>
                </details>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
