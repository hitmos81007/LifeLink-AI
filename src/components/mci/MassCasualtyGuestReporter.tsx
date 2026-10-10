import React, { useState } from 'react';
import {
  AlertTriangle,
  Flame,
  Truck,
  Building2,
  Users,
  MapPin,
  Send,
  CheckCircle2,
  X,
  Phone,
  Clock,
  ShieldAlert,
  Sparkles,
  ArrowRight,
  Activity,
  Plus,
  Minus
} from 'lucide-react';
import { LeafletEmergencyMap, MapEntity } from '../common/LeafletEmergencyMap';
import {
  reportMassCasualtyIncident,
  MciHazardType,
  MciTriageCount,
  MciIncidentReport,
  createEmptyMciTriageCounts,
  createSyntheticMciExampleCounts,
  SYNTHETIC_MCI_LOCATION
} from '../../services/massCasualtyService';

interface MassCasualtyGuestReporterProps {
  isOpen: boolean;
  onClose: () => void;
}

const HAZARD_OPTIONS: { type: MciHazardType; label: string; icon: string; desc: string }[] = [
  {
    type: 'Multi-Vehicle Collision / Highway Pileup',
    label: 'Highway Pileup / Crash',
    icon: '🚗💥',
    desc: 'Multi-car or bus accident on highway/flyover'
  },
  {
    type: 'Structural Collapse / Building Hazard',
    label: 'Structural Collapse',
    icon: '🏢⚠️',
    desc: 'Building, bridge or construction site collapse'
  },
  {
    type: 'Industrial Explosion / Chemical Incident',
    label: 'Industrial / Chemical Blast',
    icon: '🏭☣️',
    desc: 'Factory explosion, gas leak, hazardous material'
  },
  {
    type: 'Fire & Burn Emergency',
    label: 'Major Fire & Burn',
    icon: '🔥🚒',
    desc: 'High-rise fire, commercial complex inferno'
  },
  {
    type: 'Transit / Train Disaster',
    label: 'Transit / Train Derailment',
    icon: '🚆🚨',
    desc: 'Metro, passenger train, or aviation incident'
  },
  {
    type: 'Mass Gathering Stampede',
    label: 'Crowd Stampede',
    icon: '👥⚡',
    desc: 'Festival, stadium or station surge disaster'
  }
];

