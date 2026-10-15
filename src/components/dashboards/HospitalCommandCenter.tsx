import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, Clock3, RefreshCw, ShieldCheck, Siren } from 'lucide-react';
import { HospitalResourceOptimizer } from '../HospitalResourceOptimizer';
import { getHospitalActivities, getHospitalShifts, getHospitalStaff, getHospitalSupplyUsage, estimateOperationalDemand, type HospitalActivityRecord, type HospitalShiftRecord, type HospitalStaffRecord, type SupplyUsageRecord } from '../../services/hospitalOperationsService';
import { calculateHospitalORCapacities, type HospitalORCapacities, type HospitalORSnapshot } from '../../services/hospitalORPlanning';
import { getHospitalORSnapshot } from '../../services/hospitalORService';
import type { ICUInventoryTable, GeneralBedInventoryTable, MedicineInventoryTable, OxygenInventoryTable } from '../../types/database';
import { OperatingRoomManager } from './OperatingRoomManager';
import { HospitalScenarioDatasetWorkbench } from './HospitalScenarioDatasetWorkbench';
import type { ScenarioDatasetSummary } from '../../services/hospitalScenarioDatasets';

interface Props { hospitalId: string; icu: ICUInventoryTable | null; general: GeneralBedInventoryTable | null; oxygen: OxygenInventoryTable[]; medicines: MedicineInventoryTable[]; }
const panel = 'rounded-2xl border border-slate-800 bg-slate-900 p-5';

