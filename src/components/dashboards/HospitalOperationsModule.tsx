import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CalendarClock, Copy, Package, Plus, RefreshCw, ShieldCheck, Users, UserPlus, ClipboardList } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  estimateOperationalDemand, getHospitalActivities, getHospitalShifts, getHospitalStaff,
  getHospitalSupplyUsage, HospitalActivityRecord, HospitalShiftRecord, HospitalStaffRecord,
  inviteHospitalStaff, recordSupplyUsage, reissueHospitalStaffInvite, saveHospitalActivity, saveHospitalShift,
  setHospitalStaffAccess, StaffDiscipline, SupplyUsageRecord, updateHospitalStaffRecord, updateHospitalShiftStatus,
} from '../../services/hospitalOperationsService';
import { MedicineInventoryTable, OxygenInventoryTable } from '../../types/database';

interface Props {
  hospitalId: string;
  mode?: 'admin' | 'staff';
  medicines?: MedicineInventoryTable[];
  oxygen?: OxygenInventoryTable[];
}

const DISCIPLINES: StaffDiscipline[] = ['Nurse','Physician','Surgeon','Anesthesiologist','Respiratory Therapist','Pharmacist','Technician','Support','Other'];
const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500';
const cardClass = 'rounded-xl border border-slate-800 bg-slate-950/70 p-4';
const dayText = (value: string) => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const dateInputValue = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

