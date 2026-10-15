import React, { useEffect, useRef, useState } from 'react';
import { Activity, FileSpreadsheet, ShieldCheck, Upload } from 'lucide-react';
import { combineScenarioSummaries, summarizePatientDataset, summarizeStaffDataset, type PatientDatasetSummary, type StaffDatasetSummary, type ScenarioDatasetSummary, type ScenarioShift } from '../../services/hospitalScenarioDatasets';

const inputClass = 'block w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-900 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-cyan-100';
const dateLabel = (value: string) => value ? new Date(`${value}T00:00:00`).toLocaleDateString() : '—';

export const HospitalScenarioDatasetWorkbench: React.FC<{ onSummary: (summary: ScenarioDatasetSummary | null) => void }> = ({ onSummary }) => {
  const patientSummaryRef = useRef<PatientDatasetSummary | null>(null);
  const staffSummaryRef = useRef<StaffDatasetSummary | null>(null);
  const [patientFile, setPatientFile] = useState('');
  const [staffFile, setStaffFile] = useState('');
  const [baseSummary, setBaseSummary] = useState<ScenarioDatasetSummary | null>(null);
  const [applied, setApplied] = useState(false);
  const [selectedShift, setSelectedShift] = useState<ScenarioShift>('Morning');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!baseSummary || !applied) { onSummary(null); return; }
    const availability = baseSummary.staff.shifts.find((item) => item.shift === selectedShift)?.onDutyRate ?? 1;
    onSummary({ ...baseSummary, planningDefaults: { ...baseSummary.planningDefaults, staffAvailabilityFactor: availability } });
  }, [baseSummary, selectedShift, applied, onSummary]);

  const readFile = async (kind: 'patients' | 'staff', file?: File) => {
    if (!file) return;
    if (baseSummary) {
      setBaseSummary(null);
      setApplied(false);
      setPatientFile(''); setStaffFile('');
      patientSummaryRef.current = null; staffSummaryRef.current = null;
    }
    setBusy(true); setError(null);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const contents = await file.text();
      if (kind === 'patients') { patientSummaryRef.current = summarizePatientDataset(contents); setPatientFile(file.name); }
      else { staffSummaryRef.current = summarizeStaffDataset(contents); setStaffFile(file.name); }
      if (patientSummaryRef.current && staffSummaryRef.current) {
        const summary = combineScenarioSummaries(patientSummaryRef.current, staffSummaryRef.current, selectedShift);
        setBaseSummary(summary);
      }
    } catch (reason: any) {
      if (kind === 'patients') { patientSummaryRef.current = null; setPatientFile(''); }
      else { staffSummaryRef.current = null; setStaffFile(''); }
      setError(reason?.message || 'This file could not be summarized.');
    } finally { setBusy(false); }
  };

  const summary = baseSummary ? {
    ...baseSummary,
    planningDefaults: {
      ...baseSummary.planningDefaults,
      staffAvailabilityFactor: baseSummary.staff.shifts.find((item) => item.shift === selectedShift)?.onDutyRate ?? 1,
    },
  } : null;

  return <section className="space-y-4 rounded-2xl border border-cyan-900/70 bg-slate-900 p-5" aria-labelledby="scenario-dataset-heading">
    <header className="flex items-start gap-3"><div className="rounded-lg bg-cyan-950 p-2 text-cyan-300"><Activity className="h-5 w-5"/></div><div><h3 id="scenario-dataset-heading" className="font-bold text-white">Scenario Data Workbench</h3><p className="mt-1 max-w-4xl text-xs leading-relaxed text-slate-400">Bring patient-flow and staff-shift evidence into the same operational scenario. CSVs are summarized in this browser; only aggregate planning inputs can be saved with a scenario.</p></div></header>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-200"><span className="flex items-center gap-2 font-bold"><Upload className="h-4 w-4 text-cyan-300"/>Patient admissions &amp; arrivals CSV</span><input className={inputClass} type="file" accept=".csv,text/csv" aria-label="Patient admissions and arrivals CSV" onChange={(event) => void readFile('patients', event.target.files?.[0])}/><span className="block text-[10px] text-slate-500">Supports the clinical admissions CSV and the 365-day hourly-flow CSV (date_local, demand_category, arrivals, admissions, and resource demand).</span>{patientFile && <span className="block text-[10px] text-emerald-300">Loaded and summarized: {patientFile}</span>}</label>
      <label className="space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-200"><span className="flex items-center gap-2 font-bold"><Upload className="h-4 w-4 text-cyan-300"/>Staff attendance &amp; shift CSV</span><input className={inputClass} type="file" accept=".csv,text/csv" aria-label="Staff attendance and shift CSV" onChange={(event) => void readFile('staff', event.target.files?.[0])}/><span className="block text-[10px] text-slate-500">Supports the staff-management CSV and the 365-day shift-operations CSV (date_local, shift, attendance_status, actual minutes, and task completion).</span>{staffFile && <span className="block text-[10px] text-emerald-300">Loaded and summarized: {staffFile}</span>}</label>
    </div>
    {busy && <p role="status" className="text-xs text-cyan-200">Summarizing CSV in this browser…</p>}
    {error && <p role="alert" className="rounded-lg border border-rose-800 bg-rose-950/30 p-3 text-xs text-rose-200">{error}</p>}
    {!summary && <p className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">Load both CSVs to compare patient surges with shift-level staff availability. The files are not uploaded or retained.</p>}
    {summary && <>
      {summary.syntheticData && <p role="status" className="rounded-lg border border-violet-800 bg-violet-950/30 p-3 text-xs text-violet-100"><strong>Synthetic scenario dataset.</strong> These estimates are for prototype demonstrations and must not be treated as this hospital’s live demand or staff attendance.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-800/70 bg-amber-950/20 p-3"><p className="text-xs text-amber-100">{summary.dateCoverageNote} Staff history covers {summary.staff.distinctDays} days; the two datasets overlap on {summary.overlappingDays} dates.</p><label className="flex items-center gap-2 text-xs text-slate-200">Staff scenario shift<select className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5" value={selectedShift} onChange={(event) => setSelectedShift(event.target.value as ScenarioShift)}>{summary.staff.shifts.map((item) => <option key={item.shift} value={item.shift}>{item.shift}</option>)}</select></label></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Patient rows · aggregate only" value={summary.patients.rowCount.toLocaleString()} detail={`${dateLabel(summary.patients.firstDate)} – ${dateLabel(summary.patients.lastDate)} · ${summary.patients.distinctDays} days`}/>
        <Stat label="Emergency / urgent flow" value={`${summary.patients.emergencyVisitsPerDay.toFixed(1)} / day`} detail="Historical daily average, all categories"/>
        <Stat label="Estimated occupied beds" value={`${summary.patients.estimatedOccupiedBeds.toFixed(1)} / day`} detail="Bed-hours ÷ 24 or admissions × length of stay; proxy"/>
        <Stat label={`${selectedShift} on-duty rate`} value={`${(summary.planningDefaults.staffAvailabilityFactor * 100).toFixed(0)}%`} detail={`${summary.staff.shifts.find((item) => item.shift === selectedShift)?.records || 0} shift records in sample`}/>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><h4 className="mb-2 flex items-center gap-2 text-xs font-bold text-white"><FileSpreadsheet className="h-4 w-4 text-cyan-300"/>Patient demand signals</h4><div className="grid grid-cols-2 gap-2 text-[10px] text-slate-300"><p>Emergency surgical proxy: <b>{summary.planningDefaults.emergencyDemand}/day</b></p><p>Elective surgical proxy: <b>{summary.planningDefaults.electiveDemand}/day</b></p><p>Inpatient admissions: <b>{summary.patients.inpatientAdmissionsPerDay.toFixed(1)}/day</b></p><p>ICU/severe encounter proxy: <b>{summary.patients.criticalOrSeverePerDay.toFixed(1)}/day</b></p></div><p className="mt-3 text-[10px] font-semibold text-slate-300">Largest recorded flow categories</p><div className="mt-1 flex flex-wrap gap-1.5">{summary.patients.topCategories.map((item) => <span key={item.label} className="rounded-md bg-slate-900 px-2 py-1 text-[9px] text-slate-300">{item.label} · {item.count.toLocaleString()}</span>)}</div><p className="mt-2 text-[10px] text-slate-500">Surgery proxies use admission/department labels or trauma categories; review them before using these values for local planning.</p></div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><h4 className="mb-2 text-xs font-bold text-white">Staff constraints by shift</h4><div className="space-y-2">{summary.staff.shifts.map((item) => <div key={item.shift} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-slate-800 pb-2 text-[10px]"><span className="text-slate-200">{item.shift} <span className="text-slate-500">({item.records})</span></span><span className="text-slate-300">On duty {(item.onDutyRate * 100).toFixed(0)}%</span><span className="text-slate-400">Punctual {(item.punctualRate * 100).toFixed(0)}% · +{Math.round(item.averageOvertimeMinutes)}m OT</span></div>)}</div></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cyan-900/70 bg-cyan-950/20 p-3"><p className="text-[10px] text-cyan-100">Applying sets the optimizer’s initial emergency/elective demand and scales staff-hour capacity by this shift’s sample on-duty rate. You can still edit the plan before saving it.</p><button type="button" onClick={() => setApplied(true)} disabled={applied} className="shrink-0 rounded-lg bg-cyan-700 px-4 py-2 text-xs font-bold text-white disabled:cursor-default disabled:bg-emerald-800">{applied ? 'Dataset applied to scenario' : 'Apply dataset to scenario'}</button></div>
      <p className="flex items-start gap-2 text-[10px] text-slate-500"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400"/>Files are read locally and raw rows are discarded after aggregation. Names, patient IDs, diagnoses, and vitals are not displayed or saved. These are dataset-derived planning proxies, not clinical recommendations or validated forecasts.</p>
    </>}
  </section>;
};

const Stat: React.FC<{label: string; value: string; detail: string}> = ({label, value, detail}) => <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><p className="text-[10px] font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-lg font-black text-white">{value}</p><p className="mt-1 text-[10px] text-slate-500">{detail}</p></div>;
