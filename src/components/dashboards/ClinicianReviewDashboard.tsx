import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Stethoscope,
  AlertTriangle,
  RefreshCw,
  Clock,
  ShieldCheck,
  Building2,
  Wind,
  Droplets,
  Truck,
  CheckCircle2,
  Lock,
  Info,
  Layers,
  Sparkles,
  MapPin,
  Send,
  XCircle,
  Activity,
  Bed,
  Phone,
  Check
} from 'lucide-react';
import { getPatientRequests } from '../../services/patientRequestService';
import {
  getRecommendationsForRequest,
  generateRecommendationsForRequest
} from '../../services/aiRecommendationService';
import {
  approveAndAllocateEmergencyRequest,
  rejectEmergencyRequest,
  getFacilityNetwork,
  ClinicalFacilityNetwork
} from '../../services/clinicalApprovalService';
import {
  PatientRequestTable,
  AIRecommendationTable,
  SeverityLevel,
  HospitalTable,
  BloodBankTable,
  AmbulanceTable
} from '../../types/database';
import { subscribeToSupabaseRealtime } from '../../services/supabaseDataLayer';
import { LoadingState, ErrorState, EmptyState } from '../common/EmptyState';
import { hasCapability, getRoleDisplayLabel } from '../../types/roles';
import { LeafletEmergencyMap, MapEntity } from '../common/LeafletEmergencyMap';

