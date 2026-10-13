import React, { useState, useEffect, useRef } from 'react';
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
  getClinicalReviewNetwork,
  ClinicalReviewNetwork
} from '../../services/clinicalApprovalService';
import {
  PatientRequestTable,
  AIRecommendationTable,
  SeverityLevel
} from '../../types/database';
import { subscribeToSupabaseRealtime } from '../../services/supabaseDataLayer';
import { LoadingState, ErrorState, EmptyState } from '../common/EmptyState';
import { hasCapability, getRoleDisplayLabel } from '../../types/roles';
import { LeafletEmergencyMap, MapEntity } from '../common/LeafletEmergencyMap';
import { IncidentPlanningPanel } from '../mci/IncidentPlanningPanel';
import { getResourceFreshness } from '../../services/resourceFreshness';
import { calculateHaversineDistance } from '../../services/geoService';

function isFacilityCompatibleWithRequest(
  hospital: ClinicalReviewNetwork['hospitals'][number],
  request: PatientRequestTable
): boolean {
  const requiredIcuBeds = request.needs_icu ? (request.requested_icu_beds ?? 1) : 0;
  const requiredGeneralBeds = request.needs_general_bed ? (request.requested_general_beds ?? 1) : 0;
  if (request.needs_icu && (!Number.isInteger(requiredIcuBeds) || requiredIcuBeds < 1
    || !Number.isFinite(hospital.allocatable_icu_beds) || hospital.allocatable_icu_beds < requiredIcuBeds
    || getResourceFreshness(hospital.icu_updated_at ?? null, 'icu') !== 'Fresh')) return false;
  if (request.needs_general_bed && (!Number.isInteger(requiredGeneralBeds) || requiredGeneralBeds < 1
    || !Number.isFinite(hospital.allocatable_general_beds) || hospital.allocatable_general_beds < requiredGeneralBeds
    || getResourceFreshness(hospital.beds_updated_at ?? null, 'beds') !== 'Fresh')) return false;
  if (request.needs_oxygen && (hospital.available_oxygen_records <= 0
    || getResourceFreshness(hospital.oxygen_updated_at ?? null, 'oxygen') !== 'Fresh')) return false;
  return true;
}

