import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { buildIncidentReviewAdjustments, createIncidentPlan, getIncidentPlans, getIncidentReviewReasonOptions, IncidentPlanRecord, reviewIncidentPlan, INCIDENT_SCENARIO_LABELS, IncidentScenarioLabel } from '../../services/incidentPlanningService';

const emptyCounts = { red: 0, yellow: 0, green: 0, black: 0 };
const defaultRatios = {
  icu_per_red: 1, general_per_yellow: 1, general_per_green: 0.25,
  oxygen_per_red: 2, oxygen_per_yellow: 1, ambulances_per_red: 0.5,
  ambulances_per_yellow: 0.2, blood_min_per_red: 1, blood_max_per_red: 2,
  medicine_supply_per_red: 0, medicine_supply_per_yellow: 0, medicine_supply_per_green: 0,
  staff_slots_per_red: 0, staff_slots_per_yellow: 0, staff_slots_per_green: 0
};
const ratioLabels: Record<string, string> = {
  icu_per_red: 'ICU beds per red count',
  general_per_yellow: 'General beds per yellow count',
  general_per_green: 'General beds per green count',
  oxygen_per_red: 'Oxygen units per red count',
  oxygen_per_yellow: 'Oxygen units per yellow count',
  ambulances_per_red: 'Ambulances per red count',
  ambulances_per_yellow: 'Ambulances per yellow count',
  blood_min_per_red: 'Blood preparedness minimum per red count',
  blood_max_per_red: 'Blood preparedness maximum per red count',
  medicine_supply_per_red: 'Generic medicine supply units per red count',
  medicine_supply_per_yellow: 'Generic medicine supply units per yellow count',
  medicine_supply_per_green: 'Generic medicine supply units per green count',
  staff_slots_per_red: 'Staffing slots per red count',
  staff_slots_per_yellow: 'Staffing slots per yellow count',
  staff_slots_per_green: 'Staffing slots per green count'
};
const resourceLabels: Record<string, string> = {
  icu_beds: 'ICU bed preparedness', general_beds: 'General bed preparedness',
  oxygen_units: 'Oxygen units', ambulances: 'Ambulance capacity', blood_preparedness: 'Blood preparedness range',
  medicine_supply_units: 'Generic medicine supply units', staffing_slots: 'Staffing slots'
};

