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
  Navigation
} from 'lucide-react';
import {
  createPatientEmergencyRequest,
  getPatientRequests
} from '../../services/patientRequestService';
import { getPublicResourceDirectory, PublicResourceDirectory } from '../../services/publicResourceService';
import { findBloodBanksForGroup, findHospitalsByDistance } from '../../services/resourceDiscoveryService';
import {
  PatientRequestTable,
  EmergencyType,
  BloodGroup,
  SeverityLevel
} from '../../types/database';
import { subscribeToSupabaseRealtime } from '../../services/supabaseDataLayer';
import { supabase } from '../../lib/supabase/client';
import { EmptyState, LoadingState, ErrorState } from '../common/EmptyState';
import { LeafletEmergencyMap, MapEntity } from '../common/LeafletEmergencyMap';
import { getResourceFreshness } from '../../services/resourceFreshness';
import { calculateHaversineDistance, isValidCoordinatePair } from '../../services/geoService';

export const PatientDashboard: React.FC = () => {
  const { userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unverifiedLegacyRequestCount, setUnverifiedLegacyRequestCount] = useState(0);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [requests, setRequests] = useState<PatientRequestTable[]>([]);
  const [emergencyCasesMap, setEmergencyCasesMap] = useState<Record<string, any>>({});
  const [facilityDirectory, setFacilityDirectory] = useState<PublicResourceDirectory | null>(null);
  const [directorySearchPoint, setDirectorySearchPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [useMapPointForScenario, setUseMapPointForScenario] = useState(false);

  // Form State strictly mapping `patient_requests`
  const [emergencyType, setEmergencyType] = useState<EmergencyType>('Cardiac Arrest');
  const [requiredBloodGroup, setRequiredBloodGroup] = useState<BloodGroup | ''>('O-');
  const [needsBlood, setNeedsBlood] = useState(true);
  const [needsIcu, setNeedsIcu] = useState(true);
  const [needsGeneralBed, setNeedsGeneralBed] = useState(false);
  const [needsOxygen, setNeedsOxygen] = useState(true);
  const [needsAmbulance, setNeedsAmbulance] = useState(true);
  const [severity, setSeverity] = useState<SeverityLevel>('Critical');
  const [syntheticScenarioConfirmed, setSyntheticScenarioConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Selected synthetic request for prototype review
  const [activeTrackingRequestId, setActiveTrackingRequestId] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    const [directoryResult, casesResult, requestsResult] = await Promise.allSettled([
      getPublicResourceDirectory(),
      supabase.from('emergency_cases').select('*'),
      userProfile?.user_id ? getPatientRequests(userProfile.user_id) : Promise.resolve([])
    ]);

    const errors: string[] = [];
    if (directoryResult.status === 'fulfilled') setFacilityDirectory(directoryResult.value);
    else errors.push(directoryResult.reason?.message || 'Could not load the public resource directory.');

    if (casesResult.status === 'fulfilled') {
      const casesRes = casesResult.value;
      if (casesRes.error) errors.push(`Failed to load reviewed case status: ${casesRes.error.message}`);
      else if (!casesRes.data) errors.push('Failed to load reviewed case status: Supabase returned no data.');
      else {
        const cMap: Record<string, any> = {};
        (casesRes.data as any[]).forEach(c => { cMap[c.request_id] = c; });
        setEmergencyCasesMap(cMap);
      }
    } else errors.push(casesResult.reason?.message || 'Failed to load reviewed case status.');

    if (requestsResult.status === 'fulfilled') {
      const allRequests = requestsResult.value;
      const reqs = allRequests.filter((request) => request.data_origin === 'synthetic');
      setUnverifiedLegacyRequestCount(allRequests.length - reqs.length);
      setRequests(reqs);
      if (reqs.length > 0 && !activeTrackingRequestId) setActiveTrackingRequestId(reqs[0].request_id);
      if (!userProfile?.user_id) setUnverifiedLegacyRequestCount(0);
    } else errors.push(requestsResult.reason?.message || 'Failed to load your emergency requests.');

    if (errors.length) {
      console.error('PatientDashboard partial load error:', errors);
      setError(errors.join(' '));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    // Patients can observe their own request and linked case status; recommendation rows are clinician-only.
    const unsubscribe = subscribeToSupabaseRealtime(
      ['patient_requests', 'emergency_cases'],
      () => fetchData()
    );
    return () => unsubscribe();
  }, [userProfile?.user_id]);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!syntheticScenarioConfirmed) {
      setError('Confirm that this is a fictional prototype scenario before saving it.');
      return;
    }

    if (!userProfile?.user_id) {
      alert('Authentication session error: user profile ID missing.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const newReq = await createPatientEmergencyRequest({
        emergency_type: emergencyType,
        required_blood_group: needsBlood ? (requiredBloodGroup || 'O-') as BloodGroup : null,
        needs_blood: needsBlood,
        needs_icu: needsIcu,
        needs_general_bed: needsGeneralBed,
        needs_oxygen: needsOxygen,
        needs_ambulance: needsAmbulance,
        severity,
        simulationLocation: useMapPointForScenario && directorySearchPoint
          ? {
              latitude: directorySearchPoint.lat,
              longitude: directorySearchPoint.lng
            }
          : null
      });

      setSyntheticScenarioConfirmed(false);
      setUseMapPointForScenario(false);
      await fetchData();
      setActiveTrackingRequestId(newReq.request_id);
      triggerToast('Synthetic scenario saved. No emergency service was contacted.');
    } catch (err: any) {
      setError('Failed to save synthetic prototype scenario: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const activeTrackingRequest = requests.find(r => r.request_id === activeTrackingRequestId) || requests[0];
  const activeCase = activeTrackingRequest ? emergencyCasesMap[activeTrackingRequest.request_id] : null;
  
  const assignedHospital = activeCase?.assigned_hospital_id
    ? facilityDirectory?.hospitals.find(h => h.id === activeCase.assigned_hospital_id)
    : null;

  const hasAmbulanceAssignment = Boolean(activeCase?.assigned_ambulance_id);

  const isApproved = activeTrackingRequest?.status === 'Assigned' || activeCase?.confirmation_status === 'confirmed';
  const isRejected = activeCase?.confirmation_status === 'rejected';

  // Show facility coordinates only; patient-selected points are coarse synthetic scenario areas.
  const trackingEntities: MapEntity[] = facilityDirectory ? [
    ...facilityDirectory.hospitals.filter((hospital) => isValidCoordinatePair(hospital.latitude, hospital.longitude)).map((hospital) => ({
      id: hospital.id,
      name: hospital.name,
      type: 'hospital' as const,
      location: { lat: hospital.latitude!, lng: hospital.longitude! },
      address: `${hospital.address}, ${hospital.district}`,
      phone: hospital.phone || undefined,
      details: {
        traumaLevel: hospital.trauma_center ? 'Trauma center' : 'Hospital',
        icuBeds: hospital.icu_beds,
        availableBeds: hospital.general_beds,
        distanceKm: directorySearchPoint ? calculateHaversineDistance(directorySearchPoint.lat, directorySearchPoint.lng, hospital.latitude, hospital.longitude) ?? undefined : undefined,
        oxygenStock: hospital.oxygen.map((item) => ({
          type: item.type || 'Oxygen', quantity: item.quantity, unit: item.unit || null,
          availability: item.availability_status || 'Unknown'
        })),
        resourceFreshness: [
          { resource: 'ICU beds', freshness: getResourceFreshness(hospital.icu_updated_at, 'icu'), updatedAt: hospital.icu_updated_at, availability: hospital.icu_status },
          { resource: 'General beds', freshness: getResourceFreshness(hospital.general_beds_updated_at, 'beds'), updatedAt: hospital.general_beds_updated_at, availability: hospital.general_beds_status },
          ...hospital.oxygen.map((item) => ({
            resource: `${item.type || 'Oxygen'}${item.unit ? ` (${item.unit})` : ''}`,
            freshness: getResourceFreshness(item.updated_at ?? null, 'oxygen'),
            updatedAt: item.updated_at ?? null,
            availability: item.availability_status
          }))
        ]
      }
    })),
    ...facilityDirectory.blood_banks.filter((bank) => isValidCoordinatePair(bank.latitude, bank.longitude)).map((bank) => ({
      id: bank.id,
      name: bank.name,
      type: 'blood_bank' as const,
      location: { lat: bank.latitude!, lng: bank.longitude! },
      address: `${bank.address}, ${bank.district}`,
      phone: bank.phone || undefined,
      details: {
        bloodStock: Object.fromEntries(bank.stock.map((item) => [item.blood_group, item.quantity])),
        distanceKm: directorySearchPoint ? calculateHaversineDistance(directorySearchPoint.lat, directorySearchPoint.lng, bank.latitude, bank.longitude) ?? undefined : undefined,
        requestedBloodGroup: requiredBloodGroup || null,
        requestedBloodQuantity: bank.stock.find((item) => item.blood_group === requiredBloodGroup)?.quantity ?? null,
        requestedBloodAvailability: bank.stock.find((item) => item.blood_group === requiredBloodGroup)?.availability_status ?? 'Unknown',
        requestedBloodFreshness: getResourceFreshness(bank.stock.find((item) => item.blood_group === requiredBloodGroup)?.updated_at ?? null, 'blood'),
        resourceFreshness: bank.stock.map((item) => ({
          resource: `${item.blood_group} blood`,
          freshness: getResourceFreshness(item.updated_at ?? null, 'blood'),
          updatedAt: item.updated_at ?? null,
          availability: item.availability_status
        }))
      }
    }))
  ] : [];

  const matchingBloodBanks = facilityDirectory
    ? findBloodBanksForGroup(facilityDirectory.blood_banks, requiredBloodGroup, directorySearchPoint)
    : [];
  const nearbyHospitals = facilityDirectory
    ? findHospitalsByDistance(facilityDirectory.hospitals, directorySearchPoint)
    : [];

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
              <h1 className="text-xl font-black text-white">Synthetic Scenario Portal</h1>
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
          <span>Refresh Records</span>
        </button>
      </div>

      <div className="rounded-xl border border-amber-700/70 bg-amber-950/50 p-4 text-xs text-amber-100">
        <strong>Prototype only.</strong> Do not use this page for a real emergency or enter real patient, health, contact, or location details. Scenarios are stored as synthetic Supabase records for workflow testing; this app does not contact responders or provide care.
      </div>
      {error && <ErrorState message={error} onRetry={() => { void fetchData(); }} />}
      {unverifiedLegacyRequestCount > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300">
          {unverifiedLegacyRequestCount} older record(s) are hidden because their data origin is unknown. They are not included in this synthetic workflow.
        </div>
      )}

      {/* Synthetic workflow state */}
      {activeTrackingRequest && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-blue-950/70 border border-blue-500/40 p-6 rounded-3xl space-y-6 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-black text-white">
                  Scenario Review: {activeTrackingRequest.emergency_type}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  isApproved
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-500'
                    : 'bg-amber-950 text-amber-300 border-amber-500'
                }`}>
                  {isApproved ? 'Clinician review recorded' : isRejected ? 'Closed after review' : 'Awaiting clinician review'}
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
                  <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">Recorded Facility Assignment</span>
                  <span className="text-xs font-black text-white">{assignedHospital.name}</span>
                  <span className="text-[11px] text-emerald-400 block font-mono">
                    Prototype assignment only • {assignedHospital.district}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Prototype review stages; no care delivery is represented. */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              {/* Step 1 */}
              <div className="bg-slate-950 p-3 rounded-2xl border border-emerald-500/60 space-y-1">
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                  ✓
                </div>
                <span className="font-bold text-white block">1. Scenario Saved</span>
                <p className="text-[10px] text-emerald-300">Synthetic record in Supabase</p>
              </div>

              {/* Step 2 */}
              <div className={`p-3 rounded-2xl border space-y-1 ${
                isApproved || isRejected
                  ? 'bg-slate-950 border-emerald-500/60'
                  : 'bg-amber-950/60 border-amber-500'
              }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                  isApproved || isRejected ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-slate-950'
                }`}>
                  {isApproved || isRejected ? '✓' : '2'}
                </div>
                <span className="font-bold text-white block">2. Human Review</span>
                <p className="text-[10px] text-slate-300">
                  {isApproved ? 'Urgency review recorded' : isRejected ? 'Request closed after review' : 'Awaiting an authorized reviewer'}
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
                <span className="font-bold text-white block">3. Facility Selection</span>
                <p className="text-[10px] text-slate-300">
                  {isApproved ? assignedHospital?.name || 'Assignment recorded' : 'No assignment recorded'}
                </p>
              </div>

              {/* Step 4 */}
              <div className={`p-3 rounded-2xl border space-y-1 ${
                isApproved && hasAmbulanceAssignment
                  ? 'bg-emerald-950/50 border-emerald-500'
                  : 'bg-slate-950/60 border-slate-800 text-slate-500'
              }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                  isApproved ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-500'
                }`}>
                  {isApproved && hasAmbulanceAssignment ? '✓' : '4'}
                </div>
                <span className="font-bold text-white block">4. Resource Record</span>
                <p className="text-[10px] text-slate-300">
                  {isApproved && hasAmbulanceAssignment ? 'Ambulance assignment recorded; not dispatched' : 'No dispatch or live resource action'}
                </p>
              </div>

              {/* Step 5 */}
              <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 text-slate-500 space-y-1">
                <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-500 flex items-center justify-center font-bold text-xs">
                  5
                </div>
                <span className="font-bold text-slate-300 block">5. Care Outcome</span>
                <p className="text-[10px]">Not tracked by prototype</p>
              </div>
            </div>
          </div>

        </div>
      )}

      <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-black text-white">
              <Navigation className="h-4 w-4 text-blue-400" /> Blood Bank & Facility Directory
            </h2>
            <p className="mt-1 text-xs text-slate-400">Select a blood group in the scenario form, then click a fictional map point to sort matching banks by straight-line distance. By default the point stays on this page. You can separately opt in to attach it to a synthetic scenario, rounded to about 1 km; no device location is used. The basemap provider receives tile requests for the area displayed.</p>
          </div>
          {facilityDirectory && (
            <span className="text-xs font-bold text-rose-200">Selected group: {requiredBloodGroup || 'none'}</span>
          )}
        </div>
        {facilityDirectory && trackingEntities.length > 0 ? (
          <LeafletEmergencyMap
            entities={trackingEntities}
            center={assignedHospital?.latitude != null && assignedHospital.longitude != null
              ? [assignedHospital.latitude, assignedHospital.longitude]
              : trackingEntities[0]?.location
                ? [trackingEntities[0].location.lat, trackingEntities[0].location.lng]
                : [0, 0]}
            zoom={assignedHospital?.latitude != null && assignedHospital.longitude != null ? 12 : trackingEntities.length > 0 ? 9 : 2}
            height="340px"
            selectableLocation
            locationSelectionHint="Click a fictional point to compare distances"
            selectedLocation={directorySearchPoint}
            onLocationSelect={(location) => {
              setDirectorySearchPoint({ lat: location.lat, lng: location.lng });
              setUseMapPointForScenario(false);
            }}
            showGpsControl={false}
          />
        ) : loading ? (
          <LoadingState message="Loading the public facility directory…" />
        ) : facilityDirectory ? (
          <div className="rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-400">The directory loaded, but none of its facilities has valid map coordinates to display yet.</div>
        ) : (
          <div className="rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-400">Facility directory data is unavailable. Refresh the directory before relying on these records.</div>
        )}
        {directorySearchPoint && (
          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-xs font-bold text-white">Banks with recorded {requiredBloodGroup || 'selected'} inventory</h3>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-400">Straight-line distance from fictional map point • not a route or availability guarantee</span>
              <button type="button" onClick={() => { setDirectorySearchPoint(null); setUseMapPointForScenario(false); }} className="text-[10px] font-bold text-blue-300 hover:text-white">Clear point</button>
              </div>
            </div>
            {matchingBloodBanks.length ? (
              <ul className="divide-y divide-slate-800">
                {matchingBloodBanks.map(({ bank, inventory, distanceKm, freshness }) => (
                  <li key={bank.id} className="flex flex-col gap-1 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-semibold text-slate-200">{bank.name} <span className="font-normal text-slate-400">• {bank.district}</span></span>
                    <span className="text-slate-300">{distanceKm == null ? 'Distance unavailable' : `${distanceKm} km straight-line`} • {inventory.quantity == null ? 'count unknown' : `${inventory.quantity} reported units`} • {inventory.availability_status || 'Unknown'} • {freshness}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No directory record exists for group {requiredBloodGroup || 'selected'}.</p>
            )}
            <div className="space-y-2 border-t border-slate-800 pt-3">
              <h3 className="text-xs font-bold text-white">Hospital resources by distance</h3>
              {nearbyHospitals.length ? (
                <ul className="divide-y divide-slate-800">
                  {nearbyHospitals.map(({ hospital, distanceKm, icuFreshness, generalBedsFreshness }) => (
                    <li key={hospital.id} className="py-2 text-xs">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span className="font-semibold text-slate-200">{hospital.name} <span className="font-normal text-slate-400">• {hospital.district}</span></span>
                        <span className="text-slate-300">{distanceKm == null ? 'Distance unavailable' : `${distanceKm} km straight-line`}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        ICU: {hospital.icu_beds == null ? 'not recorded' : hospital.icu_beds} • {hospital.icu_status} • {icuFreshness}
                        {' · '}General beds: {hospital.general_beds == null ? 'not recorded' : hospital.general_beds} • {hospital.general_beds_status} • {generalBedsFreshness}
                        {hospital.oxygen.length > 0 && <>{' · '}Oxygen: {hospital.oxygen.map((item) => `${item.type || 'Oxygen'} ${item.quantity == null ? 'unknown' : item.quantity} ${item.unit || ''} (${item.availability_status || 'Unknown'} • ${getResourceFreshness(item.updated_at ?? null, 'oxygen')})`).join('; ')}</>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400">No hospitals with valid map coordinates are in the directory.</p>
              )}
            </div>
          </div>
        )}
        <p className="text-[11px] text-amber-300">Reported inventory is informational only. It is not reserved; qualified staff must verify availability and clinical suitability. This prototype does not provide care or contact emergency services.</p>
      </section>

      {/* Bottom Grid: Create Request Form + Request History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Create synthetic scenario form */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-6">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-rose-500" />
              <span>Create Synthetic Scenario</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Uses fictional scenario fields only and saves a synthetic row for the human-review workflow.
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

            <div className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-300">
              This workflow never uses device GPS or stores a real patient location. A fictional map point is saved with a request only if you opt in below, and is rounded to about 1 km.
            </div>

            {directorySearchPoint && (
              <label className="flex items-start gap-2 rounded-xl border border-sky-800/80 bg-sky-950/40 p-3 text-xs text-sky-100">
                <input
                  type="checkbox"
                  checked={useMapPointForScenario}
                  onChange={(e) => setUseMapPointForScenario(e.target.checked)}
                  className="mt-0.5 accent-sky-500"
                />
                <span>Use this fictional map point as the coarse simulation area for nearby hospital, blood-bank, and ambulance suggestions. The rounded point will be stored on this synthetic request; it is not a real emergency location.</span>
              </label>
            )}

            <label className="flex items-start gap-2 rounded-xl border border-amber-700/70 bg-amber-950/40 p-3 text-xs text-amber-100">
              <input
                type="checkbox"
                checked={syntheticScenarioConfirmed}
                onChange={(e) => setSyntheticScenarioConfirmed(e.target.checked)}
                className="mt-0.5 accent-amber-500"
                required
              />
              <span>I confirm this is a fictional prototype scenario, not a real person or emergency. I understand no care, dispatch, or resource delivery will occur.</span>
            </label>

            <button
              type="submit"
              disabled={submitting || !syntheticScenarioConfirmed}
              className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black tracking-wider uppercase cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? 'Saving synthetic scenario...' : 'Save Synthetic Scenario'}</span>
            </button>
          </form>
        </div>

        {/* Existing Requests & AI Recommendations History */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-white">Scenario History</h2>
              <p className="text-xs text-slate-400 mt-0.5">Select a record to review its prototype workflow state</p>
            </div>
            <span className="text-xs font-mono font-bold text-slate-400">{requests.length} Records</span>
          </div>

          {loading ? (
            <LoadingState message="Loading your emergency records..." />
          ) : requests.length === 0 ? (
            <EmptyState
              icon={HeartPulse}
              title="No requests logged yet."
              description="Create a fictional scenario to inspect the Supabase human-review workflow."
            />
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {requests.map((req) => {
                const isSelected = activeTrackingRequestId === req.request_id;
                const eCase = emergencyCasesMap[req.request_id];
                const isConfirmed = req.status === 'Assigned' || eCase?.confirmation_status === 'confirmed';
                const isRejected = eCase?.confirmation_status === 'rejected';

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
                        {isConfirmed ? 'Review recorded' : isRejected ? 'Closed after review' : 'Awaiting clinician review'}
                      </span>
                    </div>

                    <p className="text-slate-400 text-[11px] line-clamp-1">
                      {req.latitude != null && req.longitude != null
                        ? 'Synthetic scenario • coarse fictional area stored; no real location or free text'
                        : 'Synthetic scenario • no location or free-text stored'}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1">
                      <span>{new Date(req.created_at).toLocaleString()}</span>
                      <span className="text-slate-500">Clinician review suggestions are private</span>
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
