import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  HeartPulse,
  Plus,
  Send,
  Droplets,
  CheckCircle2,
  RefreshCw,
  Bed,
  Stethoscope,
  Wind,
  Truck,
  Sparkles,
  Building2,
  AlertTriangle,
  MapPin,
  Clock,
  Phone,
  ShieldCheck,
  Check,
  Navigation,
  ArrowRight,
  Crosshair
} from 'lucide-react';
import {
  createPatientEmergencyRequest,
  getPatientRequests
} from '../../services/patientRequestService';
import {
  getRecommendationsForRequest,
  generateRecommendationsForRequest
} from '../../services/aiRecommendationService';
import {
  getFacilityNetwork,
  ClinicalFacilityNetwork
} from '../../services/clinicalApprovalService';
import {
  PatientRequestTable,
  AIRecommendationTable,
  EmergencyType,
  BloodGroup,
  SeverityLevel,
  HospitalTable,
  BloodBankTable,
  AmbulanceTable
} from '../../types/database';
import { subscribeToSupabaseRealtime } from '../../services/supabaseDataLayer';
import { supabase } from '../../lib/supabase/client';
import { EmptyState, LoadingState, ErrorState } from '../common/EmptyState';
import { LeafletEmergencyMap, MapEntity } from '../common/LeafletEmergencyMap';