export const MassCasualtyGuestReporter: React.FC<MassCasualtyGuestReporterProps> = ({
  isOpen,
  onClose
}) => {
  const [hazardType, setHazardType] = useState<MciHazardType>(
    'Multi-Vehicle Collision / Highway Pileup'
  );
  const [triage, setTriage] = useState<MciTriageCount>(createEmptyMciTriageCounts);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [activeReport, setActiveReport] = useState<MciIncidentReport | null>(null);

  if (!isOpen) return null;

  const totalVictims = triage.red + triage.yellow + triage.green + triage.black;

  const updateTriage = (key: keyof MciTriageCount, delta: number) => {
    setTriage(prev => ({
      ...prev,
      [key]: Math.max(0, prev[key] + delta)
    }));
  };

  const handleFastReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setIsSubmitting(true);

    try {
      const report = await reportMassCasualtyIncident({
        hazard_type: hazardType,
        triage
      });

      setActiveReport(report);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to run the local simulation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Build Leaflet entities for incident visualization
  const mapEntities: MapEntity[] = [];

  if (activeReport) {
    // Incident Pin
    mapEntities.push({
      id: activeReport.incident_id,
      name: `${activeReport.hazard_type} (${activeReport.incident_code})`,
      type: 'mci',
      location: { lat: activeReport.latitude, lng: activeReport.longitude },
      address: activeReport.location_name,
      details: {
        casualties: activeReport.total_casualties,
        triageRed: activeReport.triage.red,
        triageYellow: activeReport.triage.yellow,
        triageGreen: activeReport.triage.green,
        triageBlack: activeReport.triage.black
      }
    });

    // Allocated Hospitals
    activeReport.hospital_allocations.forEach(h => {
      mapEntities.push({
        id: h.hospital_id,
        name: h.hospital_name,
        type: 'hospital',
        location: {
          lat: h.latitude,
          lng: h.longitude
        },
        address: `${h.distance_km} km straight-line example distance`,
        details: {
          traumaLevel: h.trauma_center ? 'Level 1 Regional Trauma' : 'Emergency Center',
          icuBeds: h.open_icu_beds,
          availableBeds: h.open_general_beds,
          distanceKm: h.distance_km,
          etaMinutes: h.eta_minutes
        }
      });
    });

    // Example vehicle positions are illustrative and are never dispatched.
    activeReport.example_ambulances.forEach((a) => {
      mapEntities.push({
        id: a.ambulance_id,
        name: `Unit ${a.vehicle_number} (${a.ambulance_type})`,
        type: 'ambulance',
        location: {
          lat: a.latitude,
          lng: a.longitude
        },
        address: 'Example vehicle position • not en route',
        details: {
          vehicleId: a.vehicle_number,
          driverName: a.driver_name,
          status: 'SIMULATED ALLOCATION ONLY'
        }
      });
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-red-800/80 rounded-3xl max-w-4xl w-full max-h-[92vh] overflow-y-auto p-6 sm:p-8 space-y-6 shadow-2xl relative text-slate-100 animate-in fade-in zoom-in duration-200">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl cursor-pointer transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Top Banner */}
        <div className="flex items-center gap-3 border-b border-red-900/60 pb-4">
          <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-600/40 animate-pulse">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white tracking-tight">
                Mass Casualty Incident (MCI) Fast Report
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-red-950 text-red-300 border border-red-700">
                LOCAL SIMULATION ONLY
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Test a synthetic scenario. Nothing is reported, broadcast, or dispatched.
            </p>
          </div>
        </div>

        {/* SUCCESS VIEW AFTER SUBMISSION */}
        {activeReport ? (
          <div className="space-y-6 animate-in fade-in">
            <div className="bg-emerald-950/60 border border-emerald-500/50 p-4 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
                <div>
                  <h3 className="text-base font-black text-white">
                    Simulation complete: {activeReport.incident_code}
                  </h3>
                  <p className="text-xs text-emerald-300 mt-0.5">
                    Synthetic allocation shown. No alert was sent and no ambulance was dispatched.
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 bg-emerald-900 text-emerald-200 border border-emerald-700 rounded-xl font-mono text-xs font-bold">
                DEMO ONLY
              </span>
            </div>

            {/* Illustrative synthetic scenario map */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                <span className="flex items-center gap-1.5 text-red-400">
                  <Activity className="w-4 h-4" /> Illustrative MCI Scenario Map
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  OpenStreetMap • 2.5 km example radius
                </span>
              </div>
              <LeafletEmergencyMap
                entities={mapEntities}
                center={[activeReport.latitude, activeReport.longitude]}
                zoom={13}
                height="320px"
                showRadiusCircle={true}
                radiusMeters={2500}
                activeRouteDestinationId={activeReport.hospital_allocations[0]?.hospital_id}
              />
            </div>

            {/* Example resource distribution */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-blue-400" /> Illustrative Resource Allocation
              </h4>
              <p className="text-[11px] text-slate-400">Example distribution based on fictional capacity values; this is not a clinical recommendation or admission.</p>
              {(activeReport.unallocated.red + activeReport.unallocated.yellow + activeReport.unallocated.green) > 0 && <div role="status" className="rounded-xl border border-amber-700 bg-amber-950/60 p-3 text-xs text-amber-200"><strong>Illustrative capacity exceeded.</strong> Not represented as allocated: {activeReport.unallocated.red} RED, {activeReport.unallocated.yellow} YELLOW, and {activeReport.unallocated.green} GREEN. No real facility has been contacted.</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeReport.hospital_allocations.map(h => (
                  <div key={h.hospital_id} className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">{h.hospital_name}</span>
                      <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 text-[10px] font-mono font-bold">
                        {h.distance_km} km • ~{h.eta_minutes}m illustrative estimate
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono">
                      <div className="bg-red-950/70 border border-red-800 p-2 rounded-xl">
                        <span className="text-[10px] text-red-300 block font-bold">RED (ICU)</span>
                        <span className="text-base font-black text-red-400">{h.allocated_red}</span>
                      </div>
                      <div className="bg-amber-950/70 border border-amber-800 p-2 rounded-xl">
                        <span className="text-[10px] text-amber-300 block font-bold">YELLOW</span>
                        <span className="text-base font-black text-amber-400">{h.allocated_yellow}</span>
                      </div>
                      <div className="bg-emerald-950/70 border border-emerald-800 p-2 rounded-xl">
                        <span className="text-[10px] text-emerald-300 block font-bold">GREEN</span>
                        <span className="text-base font-black text-emerald-400">{h.allocated_green}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Example vehicle allocation */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-emerald-400" /> Example Ambulances ({activeReport.example_ambulances.length})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {activeReport.example_ambulances.map(a => (
                  <div key={a.ambulance_id} className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-xs space-y-0.5">
                    <div className="flex justify-between font-bold text-white">
                      <span>{a.vehicle_number}</span>
                      <span className="text-emerald-400 font-mono">~{a.eta_minutes}m illustrative estimate</span>
                    </div>
                    <p className="text-[11px] text-slate-400">{a.driver_name} ({a.ambulance_type})</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setActiveReport(null)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold cursor-pointer transition-all"
              >
                Submit Another Report
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-lg shadow-blue-600/30"
              >
                Done / Close Console
              </button>
            </div>
          </div>
        ) : (
          /* REPORT INTAKE FORM */
          <form onSubmit={handleFastReportSubmit} className="space-y-6">
            <div className="rounded-xl border border-amber-700 bg-amber-950/50 p-3 text-xs text-amber-200">
              Simulation only. Use fictional scenario details. This tool does not contact emergency services or update hospital systems.
            </div>
            {submitError && <p role="alert" className="rounded-xl border border-red-700 bg-red-950/60 p-3 text-xs text-red-200">{submitError}</p>}
            {/* Step 1: Hazard Selection */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-200 uppercase tracking-wider block">
                1. Select Incident / Disaster Type
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {HAZARD_OPTIONS.map(opt => (
                  <div
                    key={opt.type}
                    onClick={() => setHazardType(opt.type)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-1 ${
                      hazardType === opt.type
                        ? 'bg-red-950/80 border-red-500 text-white shadow-lg shadow-red-900/30'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <div className="text-2xl">{opt.icon}</div>
                    <div>
                      <span className="font-bold text-xs text-white block">{opt.label}</span>
                      <span className="text-[10px] text-slate-400 line-clamp-1">{opt.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 2: Disaster Triage Breakdown */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-200 uppercase tracking-wider">
                  2. Casualty Estimation &amp; START Triage Breakdown
                </label>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setTriage(createSyntheticMciExampleCounts())}
                    className="text-[11px] font-bold text-blue-300 hover:text-white underline underline-offset-2">
                    Load synthetic example
                  </button>
                  <span className="text-xs font-mono font-bold text-red-400">
                    Total Estimated: <strong className="text-white text-sm">{totalVictims}</strong> victims
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {/* RED */}
                <div className="bg-red-950/60 border border-red-600/80 p-3 rounded-2xl space-y-2">
                  <div className="flex justify-between items-center text-red-300 font-bold">
                    <span>RED (Critical)</span>
                    <span className="text-[10px] bg-red-900 px-1.5 py-0.5 rounded">Immediate</span>
                  </div>
                  <div className="flex items-center justify-between bg-slate-950 p-1 rounded-xl border border-red-800">
                    <button type="button" onClick={() => updateTriage('red', -1)} className="p-1 text-slate-400 hover:text-white"><Minus className="w-4 h-4" /></button>
                    <span className="font-mono text-lg font-black text-red-400">{triage.red}</span>
                    <button type="button" onClick={() => updateTriage('red', 1)} className="p-1 text-slate-400 hover:text-white"><Plus className="w-4 h-4" /></button>
                  </div>
                </div>

                {/* YELLOW */}
                <div className="bg-amber-950/60 border border-amber-600/80 p-3 rounded-2xl space-y-2">
                  <div className="flex justify-between items-center text-amber-300 font-bold">
                    <span>YELLOW (Serious)</span>
                    <span className="text-[10px] bg-amber-900 px-1.5 py-0.5 rounded">Delayed</span>
                  </div>
                  <div className="flex items-center justify-between bg-slate-950 p-1 rounded-xl border border-amber-800">
                    <button type="button" onClick={() => updateTriage('yellow', -1)} className="p-1 text-slate-400 hover:text-white"><Minus className="w-4 h-4" /></button>
                    <span className="font-mono text-lg font-black text-amber-400">{triage.yellow}</span>
                    <button type="button" onClick={() => updateTriage('yellow', 1)} className="p-1 text-slate-400 hover:text-white"><Plus className="w-4 h-4" /></button>
                  </div>
                </div>

                {/* GREEN */}
                <div className="bg-emerald-950/60 border border-emerald-600/80 p-3 rounded-2xl space-y-2">
                  <div className="flex justify-between items-center text-emerald-300 font-bold">
                    <span>GREEN (Minor)</span>
                    <span className="text-[10px] bg-emerald-900 px-1.5 py-0.5 rounded">Walking</span>
                  </div>
                  <div className="flex items-center justify-between bg-slate-950 p-1 rounded-xl border border-emerald-800">
                    <button type="button" onClick={() => updateTriage('green', -1)} className="p-1 text-slate-400 hover:text-white"><Minus className="w-4 h-4" /></button>
                    <span className="font-mono text-lg font-black text-emerald-400">{triage.green}</span>
                    <button type="button" onClick={() => updateTriage('green', 1)} className="p-1 text-slate-400 hover:text-white"><Plus className="w-4 h-4" /></button>
                  </div>
                </div>

                {/* BLACK */}
                <div className="bg-slate-950 border border-slate-700 p-3 rounded-2xl space-y-2">
                  <div className="flex justify-between items-center text-slate-400 font-bold">
                    <span>BLACK (Deceased)</span>
                    <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded">Morgue</span>
                  </div>
                  <div className="flex items-center justify-between bg-slate-900 p-1 rounded-xl border border-slate-700">
                    <button type="button" onClick={() => updateTriage('black', -1)} className="p-1 text-slate-400 hover:text-white"><Minus className="w-4 h-4" /></button>
                    <span className="font-mono text-lg font-black text-slate-300">{triage.black}</span>
                    <button type="button" onClick={() => updateTriage('black', 1)} className="p-1 text-slate-400 hover:text-white"><Plus className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
              {totalVictims === 0 && <p className="text-[11px] text-slate-400">Counts start at zero. Enter fictional scenario counts or load the synthetic example to continue.</p>}
            </div>

            {/* Step 3: Fixed synthetic demo location */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-200 uppercase tracking-wider block">
                3. Fixed Synthetic Scenario Location
              </label>
              <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-700">
                <MapPin className="w-4 h-4 text-rose-500" />
                <span>{SYNTHETIC_MCI_LOCATION.name}. Location is fixed for demonstration and cannot be edited.</span>
              </div>

              {/* Illustrative map centered on the fixed synthetic point */}
              <LeafletEmergencyMap
                center={[SYNTHETIC_MCI_LOCATION.latitude, SYNTHETIC_MCI_LOCATION.longitude]}
                zoom={14}
                height="220px"
              />
            </div>

            <p className="text-[11px] text-slate-400">No reporter contact details, scene addresses, GPS pins, or free-text medical notes are collected. Results stay in this browser as a local demonstration.</p>

            {/* 1-Tap Trigger Button */}
            <button
              type="submit"
              disabled={isSubmitting || totalVictims === 0}
              className="w-full py-4 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-700 disabled:shadow-none disabled:cursor-not-allowed text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl shadow-red-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98"
            >
              <Send className="w-5 h-5" />
              <span>{isSubmitting ? 'Running local simulation...' : 'Run synthetic MCI simulation'}</span>
            </button>
          </form>
        )}

      </div>
    </div>
  );
};
