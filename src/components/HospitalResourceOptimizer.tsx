import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, Calculator, Clock3, Save, ShieldCheck, Sparkles } from 'lucide-react';
import {
  HospitalPlanningInput, HospitalPlanningResult, listHospitalPlanningScenarios, optimizeHospitalPlan,
  RESOURCE_KEYS, RESOURCE_LABELS, ResourceKey, SavedHospitalPlanningScenario, saveHospitalPlanningScenario,
  validatePlanningInput,
} from '../services/hospitalResourceOptimizer';

interface Props {
  hospitalId: string;
  icuAvailable: number;
  icuProtected: number;
  generalAvailable: number;
  generalProtected: number;
  oxygenOptions: Array<{ id: string; label: string; available: number; protected: number }>;
  operationalCapacity?: { operatingRoomHours: number; surgeonHours: number; anesthesiaHours: number; nursingHours: number; roomCount: number };
  observedEmergencyDemand?: number | null;
  scenarioDatasetDefaults?: { emergencyDemand: number; electiveDemand: number } | null;
}

const DEMO_INPUT: Omit<HospitalPlanningInput, 'capacity'> = {
  horizonHours: 24,
  emergencyDemand: 0,
  electiveDemand: 0,
  oxygenInventoryId: null,
  oxygenUnitLabel: 'No oxygen record selected',
  operatingRoomOpen: true,
  criticalEquipmentReady: true,
  sterileWorkflowReady: true,
  perCase: {
    emergency: { icuBeds: 0.25, generalBeds: 0.5, oxygenUnits: 1, operatingRoomHours: 1.5, surgeonHours: 1.5, anesthesiaHours: 1.5, nursingHours: 2, emergencyKits: 1 },
    elective: { icuBeds: 0.1, generalBeds: 1, oxygenUnits: 0.2, operatingRoomHours: 2, surgeonHours: 2, anesthesiaHours: 2, nursingHours: 3, emergencyKits: 0 },
  },
};

function numericInput(value: number, onChange: (value: number) => void, options: { min?: number; step?: number; disabled?: boolean } = {}) {
  return <input type="number" min={options.min ?? 0} step={options.step ?? 'any'} value={value} disabled={options.disabled}
    onChange={(event) => onChange(event.target.value === '' ? 0 : Number(event.target.value))}
    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white disabled:text-slate-400" />;
}