export const ClinicianReviewDashboard: React.FC = () => {
  const { userProfile } = useAuth();
  const [requests, setRequests] = useState<PatientRequestTable[]>([]);
  const [recommendationsMap, setRecommendationsMap] = useState<Record<string, AIRecommendationTable[]>>({});
  const [facilityNetwork, setFacilityNetwork] = useState<ClinicalReviewNetwork | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [recommendationErrorsMap, setRecommendationErrorsMap] = useState<Record<string, string>>({});
  const [unverifiedLegacyRequestCount, setUnverifiedLegacyRequestCount] = useState(0);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [refreshingRecommendationId, setRefreshingRecommendationId] = useState<string | null>(null);

  // Review Form States for each pending request
  const [selectedUrgencyMap, setSelectedUrgencyMap] = useState<Record<string, SeverityLevel>>({});
  const [selectedHospitalMap, setSelectedHospitalMap] = useState<Record<string, string>>({});
  const [selectedAmbulanceMap, setSelectedAmbulanceMap] = useState<Record<string, string>>({});
  const [selectedBloodBankMap, setSelectedBloodBankMap] = useState<Record<string, string>>({});

  // Active Map inspection
  const [inspectedRequestId, setInspectedRequestId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'allocated'>('pending');
  const recommendationGenerationsInFlight = useRef(new Map<string, Promise<AIRecommendationTable[]>>());
  const fetchSequence = useRef(0);
  const fetchDataRef = useRef<() => Promise<void>>(async () => {});

  const triggerToast = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const isAuthorized = hasCapability(userProfile?.role, 'review_clinical_case') || userProfile?.role === 'clinician_reviewer';

  const loadRecommendationsOnce = async (request: PatientRequestTable, forceRefresh = false): Promise<AIRecommendationTable[]> => {
    const pending = recommendationGenerationsInFlight.current.get(request.request_id);
    if (pending) return pending;
    const load = (async () => {
      if (forceRefresh) return generateRecommendationsForRequest(request);
      const saved = await getRecommendationsForRequest(request.request_id);
      return saved.length > 0 ? saved : generateRecommendationsForRequest(request);
    })();
    recommendationGenerationsInFlight.current.set(request.request_id, load);
    try {
      return await load;
    } finally {
      if (recommendationGenerationsInFlight.current.get(request.request_id) === load) {
        recommendationGenerationsInFlight.current.delete(request.request_id);
      }
    }
  };

  const fetchData = async () => {
    const sequence = ++fetchSequence.current;
    setLoading(true);
    setError(null);
    setNetworkError(null);
    const [requestsResult, networkResult] = await Promise.allSettled([
      getPatientRequests(),
      getClinicalReviewNetwork()
    ]);
    if (sequence !== fetchSequence.current) return;

    let prototypeRequests: PatientRequestTable[] = [];
    let netData: ClinicalReviewNetwork | null = null;
    let requestToInspect: PatientRequestTable | null = null;
    if (requestsResult.status === 'fulfilled') {
      const allRequests = requestsResult.value;
      prototypeRequests = allRequests.filter((request) => request.data_origin === 'synthetic');
      setUnverifiedLegacyRequestCount(allRequests.length - prototypeRequests.length);
      setRequests(prototypeRequests);
      requestToInspect = prototypeRequests.find((request) => request.request_id === inspectedRequestId)
        || prototypeRequests.find((request) => request.status === 'Pending' || request.status === 'Recommended')
        || prototypeRequests[0]
        || null;
      if (requestToInspect && requestToInspect.request_id !== inspectedRequestId) {
        setInspectedRequestId(requestToInspect.request_id);
      }
    } else {
      setRequests([]);
      setUnverifiedLegacyRequestCount(0);
      setError(requestsResult.reason?.message || 'Failed to load synthetic requests from Supabase.');
    }

    if (networkResult.status === 'fulfilled') {
      netData = networkResult.value;
      setFacilityNetwork(netData);
    } else {
      setFacilityNetwork(null);
      setNetworkError(networkResult.reason?.message || 'Facility and inventory candidates are unavailable.');
    }

    const recMap: Record<string, AIRecommendationTable[]> = {};
    const recommendationErrors: Record<string, string> = {};
    if (requestToInspect) {
      try {
        const recs = await loadRecommendationsOnce(requestToInspect);
        if (recs.length > 0 || requestToInspect.status === 'Pending' || requestToInspect.status === 'Recommended') {
          recMap[requestToInspect.request_id] = recs;
        }
      } catch (err: any) {
        recommendationErrors[requestToInspect.request_id] = err?.message || 'Advisory suggestions are unavailable.';
      }
    }
    if (sequence !== fetchSequence.current) return;
    setRecommendationsMap(recMap);
    setRecommendationErrorsMap(recommendationErrors);

    const hospMap: Record<string, string> = {};
    const ambMap: Record<string, string> = {};
    const bbMap: Record<string, string> = {};
    if (netData) {
      const availableAmbulances = netData.ambulances.filter((ambulance) =>
        ambulance.status === 'Available' && getResourceFreshness(ambulance.updated_at ?? null, 'ambulance') === 'Fresh'
      );
      prototypeRequests.forEach((req) => {
        const compatibleHospitals = netData!.hospitals.filter((hospital) => isFacilityCompatibleWithRequest(hospital, req));
        const recommendedHospitalId = recMap[req.request_id]?.[0]?.hospital_id;
        const selectedHospital = compatibleHospitals.find((hospital) => hospital.hospital_id === recommendedHospitalId)
          || null;
        if (selectedHospital) hospMap[req.request_id] = selectedHospital.hospital_id;

        const requiredBloodUnits = req.requested_blood_units ?? 1;
        const compatibleBloodBanks = netData!.bloodBanks.filter((bank) => req.required_blood_group
          ? getResourceFreshness(bank.blood_updated_at?.[req.required_blood_group] ?? null, 'blood') === 'Fresh'
            && Number(bank.blood_stock[req.required_blood_group] || 0) - Number(bank.blood_thresholds[req.required_blood_group] || 0) >= requiredBloodUnits
          : Object.entries(bank.blood_stock).some(([group, units]) =>
              getResourceFreshness(bank.blood_updated_at?.[group] ?? null, 'blood') === 'Fresh'
              && Number(units) - Number(bank.blood_thresholds[group] || 0) >= requiredBloodUnits));
        const recommendedBloodBankId = recMap[req.request_id]?.[0]?.blood_bank_id;
        const selectedBloodBank = compatibleBloodBanks.find((bank) => bank.blood_bank_id === recommendedBloodBankId)
          || null;
        if (selectedBloodBank) bbMap[req.request_id] = selectedBloodBank.blood_bank_id;

        const recommendedAmbulanceId = recMap[req.request_id]?.[0]?.ambulance_id;
        const selectedAmbulance = availableAmbulances.find((ambulance) => ambulance.ambulance_id === recommendedAmbulanceId)
          || null;
        if (selectedAmbulance) ambMap[req.request_id] = selectedAmbulance.ambulance_id;
      });
    }
    setSelectedHospitalMap(hospMap);
    setSelectedAmbulanceMap(ambMap);
    setSelectedBloodBankMap(bbMap);
    setLoading(false);
  };

  fetchDataRef.current = fetchData;

  useEffect(() => {
    void fetchDataRef.current();

    const unsubscribe = subscribeToSupabaseRealtime(
      ['patient_requests', 'emergency_cases', 'ai_recommendations'],
      () => void fetchDataRef.current()
    );

    return () => {
      fetchSequence.current += 1;
      unsubscribe();
    };
  }, [userProfile?.user_id]);

  // Handle Clinician Approval Action
  const handleApproveCase = async (req: PatientRequestTable) => {
    setProcessingId(req.request_id);
    setActionError(null);
    try {
      if (!userProfile?.user_id) throw new Error('A signed-in clinician reviewer is required.');
      const urgency = selectedUrgencyMap[req.request_id];
      const hospitalId = selectedHospitalMap[req.request_id];
      const ambulanceId = selectedAmbulanceMap[req.request_id] || null;
      const bloodBankId = selectedBloodBankMap[req.request_id] || null;
      if (!urgency) throw new Error('Select the urgency you confirmed as the clinician reviewer.');
      if (!hospitalId) throw new Error('Select a destination hospital before approving this request.');
      if (req.needs_ambulance && !ambulanceId) throw new Error('Select an ambulance before approving this request.');
      if (req.needs_blood && !bloodBankId) throw new Error('Select a blood bank before approving this request.');
      const res = await approveAndAllocateEmergencyRequest({
        requestId: req.request_id,
        confirmedUrgency: urgency,
        selectedHospitalId: hospitalId,
        selectedAmbulanceId: req.needs_ambulance ? ambulanceId : null,
        selectedBloodBankId: req.needs_blood ? bloodBankId : null
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to confirm approval');
      }

      triggerToast(`Prototype review saved. No emergency dispatch occurred; blood units are not reserved by this workflow.`);
      await fetchData();
    } catch (err: any) {
      setActionError(err?.message || 'Could not record the prototype assignment. Refresh the candidate data and try again.');
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Clinician Rejection Action
  const handleRejectCase = async (req: PatientRequestTable) => {
    if (!window.confirm('Close this synthetic prototype scenario after human review?')) return;

    setProcessingId(req.request_id);
    try {
      await rejectEmergencyRequest(req.request_id, 'Invalid synthetic scenario');
      triggerToast('Synthetic scenario closed after human review.');
      await fetchData();
    } catch (err: any) {
      alert('Rejection error: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRefreshRecommendations = async (req: PatientRequestTable) => {
    if (req.status !== 'Pending' && req.status !== 'Recommended') return;
    setRefreshingRecommendationId(req.request_id);
    try {
      const recs = await loadRecommendationsOnce(req, true);
      setRecommendationsMap((current) => ({ ...current, [req.request_id]: recs }));
      setRecommendationErrorsMap((current) => {
        const next = { ...current };
        delete next[req.request_id];
        return next;
      });
      try {
        const network = await getClinicalReviewNetwork();
        setFacilityNetwork(network);
        setNetworkError(null);
      } catch (networkErr: any) {
        setNetworkError(networkErr?.message || 'Recommendation evidence refreshed, but the facility display could not be refreshed.');
      }
      triggerToast(recs.length
        ? 'Recommendation evidence refreshed from current Supabase inventory. Review the updated candidates before deciding.'
        : 'Recommendation check completed. No compatible facility matches the current inventory.');
    } catch (err: any) {
      setRecommendationErrorsMap((current) => ({
        ...current,
        [req.request_id]: err?.message || 'Could not refresh the advisory suggestions.'
      }));
    } finally {
      setRefreshingRecommendationId(null);
    }
  };

  const handleInspectRequest = async (req: PatientRequestTable) => {
    setInspectedRequestId(req.request_id);
    if (req.status !== 'Pending' && req.status !== 'Recommended') return;
    if (Object.prototype.hasOwnProperty.call(recommendationsMap, req.request_id)) return;
    setRefreshingRecommendationId(req.request_id);
    try {
      const recs = await loadRecommendationsOnce(req);
      setRecommendationsMap((current) => ({ ...current, [req.request_id]: recs }));
      setRecommendationErrorsMap((current) => {
        const next = { ...current };
        delete next[req.request_id];
        return next;
      });
    } catch (err: any) {
      setRecommendationErrorsMap((current) => ({
        ...current,
        [req.request_id]: err?.message || 'Advisory suggestions are unavailable.'
      }));
    } finally {
      setRefreshingRecommendationId((current) => current === req.request_id ? null : current);
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'Pending' || r.status === 'Recommended');
  const allocatedRequests = requests.filter(r => r.status === 'Assigned' || r.status === 'Completed');

  const inspectedRequest = requests.find(r => r.request_id === inspectedRequestId) || requests[0];
  const inspectedRecs = inspectedRequest ? recommendationsMap[inspectedRequest.request_id] || [] : [];
  const hospitalsForRequest = (req: PatientRequestTable) => (facilityNetwork?.hospitals || [])
    .filter((hospital) => isFacilityCompatibleWithRequest(hospital, req))
    .map((hospital) => ({
      ...hospital,
      distanceKm: calculateHaversineDistance(req.latitude, req.longitude, hospital.latitude, hospital.longitude)
    }))
    .sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY));
  const bloodBanksForRequest = (req: PatientRequestTable) => (facilityNetwork?.bloodBanks || [])
    .filter((bank) => req.required_blood_group
      ? getResourceFreshness(bank.blood_updated_at?.[req.required_blood_group] ?? null, 'blood') === 'Fresh'
        && Number(bank.blood_stock[req.required_blood_group] || 0) - Number(bank.blood_thresholds[req.required_blood_group] || 0) >= (req.requested_blood_units ?? 1)
      : Object.entries(bank.blood_stock).some(([group, units]) =>
          getResourceFreshness(bank.blood_updated_at?.[group] ?? null, 'blood') === 'Fresh'
          && Number(units) - Number(bank.blood_thresholds[group] || 0) >= (req.requested_blood_units ?? 1)))
    .map((bank) => ({
      ...bank,
      distanceKm: calculateHaversineDistance(req.latitude, req.longitude, bank.latitude, bank.longitude)
    }))
    .sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY));
  const availableAmbulances = (facilityNetwork?.ambulances || []).filter((ambulance) =>
    ambulance.status === 'Available' && getResourceFreshness(ambulance.updated_at ?? null, 'ambulance') === 'Fresh'
  );

  // Build Leaflet entities for the currently inspected request
  const mapEntities: MapEntity[] = [];
  if (facilityNetwork) {
    mapEntities.push(...facilityNetwork.mapEntities);
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
      {actionError && (
        <div role="alert" className="fixed top-20 right-6 z-50 max-w-xl bg-rose-950 border border-rose-700 text-rose-100 px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold">
          <div className="flex items-start justify-between gap-3">
            <span>{actionError}</span>
            <button type="button" aria-label="Dismiss error" onClick={() => setActionError(null)} className="text-rose-200 hover:text-white">×</button>
          </div>
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
              Authorized Reviewer: {userProfile?.full_name || 'Clinician Reviewer'}
            </span>
            <span className="bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-lg">
              Pending Synthetic Scenarios: <strong className="text-amber-400">{pendingRequests.length}</strong>
            </span>
            <span className="bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-lg">
              Reviewed Scenarios: <strong className="text-emerald-400">{allocatedRequests.length}</strong>
            </span>
          </div>
        </div>

        <button
          onClick={fetchData}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl cursor-pointer transition-all flex items-center gap-1.5 text-xs font-bold self-start sm:self-auto"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh Records</span>
        </button>
      </div>

      {isAuthorized && <IncidentPlanningPanel mode="reviewer" />}

      {unverifiedLegacyRequestCount > 0 && (
        <div className="rounded-xl border border-amber-700/70 bg-amber-950/50 p-3 text-xs text-amber-100">
          {unverifiedLegacyRequestCount} legacy request record(s) are hidden because their data origin is unknown. Review them in a controlled staging process before treating them as synthetic.
        </div>
      )}

      {networkError && (
        <div className="rounded-xl border border-amber-700/70 bg-amber-950/50 p-3 text-xs text-amber-100">
          Facility availability could not be loaded: {networkError} The synthetic review queue remains available, but assignments require a fresh facility snapshot.
        </div>
      )}

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
          <span>Reviewed Scenarios ({allocatedRequests.length})</span>
        </button>
      </div>

      {/* Main Workstation Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: List of Requests */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400">
            <span>{activeTab === 'pending' ? 'Pending Triage Queue' : 'Allocated Emergency History'}</span>
            <span className="font-mono">Supabase-visible prototype records</span>
          </div>

          {loading ? (
            <LoadingState message="Loading clinician triage queue..." />
          ) : error ? (
            <ErrorState message={error} onRetry={fetchData} />
          ) : (activeTab === 'pending' ? pendingRequests : allocatedRequests).length === 0 ? (
            <EmptyState
              icon={Stethoscope}
              title={activeTab === 'pending' ? 'No synthetic scenarios awaiting review.' : 'No reviewed scenarios yet.'}
              description={activeTab === 'pending' ? 'New synthetic scenarios saved by patient demo accounts will appear here.' : 'Human-reviewed prototype assignments will appear here.'}
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
                    onClick={() => handleInspectRequest(req)}
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

                    <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-[11px] text-slate-300">
                      <span className="font-bold text-slate-200">Requested quantities:</span>{' '}
                      {req.needed_by ? (
                        <>
                          ICU {req.requested_icu_beds ?? 'not recorded'}, general beds {req.requested_general_beds ?? 'not recorded'}, oxygen units {req.requested_oxygen_units ?? 'not recorded'}, blood units {req.requested_blood_units ?? 'not recorded'}, ambulances {req.requested_ambulances ?? 'not recorded'}
                          <span className="text-slate-500"> · </span>
                          <span className="font-bold text-slate-200">Needed by:</span> {new Date(req.needed_by).toLocaleString()}
                        </>
                      ) : (
                        <span className="text-slate-400">Not recorded for this request.</span>
                      )}
                      <p className="mt-1 text-[10px] text-slate-500">Synthetic aggregate planning details only; clinician review sets urgency.</p>
                      <p className="mt-1 text-[10px] text-amber-300">Bed quantities are matched and reserved above the hospital safety buffer. Oxygen and blood quantities are demand indicators; stock is not reserved. This workflow can assign one ambulance, so larger requested ambulance counts are not fulfilled here.</p>
                    </div>

                    <p className="text-[10px] text-slate-400">
                      Synthetic prototype record • An optional coarse fictional area may be stored; no real patient location or free-text details are collected.
                    </p>

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
                          {!selectedUrgencyMap[req.request_id] && <p className="text-[10px] text-amber-300">Self-reported urgency is shown above. Choose the clinician-confirmed level to continue.</p>}
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
                            2. Select Compatible Healthcare Facility
                          </label>
                          <select
                            value={selectedHospitalMap[req.request_id] || ''}
                            disabled={hospitalsForRequest(req).length === 0}
                            onChange={(e) => {
                              e.stopPropagation();
                              setSelectedHospitalMap(m => ({ ...m, [req.request_id]: e.target.value }));
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold"
                          >
                            <option value="">{hospitalsForRequest(req).length ? 'Select a compatible facility' : 'No compatible inventory recorded'}</option>
                            {hospitalsForRequest(req).map((h) => (
                              <option key={h.hospital_id} value={h.hospital_id}>
                                🏥 {h.hospital_name}{h.distanceKm == null ? ' · distance unavailable' : ` · ${h.distanceKm} km`}
                                {req.needs_icu ? ` · ${h.allocatable_icu_beds} ICU beds` : ''}
                                {req.needs_general_bed ? ` · ${h.allocatable_general_beds} general beds` : ''}
                                {req.needs_oxygen ? ` · ${h.available_oxygen_records} oxygen records` : ''}
                              </option>
                            ))}
                          </select>
                          {hospitalsForRequest(req).length > 0 && (
                            <p className="text-[10px] text-slate-400">Candidates are ordered by straight-line distance from the synthetic request point; if no distance is shown, that request or facility has no usable coordinates.</p>
                          )}
                          {hospitalsForRequest(req).length === 0 && (
                            <p className="text-[10px] text-amber-300">
                              {networkError
                                ? `Resource candidates could not be loaded: ${networkError}`
                                : 'No active hospital currently has enough recent inventory for every bed and oxygen need on this request. Refresh inventory or reduce the synthetic request quantity, then refresh this page.'}
                            </p>
                          )}
                        </div>

                        {req.needs_oxygen && <p className="text-[11px] text-slate-400">Positive oxygen inventory records are checked at review. No oxygen amount is assigned or reserved.</p>}

                        {req.needs_blood && <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-300">Blood bank candidate · units are not reserved</label>
                          <select value={selectedBloodBankMap[req.request_id] || ''} disabled={bloodBanksForRequest(req).length === 0} onChange={(e) => setSelectedBloodBankMap(m => ({ ...m, [req.request_id]: e.target.value }))} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold">
                            <option value="">{bloodBanksForRequest(req).length ? 'Select a bank with recorded stock' : `No recorded stock for ${req.required_blood_group || 'the requested group'}`}</option>
                            {bloodBanksForRequest(req).map(bank => <option key={bank.blood_bank_id} value={bank.blood_bank_id}>{bank.blood_bank_name}{bank.distanceKm == null ? ' · distance unavailable' : ` · ${bank.distanceKm} km`} · {req.required_blood_group ? `${bank.blood_stock[req.required_blood_group] || 0} recorded ${req.required_blood_group} units` : 'stock above threshold'}</option>)}
                          </select>
                          {bloodBanksForRequest(req).length === 0 && <p className="text-[10px] text-amber-300">No active bank has fresh stock for {req.requested_blood_units ?? 1} {req.required_blood_group || 'requested'} unit(s) above its protected threshold. Stock is not reserved by this review.</p>}
                        </div>}

                        {/* Ambulance Selector if requested */}
                        {req.needs_ambulance && (
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-300">
                              3. Select Ambulance Candidate · No Dispatch
                            </label>
                            <p className="text-[10px] text-amber-300">
                              This synthetic request has no scene coordinates, so the system cannot rank nearby vehicles. Choose a unit only for this prototype review; no route or dispatch is created.
                            </p>
                            <select
                              value={selectedAmbulanceMap[req.request_id] || ''}
                              disabled={availableAmbulances.length === 0}
                              onChange={(e) => {
                                e.stopPropagation();
                                setSelectedAmbulanceMap(m => ({ ...m, [req.request_id]: e.target.value }));
                              }}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold"
                            >
                              <option value="">{availableAmbulances.length ? 'Select an available unit' : 'No available ambulance recorded'}</option>
                              {availableAmbulances.map((a) => (
                                <option key={a.ambulance_id} value={a.ambulance_id}>
                                  🚑 Unit {a.vehicle_number} ({a.ambulance_type} • Status: {a.status})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex items-center gap-3 pt-2">
                          <button
                            type="button"
                            disabled={processingId === req.request_id || !selectedUrgencyMap[req.request_id] || !selectedHospitalMap[req.request_id] || (req.needs_ambulance && !selectedAmbulanceMap[req.request_id]) || (req.needs_blood && !selectedBloodBankMap[req.request_id])}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApproveCase(req);
                            }}
                            className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/30 transition-all active:scale-98"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>{processingId === req.request_id ? 'Saving...' : 'Record Prototype Assignment'}</span>
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
                  <span>Facility Network Map</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Facility pins only. An optional coarse fictional scenario area informs straight-line matching; no patient pin, responder route, or live tracking is shown.
                </p>
              </div>
              <span className="text-[10px] font-mono text-teal-400 bg-teal-950 px-2 py-0.5 rounded border border-teal-800 font-bold">
                OpenStreetMap Basemap
              </span>
            </div>

            {/* Interactive Leaflet Map Component */}
            {mapEntities.length > 0 ? (
              <LeafletEmergencyMap
                entities={mapEntities}
                center={[mapEntities[0].location.lat, mapEntities[0].location.lng]}
                zoom={10}
                height="380px"
              />
            ) : (
              <div className="h-[380px] rounded-xl border border-slate-800 bg-slate-950 flex items-center justify-center p-6 text-center text-xs text-slate-400">
                Facility coordinates are not available for the current review network, so the map is hidden.
              </div>
            )}

            {/* Rule-based candidate comparison */}
            {inspectedRequest && (
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5 text-blue-400">
                    <Sparkles className="w-4 h-4" /> Rule-based fit scores ({inspectedRecs.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-400">Heuristic only • not a probability or clinical score</span>
                    {(inspectedRequest.status === 'Pending' || inspectedRequest.status === 'Recommended') && (
                      <button
                        type="button"
                        onClick={() => handleRefreshRecommendations(inspectedRequest)}
                        disabled={refreshingRecommendationId === inspectedRequest.request_id}
                        className="inline-flex items-center gap-1 rounded-lg border border-blue-800 bg-blue-950/70 px-2 py-1 text-[10px] font-bold text-blue-200 hover:bg-blue-900 disabled:cursor-wait disabled:opacity-60"
                      >
                        <RefreshCw className={`h-3 w-3 ${refreshingRecommendationId === inspectedRequest.request_id ? 'animate-spin' : ''}`} />
                        {refreshingRecommendationId === inspectedRequest.request_id ? 'Refreshing…' : 'Refresh evidence'}
                      </button>
                    )}
                  </div>
                </div>

                {recommendationErrorsMap[inspectedRequest.request_id] && inspectedRecs.length > 0 && (
                  <p className="rounded-lg border border-amber-800 bg-amber-950/60 px-3 py-2 text-[11px] text-amber-200">
                    Refresh failed; the candidates below are the last saved snapshot from {new Date(inspectedRecs[0].created_at).toLocaleString()}. {recommendationErrorsMap[inspectedRequest.request_id]}
                  </p>
                )}

                {inspectedRecs.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">
                    {recommendationErrorsMap[inspectedRequest.request_id]
                      ? `Advisory fit scores are unavailable: ${recommendationErrorsMap[inspectedRequest.request_id]}`
                      : 'No facility matches calculated yet.'}
                  </p>
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
                                  SELECTED FOR REVIEW
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              {rec.recommendation_reason}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              Evidence snapshot: {new Date(rec.created_at).toLocaleString()}
                            </p>
                            <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400 pt-1">
                              <span>Distance: <strong className="text-slate-200">{rec.distance_km == null ? 'Unavailable' : `${rec.distance_km} km straight-line estimate`}</strong></span>
                              <span>ETA: <strong className="text-emerald-400">{rec.eta_minutes == null ? 'Not calculated' : `~${rec.eta_minutes} mins estimate`}</strong></span>
                              <span>ICU beds recorded: <strong className="text-slate-200">{hospital?.available_icu_beds ?? 'Unavailable'}</strong></span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono font-black text-xs block">
                              {rec.confidence_score}/100
                            </span>
                            <span className="text-[9px] text-slate-500 font-mono mt-1 block">Heuristic fit · not probability · #{idx + 1}</span>
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