export const HospitalOperationsModule: React.FC<Props> = ({ hospitalId, mode = 'admin', medicines = [], oxygen = [] }) => {
  const { userProfile } = useAuth();
  const admin = mode === 'admin';
  const [staff, setStaff] = useState<HospitalStaffRecord[]>([]);
  const [shifts, setShifts] = useState<HospitalShiftRecord[]>([]);
  const [activities, setActivities] = useState<HospitalActivityRecord[]>([]);
  const [usage, setUsage] = useState<SupplyUsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [editingStaff, setEditingStaff] = useState<{ staffId: string; department: string; discipline: StaffDiscipline; skills: string; weeklyHours: number } | null>(null);
  const [staffForm, setStaffForm] = useState({ fullName: '', email: '', phone: '', department: '', discipline: 'Nurse' as StaffDiscipline, skills: '', weeklyHours: 40 });
  const [shiftForm, setShiftForm] = useState({ staffId: '', startsAt: dateInputValue(new Date(Date.now() + 3600000)), endsAt: dateInputValue(new Date(Date.now() + 9 * 3600000)), status: 'planned' as HospitalShiftRecord['status'] });
  const [activityForm, setActivityForm] = useState({ activity_date: new Date().toISOString().slice(0,10), emergency_visits: 0, admissions: 0, procedures: 0, outpatient_visits: 0 });
  const [usageForm, setUsageForm] = useState({ category: 'medicine' as SupplyUsageRecord['category'], item_label: '', quantity_used: 1, unit: 'units' });

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const future = new Date(); future.setDate(future.getDate() + 8);
    const since = new Date(); since.setDate(since.getDate() - 30);
    try {
      const [staffRows, shiftRows, activityRows, usageRows] = await Promise.all([
        getHospitalStaff(hospitalId), getHospitalShifts(hospitalId, new Date(Date.now() - 86400000), future),
        getHospitalActivities(hospitalId, since.toISOString().slice(0,10)), getHospitalSupplyUsage(hospitalId, since.toISOString()),
      ]);
      setStaff(staffRows); setShifts(shiftRows); setActivities(activityRows); setUsage(usageRows);
      if (!shiftForm.staffId && staffRows.length) setShiftForm((old) => ({ ...old, staffId: staffRows.find((item) => item.employment_status === 'active')?.staff_id || staffRows[0].staff_id }));
      const own = staffRows.find((person) => person.auth_user_id === userProfile?.user_id);
      if (!admin && own) setUsageForm((old) => ({ ...old, category: 'other', item_label: old.item_label || `${own.department} supply`, unit: 'units' }));
    } catch (loadError: any) { setError(loadError?.message || 'Hospital operations records could not be loaded. Apply the workforce and demand migration, then refresh.'); }
    finally { setLoading(false); }
  }, [hospitalId, admin, userProfile?.user_id]);

  useEffect(() => { void reload(); }, [reload]);

  const insights = useMemo(() => estimateOperationalDemand(activities, usage), [activities, usage]);
  const activeStaff = staff.filter((person) => person.employment_status === 'active').length;
  const scheduledHours = shifts.filter((shift) => shift.status === 'planned' || shift.status === 'confirmed')
    .reduce((sum, shift) => sum + Math.max(0, (new Date(shift.ends_at).getTime() - new Date(shift.starts_at).getTime()) / 3600000), 0);
  const inventoryByItem = useMemo(() => {
    const stock = new Map<string, { available: number; protected: number; unit: string; category: string }>();
    medicines.forEach((item) => stock.set(item.medicine_name.trim().toLowerCase(), { available: Math.max(0, item.current_stock - item.reserved_stock), protected: item.minimum_stock, unit: item.unit, category: 'medicine' }));
    oxygen.forEach((item) => stock.set(`${item.oxygen_type} ${item.unit}`.trim().toLowerCase(), { available: Math.max(0, item.available_capacity - item.reserved_capacity), protected: item.minimum_threshold, unit: item.unit, category: 'oxygen' }));
    oxygen.forEach((item) => stock.set(item.oxygen_type.trim().toLowerCase(), { available: Math.max(0, item.available_capacity - item.reserved_capacity), protected: item.minimum_threshold, unit: item.unit, category: 'oxygen' }));
    return stock;
  }, [medicines, oxygen]);
  const supplyItemOptions = useMemo(() => [
    ...medicines.map((item) => item.medicine_name),
    ...oxygen.map((item) => `${item.oxygen_type} ${item.unit}`),
  ], [medicines, oxygen]);

  const submitInvite = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null); setNotice(null); setInviteCode(null);
    try {
      const result = await inviteHospitalStaff({ ...staffForm, skills: staffForm.skills.split(',').map((item) => item.trim()).filter(Boolean) });
      setInviteCode(result.code); setNotice(`Staff record created. Share this one-time invite with ${staffForm.email}; it expires ${dayText(result.expiresAt)}.`);
      setStaffForm({ fullName: '', email: '', phone: '', department: '', discipline: 'Nurse', skills: '', weeklyHours: 40 });
      await reload();
    } catch (submitError: any) { setError(submitError?.message || 'Staff invite could not be created.'); }
    finally { setSaving(false); }
  };

  const saveStaffChanges = async () => {
    if (!editingStaff) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      await updateHospitalStaffRecord(editingStaff.staffId, {
        department: editingStaff.department.trim(), discipline: editingStaff.discipline,
        skills: editingStaff.skills.split(',').map((item) => item.trim()).filter(Boolean),
        contract_hours_per_week: editingStaff.weeklyHours,
      });
      setNotice('Staff profile and contracted hours updated.'); setEditingStaff(null); await reload();
    } catch (saveError: any) { setError(saveError?.message || 'Staff record could not be updated.'); }
    finally { setSaving(false); }
  };

  const issueReplacementInvite = async (person: HospitalStaffRecord) => {
    setSaving(true); setError(null); setNotice(null);
    try {
      const result = await reissueHospitalStaffInvite(person.staff_id);
      setInviteCode(result.code); setNotice(`New one-time code for ${person.email}; previous code is no longer valid. Expires ${dayText(result.expiresAt)}.`);
    } catch (inviteError: any) { setError(inviteError?.message || 'Invitation could not be reissued.'); }
    finally { setSaving(false); }
  };

  const submitShift = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null); setNotice(null);
    try {
      if (!userProfile?.user_id) throw new Error('Sign in again to schedule a shift.');
      await saveHospitalShift({ hospital_id: hospitalId, staff_id: shiftForm.staffId, starts_at: new Date(shiftForm.startsAt).toISOString(), ends_at: new Date(shiftForm.endsAt).toISOString(), status: shiftForm.status, created_by: userProfile.user_id });
      setNotice('Shift saved to the hospital schedule.'); await reload();
    } catch (submitError: any) { setError(submitError?.message || 'Shift could not be saved.'); }
    finally { setSaving(false); }
  };

  const submitActivity = async (event: React.FormEvent) => {
    event.preventDefault(); if (!userProfile?.user_id) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      await saveHospitalActivity({ hospital_id: hospitalId, activity_date: activityForm.activity_date, emergency_visits: activityForm.emergency_visits, admissions: activityForm.admissions, procedures: activityForm.procedures, outpatient_visits: activityForm.outpatient_visits, entered_by: userProfile.user_id });
      setNotice('Aggregate daily workload saved. Updating a date replaces that day’s counts.'); await reload();
    } catch (submitError: any) { setError(submitError?.message || 'Daily workload could not be saved.'); }
    finally { setSaving(false); }
  };

  const submitUsage = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null); setNotice(null);
    try {
      await recordSupplyUsage({ hospital_id: hospitalId, category: usageForm.category, item_label: usageForm.item_label.trim(), quantity_used: usageForm.quantity_used, unit: usageForm.unit.trim() });
      setNotice('Supply usage saved. It will contribute to the rolling demand estimate.'); await reload();
    } catch (submitError: any) { setError(submitError?.message || 'Supply usage could not be recorded.'); }
    finally { setSaving(false); }
  };

  const setActivityCount = (key: keyof typeof activityForm, value: string) => setActivityForm((old) => ({ ...old, [key]: key === 'activity_date' ? value : Math.max(0, Math.floor(Number(value) || 0)) }));
  const usableStaff = staff.filter((person) => person.employment_status === 'active' || person.employment_status === 'invited');
  const ownStaff = staff.find((person) => person.auth_user_id === userProfile?.user_id);

  return <section className="space-y-5 rounded-2xl border border-cyan-900/70 bg-slate-900 p-5 sm:p-6" aria-labelledby="hospital-operations-heading">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2 text-cyan-300"><Activity className="h-5 w-5"/><h2 id="hospital-operations-heading" className="text-xl font-black text-white">{admin ? 'Hospital Operations & Workforce' : 'My Hospital Workspace'}</h2></div>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-300">{admin ? 'Manage invited staff, shift coverage, aggregate workload, and recorded supplies. The demand view uses your hospital’s own records and shows when there is too little history.' : 'View your shifts, review facility workload signals, and record supplies used during operations.'}</p>
      </div>
      <button type="button" onClick={() => void reload()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}/>Refresh records</button>
    </header>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[{ icon: Users, label: 'Active workforce', value: `${activeStaff} / ${staff.length}`, sub: 'active / total staff' }, { icon: CalendarClock, label: 'Scheduled coverage', value: `${scheduledHours.toFixed(1)} h`, sub: 'next 7 days' }, { icon: ClipboardList, label: 'Workload records', value: `${activities.length}`, sub: 'recent daily aggregates' }, { icon: Package, label: 'Supply-use records', value: `${usage.length}`, sub: 'last 30 days' }].map((metric) => <div key={metric.label} className={cardClass}><div className="flex items-center gap-2 text-cyan-300"><metric.icon className="h-4 w-4"/><span className="text-[10px] font-bold uppercase tracking-wide">{metric.label}</span></div><p className="mt-2 text-2xl font-black text-white">{metric.value}</p><p className="text-[10px] text-slate-400">{metric.sub}</p></div>)}
    </div>

    {error && <p className="rounded-lg border border-rose-800 bg-rose-950/40 p-3 text-xs text-rose-200" role="alert">{error}</p>}
    {notice && <p className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-3 text-xs text-emerald-200" role="status">{notice}</p>}
    {inviteCode && <div className="rounded-xl border border-amber-700 bg-amber-950/30 p-4"><p className="text-xs font-bold text-amber-100">One-time staff invitation code — copy it now</p><p className="mt-2 break-all rounded-lg bg-slate-950 p-3 font-mono text-sm text-white">{inviteCode}</p><button type="button" onClick={() => void navigator.clipboard?.writeText(inviteCode)} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white"><Copy className="h-3.5 w-3.5"/>Copy invite code</button><p className="mt-2 text-[10px] text-amber-200">The invite is bound to the email on the staff record, expires after 7 days, and can only be claimed once.</p></div>}

    {admin && <div className="grid gap-5 xl:grid-cols-2">
      <form onSubmit={submitInvite} className={`${cardClass} space-y-3`}>
        <h3 className="flex items-center gap-2 text-sm font-bold text-white"><UserPlus className="h-4 w-4 text-cyan-300"/>Add staff and issue login invite</h3>
        <p className="text-[10px] text-slate-400">The hospital controls who can join. Staff must register with the invited email and one-time code; no hospital can be selected on the public form.</p>
        <div className="grid gap-2 sm:grid-cols-2"><input required minLength={2} maxLength={120} className={inputClass} placeholder="Full name" value={staffForm.fullName} onChange={(e) => setStaffForm({ ...staffForm, fullName: e.target.value })}/><input required type="email" className={inputClass} placeholder="Work email" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}/><input className={inputClass} placeholder="Phone (optional)" value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}/><input required minLength={2} maxLength={100} className={inputClass} placeholder="Department" value={staffForm.department} onChange={(e) => setStaffForm({ ...staffForm, department: e.target.value })}/><select className={inputClass} value={staffForm.discipline} onChange={(e) => setStaffForm({ ...staffForm, discipline: e.target.value as StaffDiscipline })}>{DISCIPLINES.map((item) => <option key={item}>{item}</option>)}</select><input required type="number" min={0} max={168} step={0.5} className={inputClass} value={staffForm.weeklyHours} onChange={(e) => setStaffForm({ ...staffForm, weeklyHours: Number(e.target.value) })} aria-label="Contract hours per week"/><input className="sm:col-span-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" placeholder="Skills, comma-separated (e.g. ICU, ventilator support)" value={staffForm.skills} onChange={(e) => setStaffForm({ ...staffForm, skills: e.target.value })}/></div>
        <button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4"/>{saving ? 'Creating invite…' : 'Create staff record & invite'}</button>
      </form>

      <form onSubmit={submitShift} className={`${cardClass} space-y-3`}>
        <h3 className="flex items-center gap-2 text-sm font-bold text-white"><CalendarClock className="h-4 w-4 text-cyan-300"/>Schedule a shift</h3>
        <p className="text-[10px] text-slate-400">Hours are counted against the selected horizon. A shift cannot exceed 24 hours.</p>
        <select required className={inputClass} value={shiftForm.staffId} onChange={(e) => setShiftForm({ ...shiftForm, staffId: e.target.value })}><option value="">Choose staff member</option>{usableStaff.map((person) => <option key={person.staff_id} value={person.staff_id}>{person.full_name} · {person.discipline} · {person.employment_status}</option>)}</select>
        <div className="grid gap-2 sm:grid-cols-2"><label className="text-[10px] text-slate-300">Starts<input required type="datetime-local" className={inputClass} value={shiftForm.startsAt} onChange={(e) => setShiftForm({ ...shiftForm, startsAt: e.target.value })}/></label><label className="text-[10px] text-slate-300">Ends<input required type="datetime-local" className={inputClass} value={shiftForm.endsAt} onChange={(e) => setShiftForm({ ...shiftForm, endsAt: e.target.value })}/></label></div>
        <select className={inputClass} value={shiftForm.status} onChange={(e) => setShiftForm({ ...shiftForm, status: e.target.value as HospitalShiftRecord['status'] })}><option value="planned">Planned</option><option value="confirmed">Confirmed</option><option value="leave">Leave</option><option value="unavailable">Unavailable</option></select>
        <button disabled={saving || !shiftForm.staffId} className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4"/>Save shift</button>
      </form>

      <form onSubmit={submitActivity} className={`${cardClass} space-y-3`}>
        <h3 className="flex items-center gap-2 text-sm font-bold text-white"><Activity className="h-4 w-4 text-cyan-300"/>Record daily workload</h3>
        <p className="text-[10px] text-slate-400">Aggregate counts only. Do not enter patient names, IDs, contact details, or case notes.</p>
        <label className="block text-[10px] text-slate-300">Activity date<input required type="date" className={inputClass} value={activityForm.activity_date} onChange={(e) => setActivityCount('activity_date', e.target.value)}/></label>
        <div className="grid gap-2 grid-cols-2">{([['emergency_visits','Emergency visits'],['admissions','Admissions'],['procedures','Procedures'],['outpatient_visits','Outpatient visits']] as const).map(([key,label]) => <label key={key} className="text-[10px] text-slate-300">{label}<input required type="number" min={0} max={100000} step={1} className={inputClass} value={activityForm[key]} onChange={(e) => setActivityCount(key,e.target.value)}/></label>)}</div>
        <button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4"/>Save workload</button>
      </form>
    </div>}

    <div className="grid gap-5 xl:grid-cols-2">
      <div className={`${cardClass} space-y-3`}>
        <h3 className="text-sm font-bold text-white">Workforce and workload signal</h3>
        {insights.activityDailyAverage && insights.activityDays >= 3 ? <>
          <p className="text-[11px] text-slate-300">Based on {insights.activityDays} daily records in the last 14 days. These are simple averages, not trained forecasts.</p>
          <div className="grid grid-cols-2 gap-2">{([['emergency_visits','Emergency/day'],['admissions','Admissions/day'],['procedures','Procedures/day'],['outpatient_visits','Outpatient/day']] as const).map(([key,label]) => <div key={key} className="rounded-lg bg-slate-900 p-3"><p className="text-[10px] text-slate-400">{label}</p><p className="mt-1 text-lg font-black text-white">{insights.activityDailyAverage![key].toFixed(1)}</p><p className="text-[10px] text-slate-500">~{(insights.activityDailyAverage![key]*7).toFixed(0)} in 7 days</p></div>)}</div>
        </> : <p className="rounded-lg border border-amber-800 bg-amber-950/25 p-3 text-xs text-amber-100">Need at least 3 separate daily workload records in the last 14 days before showing an activity run rate. Current records: {insights.activityDays}.</p>}
        <div><h4 className="mb-2 text-xs font-bold text-slate-200">Upcoming shift coverage</h4>{shifts.length ? <div className="max-h-60 space-y-2 overflow-auto">{shifts.map((shift) => { const person = staff.find((item) => item.staff_id === shift.staff_id); return <div key={shift.shift_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900 p-2 text-[10px]"><span className="text-slate-200">{person?.full_name || (ownStaff ? 'My shift' : 'Staff')} · {person?.discipline || ''}</span><span className="text-slate-400">{dayText(shift.starts_at)} – {new Date(shift.ends_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })} · {shift.status}</span>{admin && <select aria-label={`Shift status for ${person?.full_name || 'staff'}`} className="rounded border border-slate-700 bg-slate-950 p-1 text-[10px] text-slate-200" value={shift.status} onChange={(e) => { void updateHospitalShiftStatus(shift.shift_id,e.target.value as HospitalShiftRecord['status']).then(reload).catch((err) => setError(err.message)); }}><option value="planned">Planned</option><option value="confirmed">Confirmed</option><option value="leave">Leave</option><option value="unavailable">Unavailable</option></select>}</div>; })}</div> : <p className="text-[10px] text-slate-500">No shifts recorded for this period.</p>}</div>
      </div>

      <div className={`${cardClass} space-y-3`}>
        <h3 className="flex items-center gap-2 text-sm font-bold text-white"><Package className="h-4 w-4 text-cyan-300"/>Record supply use & estimate demand</h3>
        <p className="text-[10px] text-slate-400">Supply run rates use the last 30 days. A 7-day estimate appears after usage is observed on at least 3 distinct days for that item.</p>
        <form onSubmit={submitUsage} className="grid gap-2 sm:grid-cols-2">
          <select className={inputClass} value={usageForm.category} onChange={(e) => setUsageForm({ ...usageForm, category: e.target.value as SupplyUsageRecord['category'] })}><option value="medicine">Medicine</option><option value="oxygen">Oxygen</option><option value="other">Other supply</option></select>
          <div><input required list="hospital-supply-items" minLength={1} maxLength={120} className={inputClass} placeholder="Supply or item name" value={usageForm.item_label} onChange={(e) => {
            const itemName = e.target.value;
            const medicine = medicines.find((item) => item.medicine_name.toLowerCase() === itemName.toLowerCase());
            const oxygenItem = oxygen.find((item) => `${item.oxygen_type} ${item.unit}`.toLowerCase() === itemName.toLowerCase());
            setUsageForm({ ...usageForm, item_label: itemName, ...(medicine ? { category: 'medicine' as const, unit: medicine.unit } : oxygenItem ? { category: 'oxygen' as const, unit: oxygenItem.unit } : {}) });
          }}/><datalist id="hospital-supply-items">{supplyItemOptions.map((item) => <option key={item} value={item}/>)}</datalist></div>
          <input required type="number" min={0.01} max={1000000} step="any" className={inputClass} aria-label="Quantity used" value={usageForm.quantity_used} onChange={(e) => setUsageForm({ ...usageForm, quantity_used: Number(e.target.value) })}/>
          <input required maxLength={40} className={inputClass} placeholder="Unit (vials, cylinders…)" value={usageForm.unit} onChange={(e) => setUsageForm({ ...usageForm, unit: e.target.value })}/>
          <button disabled={saving || !usageForm.item_label.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50 sm:col-span-2"><Plus className="h-4 w-4"/>{saving ? 'Saving…' : admin ? 'Record supply usage' : 'Submit supply usage'}</button>
        </form>
        {insights.supply.length ? <div className="max-h-60 space-y-2 overflow-auto">{insights.supply.map((item) => {
          const stock = inventoryByItem.get(item.item.toLowerCase());
          const sufficientHistory = item.observedDays >= 3;
          const daysCover = stock && item.dailyAverage > 0 ? Math.max(0, stock.available - stock.protected) / item.dailyAverage : null;
          const likelyShortfall = sufficientHistory && stock && item.next7Days > Math.max(0, stock.available - stock.protected);
          return <div key={`${item.category}-${item.item}-${item.unit}`} className="rounded-lg bg-slate-900 p-3"><div className="flex justify-between gap-2"><span className="text-xs font-bold text-white">{item.item} <span className="font-normal text-slate-400">· {item.category}</span></span><span className="text-[10px] text-slate-300">~{sufficientHistory ? item.next7Days.toFixed(1) : '—'} {item.unit} / 7d</span></div><p className="mt-1 text-[10px] text-slate-400">{sufficientHistory ? `${item.records} log entries on ${item.observedDays} days · ${item.dailyAverage.toFixed(2)} ${item.unit}/day` : `Not enough history (${item.records} log entries across ${item.observedDays} days); record usage across 3 or more days.`}{stock ? ` · ${stock.available} ${stock.unit} free, ${stock.protected} protected` : ''}{daysCover !== null ? ` · ${daysCover.toFixed(1)} days above reserve` : ''}</p>{likelyShortfall && <p className="mt-2 text-[10px] font-bold text-amber-200">Recent run rate exceeds stock above the protected minimum. Verify the record and review replenishment planning.</p>}</div>;
        })}</div> : <p className="text-[10px] text-slate-500">No supply-use history yet. Start recording aggregate item usage.</p>}
      </div>
    </div>

    {admin && <div className={`${cardClass} space-y-3`}><h3 className="flex items-center gap-2 text-sm font-bold text-white"><Users className="h-4 w-4 text-cyan-300"/>Hospital staff directory</h3>{loading ? <p className="text-xs text-slate-400">Loading hospital records…</p> : staff.length ? <div className="grid gap-2 md:grid-cols-2">{staff.map((person) => { const personScheduled = shifts.filter((shift) => shift.staff_id === person.staff_id && (shift.status === 'planned' || shift.status === 'confirmed')).reduce((sum, shift) => sum + Math.max(0,(new Date(shift.ends_at).getTime()-Math.max(Date.now(),new Date(shift.starts_at).getTime()))/3600000),0); return <article key={person.staff_id} className="rounded-lg border border-slate-800 bg-slate-900 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold text-white">{person.full_name}</h4><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${person.employment_status === 'active' ? 'bg-emerald-950 text-emerald-300' : person.employment_status === 'invited' ? 'bg-amber-950 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>{person.employment_status}</span></div><p className="mt-1 text-[10px] text-slate-300">{person.discipline} · {person.department} · {person.contract_hours_per_week} contracted h/week · {personScheduled.toFixed(1)} scheduled h in view</p><p className="text-[10px] text-slate-400">{person.email}{person.phone ? ` · ${person.phone}` : ''}</p><p className="mt-1 text-[10px] text-cyan-200">Skills: {person.skills.length ? person.skills.join(', ') : 'Not specified'}</p>
      {editingStaff?.staffId === person.staff_id ? <div className="mt-3 space-y-2 border-t border-slate-800 pt-3"><div className="grid gap-2 sm:grid-cols-2"><input required minLength={2} maxLength={100} className={inputClass} value={editingStaff.department} onChange={(e) => setEditingStaff({ ...editingStaff, department: e.target.value })}/><select className={inputClass} value={editingStaff.discipline} onChange={(e) => setEditingStaff({ ...editingStaff, discipline: e.target.value as StaffDiscipline })}>{DISCIPLINES.map((item) => <option key={item}>{item}</option>)}</select><input required type="number" min={0} max={168} step={0.5} className={inputClass} value={editingStaff.weeklyHours} onChange={(e) => setEditingStaff({ ...editingStaff, weeklyHours: Number(e.target.value) })}/><input className={inputClass} placeholder="Comma-separated skills" value={editingStaff.skills} onChange={(e) => setEditingStaff({ ...editingStaff, skills: e.target.value })}/></div><div className="flex gap-2"><button type="button" disabled={saving} onClick={() => void saveStaffChanges()} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-[10px] font-bold text-white">Save profile</button><button type="button" onClick={() => setEditingStaff(null)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-[10px] text-slate-300">Cancel</button></div></div> : <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setEditingStaff({ staffId: person.staff_id, department: person.department, discipline: person.discipline, skills: person.skills.join(', '), weeklyHours: person.contract_hours_per_week })} className="rounded-lg border border-cyan-900 px-3 py-1.5 text-[10px] font-bold text-cyan-200">Edit role, skills & hours</button>{person.employment_status === 'invited' && <button type="button" disabled={saving} onClick={() => void issueReplacementInvite(person)} className="rounded-lg border border-amber-800 px-3 py-1.5 text-[10px] font-bold text-amber-200">Issue replacement invite</button>}{person.employment_status === 'active' && <button type="button" disabled={saving} onClick={() => { void setHospitalStaffAccess(person.staff_id, false).then(reload).catch((err) => setError(err.message)); }} className="rounded-lg border border-rose-900 px-3 py-1.5 text-[10px] font-bold text-rose-300">Deactivate staff access</button>}{person.employment_status === 'inactive' && person.auth_user_id && <button type="button" disabled={saving} onClick={() => { void setHospitalStaffAccess(person.staff_id, true).then(reload).catch((err) => setError(err.message)); }} className="rounded-lg border border-emerald-900 px-3 py-1.5 text-[10px] font-bold text-emerald-300">Restore staff access</button>}</div>}</article>; })}</div> : <p className="text-xs text-slate-400">No hospital staff records yet. Add the first staff member above.</p>}</div>}

    <div className="flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-[10px] leading-relaxed text-slate-400"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400"/><p>Keep workload entries aggregate and non-identifying. These operational signals support planning conversations; they do not set staffing policy, make clinical decisions, issue purchase orders, or replace hospital review.</p></div>
    {!loading && !admin && !ownStaff && <p className="text-xs text-amber-200">Your hospital staff record is not linked. Contact your hospital administrator; do not create another account.</p>}
  </section>;
};