export const HospitalResourceOptimizer: React.FC<Props> = ({ hospitalId, icuAvailable, icuProtected, generalAvailable, generalProtected, oxygenOptions, operationalCapacity, observedEmergencyDemand, scenarioDatasetDefaults }) => {
  const [scenarioName, setScenarioName] = useState('24-hour resource plan');
  const [input, setInput] = useState<HospitalPlanningInput>({
    ...DEMO_INPUT,
    capacity: {
      icuBeds: Math.max(0, icuAvailable - icuProtected),
      generalBeds: Math.max(0, generalAvailable - generalProtected),
      oxygenUnits: 0,
      operatingRoomHours: 16, surgeonHours: 40, anesthesiaHours: 24, nursingHours: 80, emergencyKits: 12,
    },
  });
  const [history, setHistory] = useState<SavedHospitalPlanningScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [usingSavedSnapshot, setUsingSavedSnapshot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (usingSavedSnapshot) return;
    setInput((current) => ({ ...current, capacity: {
      ...current.capacity,
      icuBeds: Math.max(0, icuAvailable - icuProtected),
      generalBeds: Math.max(0, generalAvailable - generalProtected),
    } }));
  }, [icuAvailable, icuProtected, generalAvailable, generalProtected, usingSavedSnapshot]);

  useEffect(() => {
    if (usingSavedSnapshot) return;
    setInput((current) => {
      const selected = oxygenOptions.find((option) => option.id === current.oxygenInventoryId) || oxygenOptions[0];
      const capacity = selected ? Math.max(0, selected.available - selected.protected) : 0;
      const unitLabel = selected?.label || 'No matching oxygen inventory record';
      if (current.oxygenInventoryId === (selected?.id || null) && current.oxygenUnitLabel === unitLabel && current.capacity.oxygenUnits === capacity) return current;
      return { ...current, oxygenInventoryId: selected?.id || null, oxygenUnitLabel: unitLabel,
        capacity: { ...current.capacity, oxygenUnits: capacity } };
    });
  }, [oxygenOptions, usingSavedSnapshot]);

  useEffect(() => {
    if (usingSavedSnapshot || !operationalCapacity) return;
    const horizonMultiplier = input.horizonHours / 24;
    setInput((current) => ({ ...current, capacity: {
      ...current.capacity,
      operatingRoomHours: operationalCapacity.operatingRoomHours * horizonMultiplier,
      surgeonHours: operationalCapacity.surgeonHours * horizonMultiplier,
      anesthesiaHours: operationalCapacity.anesthesiaHours * horizonMultiplier,
      nursingHours: operationalCapacity.nursingHours * horizonMultiplier,
    } }));
  }, [operationalCapacity, input.horizonHours, usingSavedSnapshot]);

  useEffect(() => {
    if (usingSavedSnapshot || observedEmergencyDemand == null) return;
    setInput((current) => current.emergencyDemand === observedEmergencyDemand ? current : { ...current, emergencyDemand: observedEmergencyDemand });
  }, [observedEmergencyDemand, usingSavedSnapshot]);

  useEffect(() => {
    if (usingSavedSnapshot || !scenarioDatasetDefaults) return;
    setInput((current) => ({ ...current, emergencyDemand: scenarioDatasetDefaults.emergencyDemand, electiveDemand: scenarioDatasetDefaults.electiveDemand }));
  }, [scenarioDatasetDefaults, usingSavedSnapshot]);

  const reload = async () => {
    setLoading(true); setError(null);
    try { setHistory(await listHospitalPlanningScenarios(hospitalId)); }
    catch (loadError: any) { setError(loadError?.message || 'Saved scenarios could not be loaded. Apply the planning migration and retry.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void reload(); }, [hospitalId]);

  const validationError = validatePlanningInput(input);
  const resourceLabel = (key: ResourceKey) => key === 'oxygenUnits' ? `Oxygen (${input.oxygenUnitLabel})` : RESOURCE_LABELS[key];
  const result: HospitalPlanningResult | null = useMemo(() => {
    if (validationError) return null;
    try { return optimizeHospitalPlan(input); } catch { return null; }
  }, [input, validationError]);

  const setCapacity = (key: ResourceKey, value: number) => setInput((current) => ({ ...current, capacity: { ...current.capacity, [key]: value } }));
  const setPerCase = (caseType: 'emergency' | 'elective', key: ResourceKey, value: number) => setInput((current) => ({
    ...current, perCase: { ...current.perCase, [caseType]: { ...current.perCase[caseType], [key]: value } },
  }));

  const calculateAndSave = async () => {
    if (!result || saving) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      await saveHospitalPlanningScenario(hospitalId, scenarioName, input, result);
      setNotice('Scenario saved with its inputs, constraints, and recommendation.');
      await reload();
    } catch (saveError: any) { setError(saveError?.message || 'The scenario could not be saved.'); }
    finally { setSaving(false); }
  };

  const loadScenario = (scenario: SavedHospitalPlanningScenario) => {
    setUsingSavedSnapshot(true);
    setScenarioName(scenario.scenario_name);
    setInput(scenario.input_snapshot);
    setNotice(`Loaded “${scenario.scenario_name}”. The recommendation is recalculated from its saved inputs.`);
    setError(null);
  };

  return (
    <section className="space-y-5 rounded-2xl border border-cyan-800/70 bg-slate-900 p-5 sm:p-6" aria-labelledby="resource-optimizer-heading">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-cyan-300"><Calculator className="h-5 w-5" /><h2 id="resource-optimizer-heading" className="text-lg font-black text-white">Hospital Resource Optimizer</h2></div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">Compare projected emergency cases and planned elective surgeries against beds, operating-room time, shift coverage, and emergency-kit availability. Emergency cases are prioritized first; the remaining capacity is offered to elective cases.</p>
        </div>
        <span className="rounded-full border border-cyan-800 bg-cyan-950/50 px-3 py-1 text-[10px] font-bold uppercase text-cyan-200">Planning support · Human review</span>
      </header>

      <div className="rounded-xl border border-amber-800/70 bg-amber-950/25 p-3 text-[11px] leading-relaxed text-amber-100">
        <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>Prototype assumptions:</strong> Seed values below are illustrative. Replace them with hospital-approved estimates. This scenario solver is not a clinical scheduling tool, does not reserve resources, and does not change inventory. Existing bed-demand estimates above are synthetic request-rate references, not validated forecasts.</p></div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.9fr)]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-xs font-semibold text-slate-300 sm:col-span-2">Scenario name
              <input value={scenarioName} maxLength={100} onChange={(event) => setScenarioName(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-300">Planning horizon
              <select value={input.horizonHours} onChange={(event) => setInput((current) => ({ ...current, horizonHours: Number(event.target.value) }))} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
                <option value={24}>Next 24 hours</option><option value={72}>Next 72 hours</option><option value={168}>Next 7 days</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-300">Expected emergency surgical cases
              {numericInput(input.emergencyDemand, (value) => setInput((current) => ({ ...current, emergencyDemand: Math.floor(value) })), { step: 1 })}
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-300">Planned elective surgeries
              {numericInput(input.electiveDemand, (value) => setInput((current) => ({ ...current, electiveDemand: Math.floor(value) })), { step: 1 })}
            </label>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <h3 className="text-xs font-bold text-white">Operating-room readiness checks</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                ['operatingRoomOpen', 'OR service open and staffed'],
                ['criticalEquipmentReady', 'Required equipment ready'],
                ['sterileWorkflowReady', 'Sterile instruments ready'],
              ] as const).map(([field, label]) => <label key={field} className="flex items-start gap-2 rounded-lg bg-slate-900 p-2 text-[11px] text-slate-300"><input type="checkbox" checked={input[field]} onChange={(event) => setInput((current) => ({ ...current, [field]: event.target.checked }))} className="mt-0.5 accent-cyan-500" />{label}</label>)}
            </div>
            <p className="text-[10px] text-slate-500">A failed readiness check blocks both case groups in this scenario and surfaces the issue for review.</p>
          </div>

          <div className="space-y-3">
            <div><h3 className="text-sm font-bold text-white">Capacity available in this scenario</h3><p className="text-[10px] text-slate-400">Bed capacity comes from the current inventory, less its protected minimum. Other values are scenario inputs for the selected horizon.</p></div>
            <label className="block max-w-xl space-y-1 text-[11px] font-semibold text-slate-300">Oxygen inventory line used
              {oxygenOptions.length > 0 ? <select value={input.oxygenInventoryId || ''} onChange={(event) => {
                const selected = oxygenOptions.find((option) => option.id === event.target.value);
                setInput((current) => ({ ...current, oxygenInventoryId: selected?.id || null, oxygenUnitLabel: selected?.label || 'No matching oxygen inventory record', capacity: { ...current.capacity, oxygenUnits: selected ? Math.max(0, selected.available - selected.protected) : 0 } }));
              }} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">{oxygenOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select> : <span className="block rounded-lg border border-amber-800 bg-amber-950/30 px-3 py-2 text-amber-200">No oxygen inventory record; planning units are zero</span>}
            </label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {RESOURCE_KEYS.map((key) => {
                const databaseCapacity = key === 'icuBeds' || key === 'generalBeds' || (key === 'oxygenUnits' && oxygenOptions.length > 0) || Boolean(operationalCapacity && ['operatingRoomHours','surgeonHours','anesthesiaHours','nursingHours'].includes(key));
                const value = input.capacity[key];
                return <label key={key} className="space-y-1 text-[11px] font-semibold text-slate-300">{resourceLabel(key)}{databaseCapacity && <span className="ml-1 text-cyan-300">· Supabase</span>}
                  {numericInput(value, (next) => setCapacity(key, next), { step: key.includes('Beds') || key === 'emergencyKits' ? 1 : 0.5, disabled: databaseCapacity })}
                </label>;
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div><h3 className="text-sm font-bold text-white">Average resource use per case</h3><p className="text-[10px] text-slate-400">Set local planning averages. Bed use may be fractional to represent expected occupancy across the horizon.</p></div>
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="min-w-[640px] w-full text-left text-[11px]">
                <thead className="bg-slate-950 text-slate-300"><tr><th className="p-2.5">Resource</th><th className="p-2.5">Emergency surgical case</th><th className="p-2.5">Elective surgery</th></tr></thead>
                <tbody className="divide-y divide-slate-800">{RESOURCE_KEYS.map((key) => <tr key={key}>
                  <th className="p-2.5 font-medium text-slate-300">{resourceLabel(key)}</th>
                  <td className="p-2">{numericInput(input.perCase.emergency[key], (value) => setPerCase('emergency', key, value), { step: key === 'emergencyKits' ? 1 : 0.1 })}</td>
                  <td className="p-2">{numericInput(input.perCase.elective[key], (value) => setPerCase('elective', key, value), { step: key === 'emergencyKits' ? 1 : 0.1 })}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4" aria-live="polite">
          <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-cyan-300" /><h3 className="font-bold text-white">Allocation recommendation</h3></div>
          {validationError ? <p className="rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-xs text-amber-200">{validationError}</p> : result ? <>
            <p className="text-[10px] text-slate-400">Greedy constraint solver · emergency cases prioritized · no clinical triage</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-slate-900 p-3"><p className="text-[10px] uppercase text-slate-400">Emergency cases</p><p className="mt-1 text-xl font-black text-rose-300">{result.emergencyCasesPlanned}<span className="text-sm text-slate-500"> / {input.emergencyDemand}</span></p><p className="text-[10px] text-slate-400">{result.emergencyCasesDeferred} deferred by capacity limits</p></div>
              <div className="rounded-lg bg-slate-900 p-3"><p className="text-[10px] uppercase text-slate-400">Elective surgeries</p><p className="mt-1 text-xl font-black text-sky-300">{result.electiveCasesPlanned}<span className="text-sm text-slate-500"> / {input.electiveDemand}</span></p><p className="text-[10px] text-slate-400">{result.electiveCasesDeferred} deferred by capacity limits</p></div>
            </div>
            {result.readinessBlockers.length > 0 && <p className="rounded-lg border border-rose-800 bg-rose-950/30 p-3 text-xs text-rose-100"><strong>Readiness blocked:</strong> {result.readinessBlockers.join(' ')}</p>}
            {result.limitingResources.length > 0 && <p className="rounded-lg border border-amber-800/70 bg-amber-950/25 p-3 text-xs text-amber-100"><strong>Likely bottlenecks:</strong> {result.limitingResources.map(resourceLabel).join(', ')}. Check the assumptions and local operating conditions.</p>}
            {result.emergencyCasesDeferred + result.electiveCasesDeferred > 0 && <p className="text-xs text-rose-200">Some projected demand does not fit. Review constraints and escalate through your hospital’s established process.</p>}
            <div className="space-y-1.5">{RESOURCE_KEYS.map((key) => <div key={key} className="flex justify-between gap-3 border-b border-slate-800 py-1.5 text-[10px]"><span className="text-slate-400">{resourceLabel(key)}</span><span className="font-mono text-slate-200">{result.resourceUse[key].used.toFixed(key.includes('Hours') ? 1 : 2)} used · {result.resourceUse[key].remaining.toFixed(key.includes('Hours') ? 1 : 2)} left</span></div>)}</div>
            <button type="button" onClick={() => void calculateAndSave()} disabled={saving || !scenarioName.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-cyan-600 disabled:opacity-50">{saving ? <Clock3 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Saving scenario…' : 'Save this recommendation'}</button>
          </> : null}
          <div className="flex items-start gap-2 border-t border-slate-800 pt-3 text-[10px] text-slate-400"><ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" /><p>Review the plan with clinical and operations leads. A saved recommendation is not a booking or authorization.</p></div>
        </aside>
      </div>

      {notice && <p className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-3 text-xs text-emerald-200" role="status">{notice}</p>}
      {error && <p className="rounded-lg border border-rose-800 bg-rose-950/30 p-3 text-xs text-rose-200" role="alert">{error}</p>}

      <div className="space-y-2 border-t border-slate-800 pt-4">
        <h3 className="text-sm font-bold text-white">Saved scenarios</h3>
        {loading ? <p className="text-xs text-slate-400">Loading saved plans…</p> : history.length === 0 ? <p className="text-xs text-slate-400">No scenarios saved yet. Saving requires the hospital-planning migration in Supabase.</p> : <div className="grid gap-2 md:grid-cols-2">{history.map((scenario) => <button type="button" key={scenario.scenario_id} onClick={() => loadScenario(scenario)} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-left hover:border-cyan-800"><span><span className="block text-xs font-bold text-white">{scenario.scenario_name}</span><span className="text-[10px] text-slate-400">{new Date(scenario.created_at).toLocaleString()} · {scenario.result_snapshot.emergencyCasesPlanned} emergency, {scenario.result_snapshot.electiveCasesPlanned} elective</span></span><ArrowDownToLine className="h-4 w-4 shrink-0 text-cyan-300" /></button>)}</div>}
      </div>
      <p className="text-[10px] text-slate-500">The stored example assumptions are not recommended staffing ratios, clinical standards, validated forecasts, or a schedule. Replace them with locally reviewed values before evaluating a scenario.</p>
    </section>
  );
};