export const ClinicianReviewDashboard: React.FC = () => {
  const { userProfile } = useAuth();
  const [requests, setRequests] = useState<PatientRequestTable[]>([]);
  const [recommendationsMap, setRecommendationsMap] = useState<Record<string, AIRecommendationTable[]>>({});
  const [facilityNetwork, setFacilityNetwork] = useState<ClinicalFacilityNetwork | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Review Form States for each pending request
  const [selectedUrgencyMap, setSelectedUrgencyMap] = useState<Record<string, SeverityLevel>>({});
  const [selectedHospitalMap, setSelectedHospitalMap] = useState<Record<string, string>>({});
  const [selectedAmbulanceMap, setSelectedAmbulanceMap] = useState<Record<string, string>>({});
  const [selectedBloodBankMap, setSelectedBloodBankMap] = useState<Record<string, string>>({});
  const [clinicianNotesMap, setClinicianNotesMap] = useState<Record<string, string>>({});

  // Active Map inspection
  const [inspectedRequestId, setInspectedRequestId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'allocated'>('pending');

  const triggerToast = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const isAuthorized = hasCapability(userProfile?.role, 'review_clinical_case') || userProfile?.role === 'clinician_reviewer';

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [reqData, netData] = await Promise.all([
        getPatientRequests(),
        getFacilityNetwork()
      ]);

      setRequests(reqData);
      setFacilityNetwork(netData);

      // Generate or fetch AI recommendations for pending requests
      const recMap: Record<string, AIRecommendationTable[]> = {};
      const urgMap: Record<string, SeverityLevel> = {};
      const hospMap: Record<string, string> = {};
      const ambMap: Record<string, string> = {};
      const bbMap: Record<string, string> = {};

      for (const req of reqData) {
        let recs = await getRecommendationsForRequest(req.request_id);
        if (recs.length === 0 && (req.status === 'Pending' || req.status === 'Recommended')) {
          try {
            recs = await generateRecommendationsForRequest(req);
          } catch {}
        }
        recMap[req.request_id] = recs;

        // Default review form selections
        urgMap[req.request_id] = (req.reported_severity || req.severity || 'Critical') as SeverityLevel;
        if (recs.length > 0) {
          hospMap[req.request_id] = recs[0].hospital_id;
          if (recs[0].ambulance_id) ambMap[req.request_id] = recs[0].ambulance_id;
          if (recs[0].blood_bank_id) bbMap[req.request_id] = recs[0].blood_bank_id;
        } else if (netData.hospitals.length > 0) {
          hospMap[req.request_id] = netData.hospitals[0].hospital_id;
        }
      }

      setRecommendationsMap(recMap);
      setSelectedUrgencyMap(urgMap);
      setSelectedHospitalMap(hospMap);
      setSelectedAmbulanceMap(ambMap);
      setSelectedBloodBankMap(bbMap);

      if (reqData.length > 0 && !inspectedRequestId) {
        setInspectedRequestId(reqData[0].request_id);
      }
    } catch (err: any) {
      console.error('ClinicianReviewDashboard load error:', err);
      setError(err?.message || 'Failed to load emergency requests from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const unsubscribe = subscribeToSupabaseRealtime(
      ['patient_requests', 'emergency_cases', 'ai_recommendations'],
      () => fetchData()
    );

    return () => unsubscribe();
  }, [userProfile?.user_id]);

  // Handle Clinician Approval Action
  const handleApproveCase = async (req: PatientRequestTable) => {
    setProcessingId(req.request_id);
    try {
      const urgency = selectedUrgencyMap[req.request_id] || (req.reported_severity || req.severity || 'Critical');
      const hospitalId = selectedHospitalMap[req.request_id] || (facilityNetwork?.hospitals[0]?.hospital_id || 'hosp-01');
      const ambulanceId = selectedAmbulanceMap[req.request_id] || (facilityNetwork?.ambulances[0]?.ambulance_id || null);
      const bloodBankId = selectedBloodBankMap[req.request_id] || (facilityNetwork?.bloodBanks[0]?.blood_bank_id || null);
      const notes = clinicianNotesMap[req.request_id] || '';

      const res = await approveAndAllocateEmergencyRequest({
        requestId: req.request_id,
        clinicianId: userProfile?.user_id || 'clinician_demo_id',
        clinicianName: userProfile?.full_name || 'Dr. Ananya Verma',
        confirmedUrgency: urgency,
        selectedHospitalId: hospitalId,
        selectedAmbulanceId: req.needs_ambulance ? ambulanceId : null,
        selectedBloodBankId: req.needs_blood ? bloodBankId : null,
        clinicalNotes: notes
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to confirm approval');
      }

      triggerToast(`Emergency request approved! Urgency confirmed as ${urgency}. Matched facility & resources allocated.`);
      await fetchData();
    } catch (err: any) {
      alert('Approval error: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Clinician Rejection Action
  const handleRejectCase = async (req: PatientRequestTable) => {
    const reason = prompt('Please enter clinical reason for rejection / closure:', 'Duplicate report / non-emergency situational assessment');
    if (!reason) return;

    setProcessingId(req.request_id);
    try {
      await rejectEmergencyRequest(
        req.request_id,
        userProfile?.full_name || 'Clinician Reviewer',
        reason
      );
      triggerToast('Request closed with clinical review notes.');
      await fetchData();
    } catch (err: any) {
      alert('Rejection error: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'Pending' || r.status === 'Recommended');
  const allocatedRequests = requests.filter(r => r.status === 'Assigned' || r.status === 'Completed');

  const inspectedRequest = requests.find(r => r.request_id === inspectedRequestId) || requests[0];
  const inspectedRecs = inspectedRequest ? recommendationsMap[inspectedRequest.request_id] || [] : [];

  // Build Leaflet entities for the currently inspected request
  const mapEntities: MapEntity[] = [];
  if (facilityNetwork) {
    mapEntities.push(...facilityNetwork.mapEntities);
  }

  if (inspectedRequest) {
    mapEntities.push({
      id: inspectedRequest.request_id,
      name: `Patient Scene (${inspectedRequest.emergency_type})`,
      type: 'patient',
      location: {
        lat: inspectedRequest.latitude ?? 28.6139,
        lng: inspectedRequest.longitude ?? 77.2090
      },
      address: `Incident Location: ${inspectedRequest.emergency_type}`,
      phone: '+91-98765-91100',
      details: {
        status: `Self-Reported: ${inspectedRequest.reported_severity || inspectedRequest.severity}`,
        etaMinutes: 0
      }
    });
  }

  const getUrgencyBadge = (sev: SeverityLevel) => {
    switch (sev) {
      case 'Critical':
        return 'bg-rose-950 text-rose-300 border-rose-700';
      case 'High':
        return 'bg-amber-950 text-amber-300 border-amber-700';
      case 'Medium':
        return 'bg-blue-950 text-blue-300 border-blue-700';
      case 'Low':
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

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
            <div className="p-2 bg-teal-500/20 border border-teal-500/40 rounded-xl text-teal-400">
              <Stethoscope className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white">Clinician Review &amp; Triage Authorization Portal</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Human-in-the-Loop Urgency Confirmation, Nearest Resource Matching &amp; Hospital Allocation
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="bg-teal-950 text-teal-300 border border-teal-800 px-2.5 py-1 rounded-lg font-bold">
              Authorized Clinician: {userProfile?.full_name || 'Dr. Ananya Verma'}
            </span>
            <span className="bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-lg">
              Pending Evaluation: <strong className="text-amber-400">{pendingRequests.length} Cases</strong>
            </span>
            <span className="bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-lg">
              Confirmed &amp; Allocated: <strong className="text-emerald-400">{allocatedRequests.length} Cases</strong>
            </span>
          </div>
        </div>

        <button
          onClick={fetchData}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl cursor-pointer transition-all flex items-center gap-1.5 text-xs font-bold self-start sm:self-auto"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Sync Real-Time Cases</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'pending'
              ? 'bg-teal-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Awaiting Clinical Review ({pendingRequests.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('allocated')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'allocated'
              ? 'bg-teal-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          <span>Confirmed &amp; Dispatched ({allocatedRequests.length})</span>
        </button>
      </div>

      {/* Main Workstation Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: List of Requests */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400">
            <span>{activeTab === 'pending' ? 'Pending Triage Queue' : 'Allocated Emergency History'}</span>
            <span className="font-mono">Realtime Live Sync</span>
          </div>

          {loading ? (
            <LoadingState message="Loading clinician triage queue..." />
          ) : error ? (
            <ErrorState message={error} onRetry={fetchData} />
          ) : (activeTab === 'pending' ? pendingRequests : allocatedRequests).length === 0 ? (
            <EmptyState
              icon={Stethoscope}
              title={activeTab === 'pending' ? 'No pending triage cases.' : 'No allocated cases yet.'}
              description={activeTab === 'pending' ? 'New patient requests will stream here live for medical urgency validation.' : 'Confirmed and hospital-allocated cases will appear here.'}
            />
          ) : (
            <div className="space-y-4 max-h-[750px] overflow-y-auto pr-1">
              {(activeTab === 'pending' ? pendingRequests : allocatedRequests).map((req) => {
                const isSelected = inspectedRequestId === req.request_id;
                const recs = recommendationsMap[req.request_id] || [];
                const topRec = recs[0];
                const reportedSev = req.reported_severity || req.severity;
                const isPending = req.status === 'Pending' || req.status === 'Recommended';

                return (
                  <div
                    key={req.request_id}
                    onClick={() => setInspectedRequestId(req.request_id)}
                    className={`bg-slate-900 border rounded-2xl p-5 space-y-4 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-teal-500 shadow-xl shadow-teal-950/40 bg-slate-900/95'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Top Row */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-white text-base">{req.emergency_type}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${getUrgencyBadge(reportedSev)}`}>
                            Self-Reported: {reportedSev}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono">
                          ID: {req.request_id.slice(0, 16)}... • {new Date(req.created_at).toLocaleTimeString()}
                        </p>
                      </div>

                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                        isPending
                          ? 'bg-amber-950/80 text-amber-300 border-amber-700 animate-pulse'
                          : 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                      }`}>
                        {req.status === 'Pending' ? 'Awaiting Clinician Review' : req.status === 'Assigned' ? 'Approved & Assigned' : req.status}
                      </span>
                    </div>

                    {/* Demanded Resources */}
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {req.needs_icu && <span className="bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 rounded font-bold">ICU Bed</span>}
                      {req.needs_general_bed && <span className="bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded font-bold">General Bed</span>}
                      {req.needs_oxygen && <span className="bg-sky-950 text-sky-300 border border-sky-800 px-2 py-0.5 rounded font-bold">Oxygen</span>}
                      {req.needs_ambulance && <span className="bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded font-bold">Ambulance</span>}
                      {req.needs_blood && <span className="bg-red-950 text-red-300 border border-red-800 px-2 py-0.5 rounded font-bold">Blood ({req.required_blood_group})</span>}
                    </div>

                    {req.notes && (
                      <p className="text-xs text-slate-300 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                        <strong className="text-slate-400">Scene Notes:</strong> {req.notes}
                      </p>
                    )}

                    {/* Interactive Review Action Form (Only for Pending) */}
                    {isPending && isSelected && (
                      <div className="pt-4 border-t border-slate-800 space-y-4 bg-slate-950/70 -mx-5 -mb-5 p-5 rounded-b-2xl border-t">
                        <div className="flex items-center gap-1.5 text-teal-400 font-bold text-xs">
                          <ShieldCheck className="w-4 h-4" />
                          <span>Clinician Urgency Confirmation &amp; Allocation Controls</span>
                        </div>

                        {/* Urgency Selector */}
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-300">
                            1. Clinician-Confirmed Urgency Level
                          </label>
                          <div className="grid grid-cols-4 gap-2">
                            {(['Critical', 'High', 'Medium', 'Low'] as SeverityLevel[]).map((sev) => {
                              const active = selectedUrgencyMap[req.request_id] === sev;
                              return (
                                <button
                                  key={sev}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedUrgencyMap(m => ({ ...m, [req.request_id]: sev }));
                                  }}
                                  className={`py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                    active
                                      ? sev === 'Critical'
                                        ? 'bg-rose-600 text-white border-rose-400 shadow-md'
                                        : sev === 'High'
                                        ? 'bg-amber-600 text-white border-amber-400 shadow-md'
                                        : 'bg-blue-600 text-white border-blue-400 shadow-md'
                                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                                  }`}
                                >
                                  {sev}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Facility Match Selector */}
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-300">
                            2. Select Nearest Healthcare Facility
                          </label>
                          <select
                            value={selectedHospitalMap[req.request_id] || ''}
                            onChange={(e) => {
                              e.stopPropagation();
                              setSelectedHospitalMap(m => ({ ...m, [req.request_id]: e.target.value }));
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold"
                          >
                            {facilityNetwork?.hospitals.map((h) => (
                              <option key={h.hospital_id} value={h.hospital_id}>
                                🏥 {h.hospital_name} ({h.available_icu_beds} ICU Beds • {h.available_beds} General Beds • {h.trauma_center ? 'Level 1 Trauma' : 'General'})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Ambulance Selector if requested */}
                        {req.needs_ambulance && (
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-300">
                              3. Assign Immediate Ambulance Unit
                            </label>
                            <select
                              value={selectedAmbulanceMap[req.request_id] || ''}
                              onChange={(e) => {
                                e.stopPropagation();
                                setSelectedAmbulanceMap(m => ({ ...m, [req.request_id]: e.target.value }));
                              }}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold"
                            >
                              {facilityNetwork?.ambulances.map((a) => (
                                <option key={a.ambulance_id} value={a.ambulance_id}>
                                  🚑 Unit {a.vehicle_number} ({a.ambulance_type} • Driver: {a.driver_name} • Status: {a.status})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Notes input */}
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-300">
                            Medical Directives / Dispatch Notes
                          </label>
                          <input
                            type="text"
                            value={clinicianNotesMap[req.request_id] || ''}
                            onChange={(e) => {
                              e.stopPropagation();
                              setClinicianNotesMap(m => ({ ...m, [req.request_id]: e.target.value }));
                            }}
                            placeholder="e.g., Pre-alert trauma surgeon on duty, oxygen line ready on arrival"
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                          />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-3 pt-2">
                          <button
                            type="button"
                            disabled={processingId === req.request_id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApproveCase(req);
                            }}
                            className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/30 transition-all active:scale-98"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>{processingId === req.request_id ? 'Confirming...' : 'Approve & Allocate Resources'}</span>
                          </button>

                          <button
                            type="button"
                            disabled={processingId === req.request_id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRejectCase(req);
                            }}
                            className="px-4 py-3 bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Interactive Leaflet Map & Spatial Intelligence */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-teal-400" />
                  <span>Real-Time GIS Spatial Triage Map</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Visualizing patient location, nearest trauma centers, and live ambulance routes
                </p>
              </div>
              <span className="text-[10px] font-mono text-teal-400 bg-teal-950 px-2 py-0.5 rounded border border-teal-800 font-bold">
                Leaflet OpenStreetMap
              </span>
            </div>

            {/* Interactive Leaflet Map Component */}
            <LeafletEmergencyMap
              entities={mapEntities}
              center={inspectedRequest?.latitude ? [inspectedRequest.latitude, inspectedRequest.longitude || 77.2090] : [28.6139, 77.2090]}
              zoom={13}
              height="380px"
              activeRouteDestinationId={selectedHospitalMap[inspectedRequest?.request_id || ''] || inspectedRecs[0]?.hospital_id}
            />

            {/* AI Recommendation Facility Comparison */}
            {inspectedRequest && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5 text-blue-400">
                    <Sparkles className="w-4 h-4" /> AI Compatibility Match Scores ({inspectedRecs.length})
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">Grounded in Supabase Real-Time Inventory</span>
                </div>

                {inspectedRecs.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No facility matches calculated yet.</p>
                ) : (
                  <div className="space-y-2">
                    {inspectedRecs.map((rec, idx) => {
                      const hospital = facilityNetwork?.hospitals.find(h => h.hospital_id === rec.hospital_id);
                      const isChosen = selectedHospitalMap[inspectedRequest.request_id] === rec.hospital_id;

                      return (
                        <div
                          key={rec.recommendation_id || idx}
                          onClick={() => setSelectedHospitalMap(m => ({ ...m, [inspectedRequest.request_id]: rec.hospital_id }))}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 text-xs ${
                            isChosen
                              ? 'bg-blue-950/80 border-blue-500 text-white shadow-md'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
                              <span className="font-bold text-white text-sm">
                                {hospital?.hospital_name || `Facility (${rec.hospital_id.slice(0, 8)}...)`}
                              </span>
                              {isChosen && (
                                <span className="bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                                  CHOSEN ALLOCATION
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              {rec.recommendation_reason}
                            </p>
                            <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400 pt-1">
                              <span>Distance: <strong className="text-slate-200">{rec.distance_km} km</strong></span>
                              <span>ETA: <strong className="text-emerald-400">~{rec.eta_minutes} mins</strong></span>
                              <span>ICU Beds: <strong className="text-slate-200">{hospital?.available_icu_beds ?? 4}</strong></span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono font-black text-xs block">
                              {rec.confidence_score}%
                            </span>
                            <span className="text-[9px] text-slate-500 font-mono mt-1 block">Rank #{idx + 1}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