export const HospitalCommandCenter: React.FC<Props> = ({ hospitalId, icu, general, oxygen, medicines }) => {
  const [activities, setActivities] = useState<HospitalActivityRecord[]>([]);
  const [usage, setUsage] = useState<SupplyUsageRecord[]>([]);
  const [staff, setStaff] = useState<HospitalStaffRecord[]>([]);
  const [shifts, setShifts] = useState<HospitalShiftRecord[]>([]);
  const [orSnapshot, setOrSnapshot] = useState<HospitalORSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [surge, setSurge] = useState(0);
  const [roomOutage, setRoomOutage] = useState(false);
  const [staffAbsent, setStaffAbsent] = useState(false);
  const [scenarioDataset, setScenarioDataset] = useState<ScenarioDatasetSummary | null>(null);
  const onDatasetSummary = useCallback((summary: ScenarioDatasetSummary | null) => setScenarioDataset(summary), []);
  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const now = new Date(); const from = new Date(now.getTime() - 30 * 86400000); const to = new Date(now.getTime() + 8 * 86400000);
    try {
      const [activityRows, usageRows, staffRows, shiftRows, orRows] = await Promise.all([
        getHospitalActivities(hospitalId, from.toISOString().slice(0, 10)), getHospitalSupplyUsage(hospitalId, from.toISOString()),
        getHospitalStaff(hospitalId), getHospitalShifts(hospitalId, new Date(now.getTime() - 86400000), to), getHospitalORSnapshot(hospitalId, from, to),
      ]);
      setActivities(activityRows); setUsage(usageRows); setStaff(staffRows); setShifts(shiftRows); setOrSnapshot(orRows);
    } catch (e: any) { setError(e?.message || 'Command-center evidence could not be loaded. Verify the additive workforce and OR migrations.'); }
    finally { setLoading(false); }
  }, [hospitalId]);
  useEffect(() => { void reload(); }, [reload]);

  const demand = useMemo(() => estimateOperationalDemand(activities, usage), [activities, usage]);
  const horizon = useMemo(() => ({ from: new Date(), to: new Date(Date.now() + 24 * 3600000) }), []);
  const sevenDay = useMemo(() => ({ from: new Date(), to: new Date(Date.now() + 7 * 86400000) }), []);
  const capacities24 = useMemo(() => orSnapshot ? calculateHospitalORCapacities(orSnapshot.rooms, orSnapshot.bookings, orSnapshot.assignments, staff, shifts, horizon.from, horizon.to) : null, [orSnapshot, staff, shifts, horizon]);
  const capacities7 = useMemo(() => orSnapshot ? calculateHospitalORCapacities(orSnapshot.rooms, orSnapshot.bookings, orSnapshot.assignments, staff, shifts, sevenDay.from, sevenDay.to) : null, [orSnapshot, staff, shifts, sevenDay]);
  const activeStaff = staff.filter((person) => person.employment_status === 'active').length;
  const confirmedShifts = shifts.filter((shift) => shift.status === 'confirmed');
  const baselineEmergencyDemand = scenarioDataset?.planningDefaults.emergencyDemand ?? demand.activityDailyAverage?.emergency_visits ?? 0;
  const projectedEmergency24 = Math.ceil(baselineEmergencyDemand * (1 + surge / 100));
  const projectedEmergency7 = Math.ceil(baselineEmergencyDemand * 7 * (1 + surge / 100));
  const capacity24: HospitalORCapacities = capacities24 || { roomMinutes: 0, surgeonMinutes: 0, anesthesiaMinutes: 0, nursingMinutes: 0, scheduledRoomMinutes: 0 };
  const capacity7: HospitalORCapacities = capacities7 || { roomMinutes: 0, surgeonMinutes: 0, anesthesiaMinutes: 0, nursingMinutes: 0, scheduledRoomMinutes: 0 };
  const scenarioCapacity = roomOutage ? { ...capacity24, roomMinutes: Math.max(0, capacity24.roomMinutes - (orSnapshot?.rooms.find((room) => room.status === 'available')?.operating_minutes_per_day || 0)) } : capacity24;
  const scenarioStaffMultiplier = (staffAbsent ? 0.8 : 1) * (scenarioDataset?.planningDefaults.staffAvailabilityFactor ?? 1);
  const scenarioDefaults = useMemo(() => scenarioDataset ? ({
    emergencyDemand: scenarioDataset.planningDefaults.emergencyDemand,
    electiveDemand: scenarioDataset.planningDefaults.electiveDemand,
  }) : null, [scenarioDataset]);
  const oxygenOptions = oxygen.map((item) => ({ id: item.oxygen_inventory_id, label: `${item.oxygen_type} · ${item.unit}`, available: Math.max(0, item.available_capacity - item.reserved_capacity), protected: item.minimum_threshold }));

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2 text-cyan-300"><Activity className="h-5 w-5"/><h2 className="text-xl font-black text-white">Hospital Command Center</h2></div><p className="mt-1 max-w-3xl text-xs text-slate-300">One planning view for operating-room throughput, staffing coverage, resource constraints, forecasts, and surge scenarios. Decisions remain with hospital operations leads.</p></div>
      <button type="button" onClick={() => void reload()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>Refresh evidence</button>
    </header>
    {error && <p role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p>}
    <HospitalScenarioDatasetWorkbench onSummary={onDatasetSummary}/>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Hospital operations summary">
      <Metric label="Active staff" value={String(activeStaff)} detail={`${confirmedShifts.length} confirmed shifts in view`}/>
      <Metric label="Emergency visits · last 14 days" value={String(demand.activity.emergency_visits)} detail={`${demand.activityDays} daily records · aggregate only`}/>
      <Metric label="Available OR time · next 24 hours" value={`${Math.floor(capacity24.roomMinutes / 60)} h`} detail={`${Math.floor(capacity7.roomMinutes / 60)} h across 7 days`}/>
      <Metric label="Upcoming scheduled procedures" value={String(orSnapshot?.bookings.filter((booking) => ['confirmed','in_progress'].includes(booking.status)).length || 0)} detail="Confirmed bookings; proposals excluded"/>
    </section>
    <section className={`${panel} space-y-4`}>
      <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-cyan-300"/><h3 className="font-bold text-white">Explainable demand outlook</h3></div>
      {!demand.activityDailyAverage || demand.activityDays < 3 ? <p className="rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-xs text-amber-100">Not enough daily workload history for a useful baseline. At least 3 recorded days are needed; current sample is {demand.activityDays}. Enter aggregate daily counts in Workforce &amp; demand.</p> : <div className="grid gap-3 md:grid-cols-2">
        <ForecastCard title="Next 24 hours" estimate={projectedEmergency24} days={demand.activityDays} activity={demand.activityDailyAverage} multiplier={1} supply={demand.supply}/>
        <ForecastCard title="Next 7 days" estimate={projectedEmergency7} days={demand.activityDays} activity={demand.activityDailyAverage} multiplier={7} supply={demand.supply}/>
      </div>}
      <p className="text-[10px] text-slate-400">Method: observed emergency-visit average per recorded day × horizon. This transparent baseline is descriptive planning support, not a validated ML model or patient-level prediction. Supply estimates use recorded consumption rates and show their sample size.</p>
    </section>
    <section className={`${panel} space-y-4`}>
      <div className="flex items-center gap-2"><Siren className="h-4 w-4 text-amber-300"/><h3 className="font-bold text-white">Operational surge digital twin</h3></div>
      <p className="text-xs text-slate-400">Change one or more operating assumptions and compare available capacity and aggregate emergency workload. This is a planning scenario; it does not alter real bookings, shifts, inventory, or clinical priorities.</p>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">Emergency-demand surge <strong className="float-right text-amber-200">+{surge}%</strong><input aria-label="Emergency demand surge percentage" type="range" min="0" max="100" step="10" value={surge} onChange={(event) => setSurge(Number(event.target.value))} className="mt-3 w-full accent-amber-400"/></label>
        <label className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300"><input type="checkbox" checked={roomOutage} onChange={(event) => setRoomOutage(event.target.checked)} className="accent-amber-400"/>One available OR unavailable</label>
        <label className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300"><input type="checkbox" checked={staffAbsent} onChange={(event) => setStaffAbsent(event.target.checked)} className="accent-amber-400"/>Model 20% shift-capacity absence</label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2"><ScenarioMetric label={scenarioDataset ? 'Emergency surgery proxy · baseline / scenario' : 'Emergency visits · baseline / scenario'} value={`${Math.ceil(baselineEmergencyDemand)} / ${projectedEmergency24} (24h)`} detail={`${Math.ceil(baselineEmergencyDemand * 7)} / ${projectedEmergency7} (7d)`}/><ScenarioMetric label="OR capacity · baseline / scenario" value={`${Math.floor(capacity24.roomMinutes / 60)} / ${Math.floor(scenarioCapacity.roomMinutes / 60)} hours`} detail={`Surge scenario team capacity: ${Math.floor((capacity24.surgeonMinutes + capacity24.anesthesiaMinutes + capacity24.nursingMinutes) / 60)} / ${Math.floor((capacity24.surgeonMinutes + capacity24.anesthesiaMinutes + capacity24.nursingMinutes) / 60 * scenarioStaffMultiplier)} staff-hours`}/></div>
      <p className="text-[10px] text-slate-500">The scenario applies the selected sample shift’s on-duty rate across role-based staff-hour capacity because the file does not map cleanly to the live roster. The optional 20% absence toggle adds another what-if reduction. Neither changes scheduled staffing.</p>
    </section>
    <section className={`${panel} space-y-3`}>
      <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-cyan-300"/><h3 className="font-bold text-white">Constraint-based resource plan</h3></div>
      <p className="text-xs text-slate-400">Bed, oxygen, OR, and staff capacity are drawn from this hospital’s records. Emergency kits remain an explicit planning input. Per-case ratios must be reviewed by local operations leadership.</p>
      <HospitalResourceOptimizer hospitalId={hospitalId} icuAvailable={icu?.available_icu_beds || 0} icuProtected={icu?.minimum_icu_beds || 0} generalAvailable={general?.available_beds || 0} generalProtected={general?.minimum_beds || 0} oxygenOptions={oxygenOptions} observedEmergencyDemand={scenarioDataset ? projectedEmergency24 : demand.activityDays >= 3 ? projectedEmergency24 : null} scenarioDatasetDefaults={scenarioDefaults} operationalCapacity={{ operatingRoomHours: scenarioCapacity.roomMinutes / 60, surgeonHours: capacity24.surgeonMinutes / 60 * scenarioStaffMultiplier, anesthesiaHours: capacity24.anesthesiaMinutes / 60 * scenarioStaffMultiplier, nursingHours: capacity24.nursingMinutes / 60 * scenarioStaffMultiplier, roomCount: Math.max(0, (orSnapshot?.rooms.filter((room) => room.status === 'available').length || 0) - (roomOutage ? 1 : 0))}}/>
    </section>
    <OperatingRoomManager hospitalId={hospitalId} staff={staff} shifts={shifts} snapshot={orSnapshot} onChanged={reload}/>
    <p className="flex items-start gap-2 text-[10px] text-slate-500"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400"/>No patient names, diagnoses, or free-text clinical notes are collected in this module. The schedule accepts pseudonymous elective case categories and requires an active hospital administrator to confirm changes.</p>
    {medicines.length > 0 && <p className="text-[10px] text-slate-500">Supply records available: {medicines.length} medicine lines, {oxygen.length} oxygen lines. The optimizer does not reserve or modify these inventories.</p>}
  </div>;
};