export const IncidentPlanningPanel: React.FC<{ mode: 'coordinator' | 'reviewer' }> = ({ mode }) => {
  const { userProfile } = useAuth();
  const [plans, setPlans] = useState<IncidentPlanRecord[]>([]);
  const [label, setLabel] = useState<IncidentScenarioLabel>(INCIDENT_SCENARIO_LABELS[0]);
  const [locationLabel, setLocationLabel] = useState('Synthetic district A');
  const [arrivalStart, setArrivalStart] = useState('');
  const [arrivalEnd, setArrivalEnd] = useState('');
  const [counts, setCounts] = useState(emptyCounts);
  const [ratios, setRatios] = useState(defaultRatios);
  const [reviewAdjustments, setReviewAdjustments] = useState<Record<string, Record<string, number>>>({});
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, 'approved' | 'rejected' | ''>>({});
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try { setPlans(await getIncidentPlans()); setError(''); }
    catch (e: any) { setError(e?.message || 'Unable to load saved incident plans. Check your Supabase access and migrations.'); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh, userProfile?.user_id]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      if (arrivalStart && arrivalEnd && new Date(arrivalEnd) < new Date(arrivalStart)) throw new Error('Arrival window end must be after its start.');
      if (ratios.blood_max_per_red < ratios.blood_min_per_red) throw new Error('Blood preparedness maximum must be at least its minimum.');
      await createIncidentPlan({ label, locationLabel, counts, ratios, arrivalStart: arrivalStart ? new Date(arrivalStart).toISOString() : undefined, arrivalEnd: arrivalEnd ? new Date(arrivalEnd).toISOString() : undefined });
      setLabel(INCIDENT_SCENARIO_LABELS[0]); setCounts(emptyCounts); setArrivalStart(''); setArrivalEnd(''); setNotice('Scenario saved to Supabase and queued for clinician review.');
      await refresh();
    } catch (e: any) { setError(e?.message || 'Could not save the incident plan.'); }
    finally { setBusy(false); }
  };

  const decide = async (plan: IncidentPlanRecord) => {
    const version = plan.version;
    if (!version) return;
    const decision = reviewDecisions[version.id];
    if (!decision) { setError('Choose approve or reject before submitting the review.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const edited = buildIncidentReviewAdjustments(decision, version.plans || [], reviewAdjustments[version.id]);
      await reviewIncidentPlan({ versionId: version.id, decision, reason: reviewReasons[version.id] || '', adjustments: edited });
      setNotice(Object.keys(edited).length ? 'Adjusted plan saved as a new immutable version and approved.' : `Plan ${decision}. The review decision and reason were saved.`);
      await refresh();
    } catch (e: any) { setError(e?.message || 'Could not save review.'); }
    finally { setBusy(false); }
  };

  const totalAffected = Object.values(counts).reduce((sum, value) => sum + value, 0);

  const visiblePlans = mode === 'reviewer' ? plans.filter(p => p.version?.review?.status === 'pending') : plans;

  return <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 space-y-5">
    <header>
      <h2 className="text-lg font-bold text-white">{mode === 'reviewer' ? 'Incident plans awaiting review' : 'Incident preparedness plans'}</h2>
      <p className="mt-1 text-sm text-slate-400">Aggregate scenario planning only. Estimates use visible illustrative ratios; this does not assess individual patients, reserve supplies, or dispatch resources.</p>
    </header>

    {mode === 'coordinator' && <form onSubmit={create} className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
      <label className="text-xs font-semibold text-slate-300">Synthetic scenario label<select required value={label} onChange={e => setLabel(e.target.value as IncidentScenarioLabel)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">{INCIDENT_SCENARIO_LABELS.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-300">Synthetic location<select value={locationLabel} onChange={e => setLocationLabel(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">{['Synthetic district A','Synthetic district B','Synthetic district C'].map(location => <option key={location}>{location}</option>)}</select></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-300">Expected arrival window starts<input type="datetime-local" required value={arrivalStart} onChange={e => setArrivalStart(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" /></label><label className="text-xs text-slate-300">Expected arrival window ends<input type="datetime-local" required value={arrivalEnd} onChange={e => setArrivalEnd(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" /></label></div>
      <p className="text-xs text-amber-300">Enter aggregate counts only. Do not include names, contact details, exact addresses, or patient notes.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{(Object.keys(counts) as Array<keyof typeof counts>).map(key => <label key={key} className="text-xs capitalize text-slate-300">{key} count<input type="number" min={0} max={10000} step={1} required value={counts[key]} onChange={e => setCounts(c => { const otherCounts = Object.entries(c).reduce((sum, [severity, count]) => sum + (severity === key ? 0 : count), 0); return { ...c, [key]: Math.min(10000 - otherCounts, Math.max(0, Number(e.target.value) || 0)) }; })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" /></label>)}</div>
      <details className="rounded-lg border border-slate-800 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-200">Planning ratios (configurable per scenario)</summary><div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">{Object.entries(ratios).map(([key, value]) => <label key={key} className="text-[11px] text-slate-400">{ratioLabels[key] || key.replaceAll('_', ' ')}<input type="number" min={0} max={20} step={0.05} value={value} onChange={e => setRatios(r => ({ ...r, [key]: Math.min(20, Math.max(0, Number(e.target.value) || 0)) }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white" /></label>)}</div><p className="mt-2 text-[11px] text-slate-500">Ratios are coordinator-entered scenario assumptions for red, yellow and green counts. Black counts are recorded but not used to estimate these resources. Generic medicine values represent stock units only: the planner selects no medicine or dosage. Staffing is a total slot estimate with no inferred staff-role mix. Zero disables that estimate for the severity band. Review and verify every assumption.</p><p className="mt-2 text-[11px] text-slate-500">Ranges show ±20% for beds, generic medicine supplies and staffing; ±25% for oxygen/ambulances. Blood is a preparedness range only.</p></details>
      <p className="text-xs text-slate-400">Affected total: {totalAffected} / 10000 · method version mci-ratio-v2 · current capacity is unavailable until verified inventory snapshots are connected.</p>
      <button disabled={busy || totalAffected === 0} className="justify-self-start rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save plan for review'}</button>
    </form>}

    {error && <p role="alert" className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-800 bg-emerald-950/40 p-3 text-sm text-emerald-200">{notice}</p>}
    {!visiblePlans.length && <p className="text-sm text-slate-500">{mode === 'reviewer' ? 'No saved incident plans are awaiting review.' : 'No incident plans have been saved yet.'}</p>}

    <div className="space-y-4">{visiblePlans.map(plan => {
      const v = plan.version;
      if (!v) return null;
      const review = Array.isArray(v.review) ? v.review[0] : v.review;
      return <article key={plan.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-white">{plan.label}</h3><p className="text-xs text-slate-400">{plan.location_label} · Version {v.version_number} · {v.total_affected} affected · saved {new Date(plan.created_at).toLocaleString()}</p>{(plan.expected_arrival_start || plan.expected_arrival_end) && <p className="text-xs text-slate-500">Expected window: {plan.expected_arrival_start ? new Date(plan.expected_arrival_start).toLocaleString() : 'not set'} – {plan.expected_arrival_end ? new Date(plan.expected_arrival_end).toLocaleString() : 'not set'}</p>}</div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${review?.status === 'approved' ? 'bg-emerald-950 text-emerald-300' : review?.status === 'rejected' ? 'bg-red-950 text-red-300' : 'bg-amber-950 text-amber-300'}`}>{review?.status || 'review pending'}</span></div>
        <div className="flex flex-wrap gap-2 text-xs">{Object.entries(v.severity_counts).map(([k, n]) => <span key={k} className="rounded-md bg-slate-800 px-2 py-1 capitalize text-slate-300">{k}: {n}</span>)}</div>
        <div className="grid gap-2 sm:grid-cols-2">{(v.plans || []).map(resource => <div key={resource.resource_type} className="rounded-lg bg-slate-900 p-3"><p className="text-sm font-medium text-slate-200">{resourceLabels[resource.resource_type] || resource.resource_type}</p><p className="mt-1 text-xs text-slate-300">Illustrative range: {resource.estimated_min}–{resource.estimated_max} · expected {resource.estimated_expected}</p><p className="mt-1 text-xs text-slate-500">{resource.assumption_details?.formula}</p>{resource.assumption_details?.uncertainty && <p className="mt-1 text-xs text-slate-500">{resource.assumption_details.uncertainty}</p>}</div>)}</div>
        <p className="text-xs text-slate-500">Method {String((v.assumptions as any)?.method_version || 'mci-ratio-v1')}. No live capacity snapshot is attached; quantities are preparedness estimates, not commitments.</p>
        {review?.reason && <p className="text-xs text-slate-400">Reviewer note: {review.reason}</p>}
        {!!plan.history?.length && plan.history.length > 1 && <details className="rounded-lg border border-slate-800 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-300">Version history ({plan.history.length})</summary><ol className="mt-2 space-y-2">{[...plan.history].sort((a, b) => a.version_number - b.version_number).map(item => { const itemReview = Array.isArray(item.review) ? item.review[0] : item.review; return <li key={item.id} className="flex flex-wrap justify-between gap-2 text-xs text-slate-400"><span>Version {item.version_number}{item.supersedes_version_id ? ' · supersedes prior version' : ''}</span><span>{itemReview?.status || 'review pending'}{itemReview?.reason ? ` · ${itemReview.reason}` : ''}</span></li>; })}</ol></details>}
        {mode === 'reviewer' && review?.status === 'pending' && (() => {
          const decision = reviewDecisions[v.id] || '';
          const edited = buildIncidentReviewAdjustments('approved', v.plans || [], reviewAdjustments[v.id]);
          const reasonOptions = decision ? getIncidentReviewReasonOptions(decision, decision === 'approved' && Object.keys(edited).length > 0) : [];
          return <div className="space-y-3">
            <p className="text-xs text-slate-400">Review aggregate estimates. Approval with changes creates a new immutable version; rejection ignores edited estimates.</p>
            <div className="grid gap-2 sm:grid-cols-2">{(v.plans || []).map(resource => <label key={resource.resource_type} className="text-xs text-slate-300">{resourceLabels[resource.resource_type] || resource.resource_type} · expected<input type="number" min={0} max={1000000} step={0.01} value={reviewAdjustments[v.id]?.[resource.resource_type] ?? resource.estimated_expected} onChange={e => { setReviewAdjustments(all => ({ ...all, [v.id]: { ...all[v.id], [resource.resource_type]: Math.max(0, Math.min(1000000, Number(e.target.value) || 0)) } })); setReviewReasons(all => ({ ...all, [v.id]: '' })); }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" /></label>)}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-300">Decision<select required value={decision} onChange={e => { setReviewDecisions(all => ({ ...all, [v.id]: e.target.value as 'approved' | 'rejected' | '' })); setReviewReasons(all => ({ ...all, [v.id]: '' })); }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"><option value="">Choose decision</option><option value="approved">Approve plan</option><option value="rejected">Reject plan</option></select></label>
              <label className="text-xs text-slate-300">Required review reason<select required disabled={!decision} value={reviewReasons[v.id] || ''} onChange={e => setReviewReasons(all => ({ ...all, [v.id]: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"><option value="">Choose reason</option>{reasonOptions.map(reason => <option key={reason} value={reason}>{reason}</option>)}</select></label>
            </div>
            <p className="text-[11px] text-slate-500">Reasons are selected from aggregate-only options. Do not include names, contact details, patient notes, or identifying information.</p>
            <button disabled={busy || !decision || !reviewReasons[v.id]} onClick={() => void decide(plan)} className={`rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${decision === 'rejected' ? 'bg-red-800' : 'bg-emerald-700'}`}>{busy ? 'Saving…' : decision === 'rejected' ? 'Submit rejection' : 'Submit approval'}</button>
          </div>;
        })()}
      </article>;
    })}</div>
  </section>;
};