export const PatientDashboard: React.FC = () => {
  const { userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [requests, setRequests] = useState<PatientRequestTable[]>([]);
  const [recommendationsMap, setRecommendationsMap] = useState<Record<string, AIRecommendationTable[]>>({});
  const [emergencyCasesMap, setEmergencyCasesMap] = useState<Record<string, any>>({});
  const [facilityNetwork, setFacilityNetwork] = useState<ClinicalFacilityNetwork | null>(null);

  // Form State strictly mapping `patient_requests`
  const [emergencyType, setEmergencyType] = useState<EmergencyType>('Cardiac Arrest');
  const [requiredBloodGroup, setRequiredBloodGroup] = useState<BloodGroup | ''>('O-');
  const [needsBlood, setNeedsBlood] = useState(true);
  const [needsIcu, setNeedsIcu] = useState(true);
  const [needsGeneralBed, setNeedsGeneralBed] = useState(false);
  const [needsOxygen, setNeedsOxygen] = useState(true);
  const [needsAmbulance, setNeedsAmbulance] = useState(true);
  const [severity, setSeverity] = useState<SeverityLevel>('Critical');
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({ lat: 28.6139, lng: 77.2090 });
  const [locationName, setLocationName] = useState('Sector 4 Connaught Place');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Selected request for live care tracking
  const [activeTrackingRequestId, setActiveTrackingRequestId] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [netData, casesRes] = await Promise.all([
        getFacilityNetwork(),
        supabase.from('emergency_cases').select('*')
      ]);

      setFacilityNetwork(netData);

      const cMap: Record<string, any> = {};
      ((casesRes.data as any[]) || []).forEach(c => {
        cMap[c.request_id] = c;
      });
      setEmergencyCasesMap(cMap);

      if (userProfile?.user_id) {
        const reqs = await getPatientRequests(userProfile.user_id);
        setRequests(reqs);

        const recMap: Record<string, AIRecommendationTable[]> = {};
        for (const req of reqs) {
          const recs = await getRecommendationsForRequest(req.request_id);
          recMap[req.request_id] = recs;
        }
        setRecommendationsMap(recMap);

        if (reqs.length > 0 && !activeTrackingRequestId) {
          setActiveTrackingRequestId(reqs[0].request_id);
        }
      } else {
        setRequests([]);
      }
    } catch (err: any) {
      console.error('PatientDashboard load error:', err);
      setError('Failed to query patient emergency requests from Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Supabase Realtime Listener across requests and emergency cases
    const unsubscribe = subscribeToSupabaseRealtime(
      ['patient_requests', 'emergency_cases', 'ai_recommendations'],
      () => fetchData()
    );
    return () => unsubscribe();
  }, [userProfile?.user_id]);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userProfile?.user_id) {
      alert('Authentication session error: user profile ID missing.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const newReq = await createPatientEmergencyRequest({
        patient_id: userProfile.user_id,
        emergency_type: emergencyType,
        required_blood_group: needsBlood ? (requiredBloodGroup || 'O-') as BloodGroup : null,
        needs_blood: needsBlood,
        needs_icu: needsIcu,
        needs_general_bed: needsGeneralBed,
        needs_oxygen: needsOxygen,
        needs_ambulance: needsAmbulance,
        severity,
        latitude: coords.lat,
        longitude: coords.lng,
        notes: notes.trim() ? `${locationName} - ${notes.trim()}` : locationName
      });

      setNotes('');
      await fetchData();
      setActiveTrackingRequestId(newReq.request_id);
      triggerToast('Emergency request submitted! Live care tracking initiated.');
    } catch (err: any) {
      setError('Failed to submit emergency request: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const activeTrackingRequest = requests.find(r => r.request_id === activeTrackingRequestId) || requests[0];
  const activeCase = activeTrackingRequest ? emergencyCasesMap[activeTrackingRequest.request_id] : null;
  const activeRecs = activeTrackingRequest ? recommendationsMap[activeTrackingRequest.request_id] || [] : [];
  
  const assignedHospital = activeCase?.assigned_hospital_id
    ? facilityNetwork?.hospitals.find(h => h.hospital_id === activeCase.assigned_hospital_id)
    : activeRecs.length > 0 ? facilityNetwork?.hospitals.find(h => h.hospital_id === activeRecs[0].hospital_id) : null;

  const assignedAmbulance = activeCase?.assigned_ambulance_id
    ? facilityNetwork?.ambulances.find(a => a.ambulance_id === activeCase.assigned_ambulance_id)
    : activeRecs.length > 0 && activeRecs[0].ambulance_id ? facilityNetwork?.ambulances.find(a => a.ambulance_id === activeRecs[0].ambulance_id) : null;

  const isApproved = activeTrackingRequest?.status === 'Assigned' || activeCase?.confirmation_status === 'confirmed';

  // Build Leaflet entities for live tracking
  const trackingEntities: MapEntity[] = [];
  if (facilityNetwork) {
    trackingEntities.push(...facilityNetwork.mapEntities);
  }

  if (activeTrackingRequest) {
    trackingEntities.push({
      id: activeTrackingRequest.request_id,
      name: 'Your Emergency Location',
      type: 'patient',
      location: {
        lat: activeTrackingRequest.latitude ?? coords.lat,
        lng: activeTrackingRequest.longitude ?? coords.lng
      },
      address: activeTrackingRequest.notes || 'Emergency Incident Site',
      details: {
        status: `Self-Reported: ${activeTrackingRequest.reported_severity || activeTrackingRequest.severity}`,
        etaMinutes: 0
      }
    });
  }

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6 rounded-2xl border border-slate-800 shadow-2xl">
      {/* Toast Notification */}
      {actionSuccess && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border border-emerald-400 text-xs font-bold animate-bounce">
          <CheckCircle2 className="w-5 h-5" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-400">
              <HeartPulse className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white">Patient Emergency Care &amp; Live Tracking Portal</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Logged in as: <strong className="text-white">{userProfile?.full_name || 'Patient'}</strong> ({userProfile?.email})
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={fetchData}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl cursor-pointer transition-all flex items-center gap-1.5 text-xs font-bold self-start sm:self-auto"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Sync Status</span>
        </button>
      </div>

      {/* ACTIVE CARE ORDER TRACKER (Food Delivery / Ride-Hailing Style) */}
      {activeTrackingRequest && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-blue-950/70 border border-blue-500/40 p-6 rounded-3xl space-y-6 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-black text-white">
                  Live Care Tracker: {activeTrackingRequest.emergency_type}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  isApproved
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-500 animate-pulse'
                    : 'bg-amber-950 text-amber-300 border-amber-500'
                }`}>
                  {isApproved ? '🟢 Clinician Approved & Allocated' : '🟡 Awaiting Clinician Approval'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Request Ref: {activeTrackingRequest.request_id.slice(0, 18)}... • Submitted: {new Date(activeTrackingRequest.created_at).toLocaleTimeString()}
              </p>
            </div>

            {assignedHospital && (
              <div className="bg-slate-950/80 p-3 rounded-2xl border border-blue-800/60 flex items-center gap-3">
                <Building2 className="w-8 h-8 text-blue-400 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Assigned Destination</span>
                  <span className="text-xs font-black text-white">{assignedHospital.hospital_name}</span>
                  <span className="text-[11px] text-emerald-400 block font-mono">
                    {assignedHospital.available_icu_beds} ICU Beds Reserved • {assignedHospital.district}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 5-Stage Live Status Stepper */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              {/* Step 1 */}
              <div className="bg-slate-950 p-3 rounded-2xl border border-emerald-500/60 space-y-1">
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                  ✓
                </div>
                <span className="font-bold text-white block">1. Request Received</span>
                <p className="text-[10px] text-emerald-300">Geotagged &amp; queued</p>
              </div>

              {/* Step 2 */}
              <div className={`p-3 rounded-2xl border space-y-1 ${
                isApproved
                  ? 'bg-slate-950 border-emerald-500/60'
                  : 'bg-amber-950/60 border-amber-500 animate-pulse'
              }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                  isApproved ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-slate-950'
                }`}>
                  {isApproved ? '✓' : '2'}
                </div>
                <span className="font-bold text-white block">2. Clinician Review</span>
                <p className="text-[10px] text-slate-300">
                  {isApproved ? 'Urgency verified by Dr.' : 'Evaluating triage priority'}
                </p>
              </div>

              {/* Step 3 */}
              <div className={`p-3 rounded-2xl border space-y-1 ${
                isApproved
                  ? 'bg-slate-950 border-emerald-500/60'
                  : 'bg-slate-950/60 border-slate-800 text-slate-500'
              }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                  isApproved ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-500'
                }`}>
                  {isApproved ? '✓' : '3'}
                </div>
                <span className="font-bold text-white block">3. Facility Matched</span>
                <p className="text-[10px] text-slate-300">
                  {isApproved ? assignedHospital?.hospital_name || 'Hospital Matched' : 'Waiting approval'}
                </p>
              </div>

              {/* Step 4 */}
              <div className={`p-3 rounded-2xl border space-y-1 ${
                isApproved && assignedAmbulance
                  ? 'bg-emerald-950/50 border-emerald-500 animate-pulse'
                  : 'bg-slate-950/60 border-slate-800 text-slate-500'
              }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                  isApproved ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-500'
                }`}>
                  {isApproved ? '🚑' : '4'}
                </div>
                <span className="font-bold text-white block">4. Ambulance Dispatched</span>
                <p className="text-[10px] text-slate-300">
                  {isApproved ? `Unit ${assignedAmbulance?.vehicle_number || 'AMB-08'} En Route` : 'Standby'}
                </p>
              </div>

              {/* Step 5 */}
              <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 text-slate-500 space-y-1">
                <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-500 flex items-center justify-center font-bold text-xs">
                  5
                </div>
                <span className="font-bold text-slate-300 block">5. ER Admission</span>
                <p className="text-[10px]">ICU Bed Held</p>
              </div>
            </div>
          </div>

          {/* Live Interactive Leaflet Map showing Patient -> Matched Hospital & Ambulance Route */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span className="flex items-center gap-1.5 text-blue-400">
                <Navigation className="w-4 h-4" /> Live Emergency Transit Map &amp; Green Corridor Route
              </span>
              <span className="text-[11px] font-mono text-emerald-400">
                {isApproved ? '🟢 Live GPS Route Active' : '🟡 Awaiting Clinician Approval to Connect Route'}
              </span>
            </div>

            <LeafletEmergencyMap
              entities={trackingEntities}
              center={activeTrackingRequest?.latitude ? [activeTrackingRequest.latitude, activeTrackingRequest.longitude || 77.2090] : [coords.lat, coords.lng]}
              zoom={14}
              height="340px"
              activeRouteDestinationId={assignedHospital?.hospital_id}
            />

            {/* Live Transit Telemetry Strip */}
            {isApproved && assignedHospital && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 text-xs font-mono">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-sans">Distance to Facility</span>
                  <strong className="text-white text-sm">~2.4 km</strong>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-sans">Estimated Response ETA</span>
                  <strong className="text-emerald-400 text-sm">~6 - 8 Minutes</strong>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-sans">Dispatched Ambulance</span>
                  <strong className="text-amber-300 text-sm">{assignedAmbulance?.vehicle_number || 'DL-01-AMB-8812'}</strong>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">Emergency Line</span>
                    <strong className="text-blue-400 text-xs">+91-11-2345-0001</strong>
                  </div>
                  <a
                    href="tel:108"
                    className="p-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg cursor-pointer"
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Grid: Create Request Form + Request History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Create Emergency Request Form */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-6">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-rose-500" />
              <span>Submit New Emergency Request</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Directly streams to authorised clinician reviewer dashboard for immediate triage validation.
            </p>
          </div>

          <form onSubmit={handleSubmitRequest} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Emergency Type</label>
                <select
                  value={emergencyType}
                  onChange={(e) => setEmergencyType(e.target.value as EmergencyType)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white"
                >
                  <option value="Cardiac Arrest">Cardiac Arrest</option>
                  <option value="Road Accident">Road Accident</option>
                  <option value="Stroke">Stroke</option>
                  <option value="Trauma">Trauma</option>
                  <option value="Burn">Burn</option>
                  <option value="Pregnancy">Pregnancy</option>
                  <option value="Poisoning">Poisoning</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Self-Reported Urgency</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-bold"
                >
                  <option value="Critical">Critical (Immediate Life-Threat)</option>
                  <option value="High">High (Serious Condition)</option>
                  <option value="Medium">Medium (Moderate Urgency)</option>
                  <option value="Low">Low (Non-Critical)</option>
                </select>
              </div>
            </div>

            {/* Resource Requirements Checkboxes */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300">Demanded Medical Resources</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <label className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${needsIcu ? 'bg-rose-950/60 border-rose-500 text-rose-200' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
                  <input type="checkbox" checked={needsIcu} onChange={(e) => setNeedsIcu(e.target.checked)} className="rounded border-slate-700 accent-rose-500" />
                  <Bed className="w-3.5 h-3.5" />
                  <span>Needs ICU</span>
                </label>

                <label className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${needsGeneralBed ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
                  <input type="checkbox" checked={needsGeneralBed} onChange={(e) => setNeedsGeneralBed(e.target.checked)} className="rounded border-slate-700 accent-indigo-500" />
                  <Stethoscope className="w-3.5 h-3.5" />
                  <span>General Bed</span>
                </label>

                <label className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${needsOxygen ? 'bg-sky-950/60 border-sky-500 text-sky-200' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
                  <input type="checkbox" checked={needsOxygen} onChange={(e) => setNeedsOxygen(e.target.checked)} className="rounded border-slate-700 accent-sky-500" />
                  <Wind className="w-3.5 h-3.5" />
                  <span>Needs Oxygen</span>
                </label>

                <label className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${needsAmbulance ? 'bg-amber-950/60 border-amber-500 text-amber-200' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
                  <input type="checkbox" checked={needsAmbulance} onChange={(e) => setNeedsAmbulance(e.target.checked)} className="rounded border-slate-700 accent-amber-500" />
                  <Truck className="w-3.5 h-3.5" />
                  <span>Ambulance</span>
                </label>

                <label className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${needsBlood ? 'bg-red-950/60 border-red-500 text-red-200' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
                  <input type="checkbox" checked={needsBlood} onChange={(e) => setNeedsBlood(e.target.checked)} className="rounded border-slate-700 accent-red-500" />
                  <Droplets className="w-3.5 h-3.5" />
                  <span>Needs Blood</span>
                </label>
              </div>
            </div>

            {needsBlood && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Required Blood Group</label>
                <select
                  value={requiredBloodGroup}
                  onChange={(e) => setRequiredBloodGroup(e.target.value as BloodGroup)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono"
                >
                  <option value="O-">O- (Universal Donor)</option>
                  <option value="O+">O+</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                </select>
              </div>
            )}

            {/* Interactive Leaflet Pin-Drop Location Picker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300">Incident Scene Location</label>
                <span className="text-[10px] text-slate-400 font-mono">
                  Lat: {coords.lat.toFixed(4)}, Lng: {coords.lng.toFixed(4)}
                </span>
              </div>

              <input
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="Landmark / Street Address"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white"
              />

              <LeafletEmergencyMap
                center={[coords.lat, coords.lng]}
                zoom={14}
                height="180px"
                selectableLocation={true}
                selectedLocation={coords}
                onLocationSelect={(loc) => {
                  setCoords({ lat: loc.lat, lng: loc.lng });
                  if (loc.address) setLocationName(loc.address);
                }}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Scene Notes / Patient Details</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Non-clinical symptoms, accessibility constraints..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black tracking-wider uppercase cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? 'Submitting to Emergency Network...' : 'Submit Emergency Request'}</span>
            </button>
          </form>
        </div>

        {/* Existing Requests & AI Recommendations History */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-white">Your Emergency Request History</h2>
              <p className="text-xs text-slate-400 mt-0.5">Click any request to focus live tracking above</p>
            </div>
            <span className="text-xs font-mono font-bold text-slate-400">{requests.length} Records</span>
          </div>

          {loading ? (
            <LoadingState message="Loading your emergency records..." />
          ) : requests.length === 0 ? (
            <EmptyState
              icon={HeartPulse}
              title="No requests logged yet."
              description="Use the emergency submission form on the left to request immediate care."
            />
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {requests.map((req) => {
                const isSelected = activeTrackingRequestId === req.request_id;
                const recs = recommendationsMap[req.request_id] || [];
                const eCase = emergencyCasesMap[req.request_id];
                const isConfirmed = req.status === 'Assigned' || eCase?.confirmation_status === 'confirmed';

                return (
                  <div
                    key={req.request_id}
                    onClick={() => setActiveTrackingRequestId(req.request_id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2 text-xs ${
                      isSelected
                        ? 'bg-slate-950 border-blue-500 shadow-lg'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-white text-sm">{req.emergency_type}</span>
                      <span className={`px-2.5 py-0.5 rounded font-bold text-[10px] border ${
                        isConfirmed
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                          : 'bg-amber-950 text-amber-300 border-amber-700'
                      }`}>
                        {isConfirmed ? '✓ Approved & Assigned' : 'Awaiting Clinician Review'}
                      </span>
                    </div>

                    <p className="text-slate-400 text-[11px] line-clamp-1">
                      {req.notes || `Location: (${req.latitude?.toFixed(3)}, ${req.longitude?.toFixed(3)})`}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1">
                      <span>{new Date(req.created_at).toLocaleString()}</span>
                      {recs.length > 0 && (
                        <span className="text-blue-400 font-bold">
                          {recs.length} AI Matches Available
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