const Metric: React.FC<{ label: string; value: string; detail: string }> = ({ label, value, detail }) => <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-2xl font-black text-white">{value}</p><p className="mt-1 text-[10px] text-slate-500">{detail}</p></div>;
const ScenarioMetric: React.FC<{ label: string; value: string; detail: string }> = ({ label, value, detail }) => <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-3"><p className="text-[10px] text-amber-100">{label}</p><p className="mt-1 text-lg font-black text-white">{value}</p><p className="text-[10px] text-slate-400">{detail}</p></div>;
const ForecastCard: React.FC<{ title: string; estimate: number; days: number; activity: ReturnType<typeof estimateOperationalDemand>['activityDailyAverage']; multiplier: 1|7; supply: ReturnType<typeof estimateOperationalDemand>['supply'] }> = ({ title, estimate, days, activity, multiplier, supply }) => <article className="rounded-xl border border-slate-800 bg-slate-950 p-4"><h4 className="text-xs font-bold text-white">{title}</h4><p className="mt-2 text-2xl font-black text-cyan-200">~{estimate} emergency visits</p><p className="text-[10px] text-slate-400">Based on {days} recorded days. Simple average extrapolation from aggregate daily records.</p><div className="mt-3 grid grid-cols-2 gap-2">{activity && ([['Admissions',activity.admissions],['Procedures',activity.procedures],['Outpatient visits',activity.outpatient_visits]] as const).map(([label, daily]) => <p key={label} className="rounded-md bg-slate-900 px-2 py-1.5 text-[10px] text-slate-300">{label}: ~{Math.ceil(daily * multiplier)}</p>)}</div><div className="mt-3 space-y-1">{supply.slice(0, 4).map((item) => <p key={`${item.category}-${item.item}-${item.unit}`} className="text-[10px] text-slate-300">{item.item}: ~{(item.dailyAverage * multiplier).toFixed(1)} {item.unit} ({item.observedDays} usage dates)</p>)}{supply.length === 0 && <p className="text-[10px] text-slate-500">No supply consumption records in the 30-day window.</p>}</div></article>;
