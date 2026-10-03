import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Truck,
  Plus,
  Edit3,
  MapPin,
  Phone,
  User,
  Building2,
  Save
} from 'lucide-react';
import {
  getAmbulanceProviders,
  getAmbulances,
  createAmbulance,
  updateAmbulance
} from '../../services/ambulanceService';
import { getHospitals } from '../../services/hospitalService';
import {
  AmbulanceProviderTable,
  AmbulanceTable,
  AmbulanceStatus,
  AmbulanceType,
  HospitalTable
} from '../../types/database';
import { subscribeToSupabaseRealtime } from '../../services/supabaseDataLayer';
import { EmptyState, LoadingState, ErrorState } from '../common/EmptyState';

const AMBULANCE_TYPES: AmbulanceType[] = ['BLS', 'ALS', 'ICU'];
const AMBULANCE_STATUSES: AmbulanceStatus[] = ['Available', 'Assigned', 'Maintenance', 'Offline'];

export const AmbulanceDashboard: React.FC = () => {
  const { userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const providerId = userProfile?.ambulance_provider_id;

  const [provider, setProvider] = useState<AmbulanceProviderTable | null>(null);
  const [ambulances, setAmbulances] = useState<AmbulanceTable[]>([]);
  const [hospitals, setHospitals] = useState<HospitalTable[]>([]);

  // Registration Form State
  const [regVehicleNum, setRegVehicleNum] = useState('');
  const [regType, setRegType] = useState<AmbulanceType>('BLS');
  const [regDriverName, setRegDriverName] = useState('');
  const [regDriverPhone, setRegDriverPhone] = useState('');
  const [regLat, setRegLat] = useState<string>('28.6139');
  const [regLng, setRegLng] = useState<string>('77.2090');
  const [regStatus, setRegStatus] = useState<AmbulanceStatus>('Available');
  const [registering, setRegistering] = useState(false);

  // Selected Ambulance for Editing / Managing
  const [selectedAmbulance, setSelectedAmbulance] = useState<AmbulanceTable | null>(null);
  const [editDriverName, setEditDriverName] = useState('');
  const [editDriverPhone, setEditDriverPhone] = useState('');
  const [editStatus, setEditStatus] = useState<AmbulanceStatus>('Available');
  const [editType, setEditType] = useState<AmbulanceType>('BLS');
  const [editLat, setEditLat] = useState<string>('');
  const [editLng, setEditLng] = useState<string>('');
  const [editAssignedHospital, setEditAssignedHospital] = useState<string>('');
  const [updating, setUpdating] = useState(false);

  const triggerToast = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const populateEditForm = (amb: AmbulanceTable) => {
    setSelectedAmbulance(amb);
    setEditDriverName(amb.driver_name || '');
    setEditDriverPhone(amb.driver_phone || '');
    setEditStatus(amb.status);
    setEditType(amb.ambulance_type);
    setEditLat(amb.current_latitude !== null && amb.current_latitude !== undefined ? String(amb.current_latitude) : '');
    setEditLng(amb.current_longitude !== null && amb.current_longitude !== undefined ? String(amb.current_longitude) : '');
    setEditAssignedHospital(amb.assigned_hospital || '');
  };

  const fetchData = async () => {
    if (!providerId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [providers, ambList, hospList] = await Promise.all([
        getAmbulanceProviders(),
        getAmbulances(providerId),
        getHospitals()
      ]);

      const p = providers.find((pr) => pr.provider_id === providerId) || null;
      setProvider(p);
      setAmbulances(ambList);
      setHospitals(hospList);

      if (ambList.length > 0) {
        const found = selectedAmbulance
          ? ambList.find((a) => a.ambulance_id === selectedAmbulance.ambulance_id) || ambList[0]
          : ambList[0];
        populateEditForm(found);
      } else {
        setSelectedAmbulance(null);
      }
    } catch (err: any) {
      console.error('AmbulanceDashboard load error:', err);
      setError(err.message || 'Failed to fetch ambulance provider data from Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const unsubscribe = subscribeToSupabaseRealtime(
      ['ambulance_providers', 'ambulances', 'hospitals', 'notifications'],
      () => fetchData()
    );
    return () => unsubscribe();
  }, [providerId]);

  if (!providerId) {
    return (
      <div className="bg-slate-900 border border-amber-800/80 rounded-2xl p-8 text-center space-y-4 max-w-2xl mx-auto my-12">
        <div className="w-12 h-12 bg-amber-950/80 border border-amber-700 text-amber-400 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-white">Ambulance Provider Account Not Linked</h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          Your account (<strong>{userProfile?.email}</strong>) is assigned the <code className="text-amber-400 font-mono">ambulance_admin</code> role, but is not linked to any specific ambulance provider in <code className="text-amber-400 font-mono">public.users.ambulance_provider_id</code>.
        </p>
        <p className="text-xs text-slate-400">
          Please contact an administrator or register an account with a linked ambulance provider.
        </p>
      </div>
    );
  }

  // Register Ambulance Handler
  const handleRegisterAmbulance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerId) return;

    const trimmedVeh = regVehicleNum.trim().toUpperCase();
    const trimmedDriver = regDriverName.trim();

    if (!trimmedVeh) {
      alert('Vehicle number is required.');
      return;
    }
    if (!trimmedDriver) {
      alert('Driver name is required.');
      return;
    }

    // Client-side duplicate check
    const existingVeh = ambulances.find((a) => a.vehicle_number.toUpperCase() === trimmedVeh);
    if (existingVeh) {
      alert(`An ambulance with vehicle number "${trimmedVeh}" is already registered in your fleet.`);
      return;
    }

    let parsedLat: number | null = null;
    let parsedLng: number | null = null;

    if (regLat !== '') {
      parsedLat = parseFloat(regLat);
      if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
        alert('Latitude must be a valid number between -90 and 90.');
        return;
      }
    }

    if (regLng !== '') {
      parsedLng = parseFloat(regLng);
      if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
        alert('Longitude must be a valid number between -180 and 180.');
        return;
      }
    }

    setRegistering(true);
    try {
      const created = await createAmbulance({
        provider_id: providerId,
        vehicle_number: trimmedVeh,
        ambulance_type: regType,
        driver_name: trimmedDriver,
        driver_phone: regDriverPhone.trim() || null,
        current_latitude: parsedLat,
        current_longitude: parsedLng,
        status: regStatus
      });

      if (!created || !created.ambulance_id) {
        throw new Error('Supabase did not return the registered ambulance record.');
      }

      triggerToast(`Successfully registered Ambulance ${created.vehicle_number}!`);
      setRegVehicleNum('');
      setRegDriverName('');
      setRegDriverPhone('');
      await fetchData();
    } catch (err: any) {
      console.error('Register Ambulance Error:', err);
      alert('Failed to register ambulance: ' + (err.message || 'Database error'));
    } finally {
      setRegistering(false);
    }
  };

  // Update Ambulance Handler
  const handleUpdateAmbulance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAmbulance) return;

    const trimmedDriver = editDriverName.trim();
    if (!trimmedDriver) {
      alert('Driver name is required.');
      return;
    }

    let parsedLat: number | null = null;
    let parsedLng: number | null = null;

    if (editLat !== '') {
      parsedLat = parseFloat(editLat);
      if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
        alert('Latitude must be a valid number between -90 and 90.');
        return;
      }
    }

    if (editLng !== '') {
      parsedLng = parseFloat(editLng);
      if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
        alert('Longitude must be a valid number between -180 and 180.');
        return;
      }
    }

    setUpdating(true);
    try {
      const updated = await updateAmbulance(selectedAmbulance.ambulance_id, {
        driver_name: trimmedDriver,
        driver_phone: editDriverPhone.trim() || null,
        status: editStatus,
        ambulance_type: editType,
        current_latitude: parsedLat,
        current_longitude: parsedLng,
        assigned_hospital: editAssignedHospital || null
      });

      if (!updated || !updated.ambulance_id) {
        throw new Error('Supabase did not return the updated ambulance record.');
      }

      triggerToast(`Ambulance ${updated.vehicle_number} updated successfully!`);
      await fetchData();
    } catch (err: any) {
      console.error('Update Ambulance Error:', err);
      alert('Failed to update ambulance: ' + (err.message || 'Database error'));
    } finally {
      setUpdating(false);
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
          <div className="flex items-center gap-2">
            <Truck className="w-6 h-6 text-amber-500" />
            <h1 className="text-xl font-black text-white">{provider?.provider_name || 'Ambulance Provider Facility'}</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Code: <span className="font-mono text-white">{provider?.provider_code || 'N/A'}</span> | District: {provider?.district || 'Central'}, {provider?.state || 'State'} | Phone: {provider?.phone || 'N/A'}
          </p>
        </div>

        <button
          onClick={fetchData}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl cursor-pointer transition-all flex items-center gap-1.5 text-xs font-bold"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Sync Fleet Data</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Fleet Units</span>
          <p className="text-2xl font-black text-white font-mono">{ambulances.length}</p>
        </div>
        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Available Units</span>
          <p className="text-2xl font-black text-emerald-400 font-mono">
            {ambulances.filter((a) => a.status === 'Available').length}
          </p>
        </div>
        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assigned / En Route</span>
          <p className="text-2xl font-black text-amber-400 font-mono">
            {ambulances.filter((a) => a.status === 'Assigned').length}
          </p>
        </div>
        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Maintenance / Offline</span>
          <p className="text-2xl font-black text-slate-400 font-mono">
            {ambulances.filter((a) => a.status === 'Maintenance' || a.status === 'Offline').length}
          </p>
        </div>
      </div>

      {/* Main Layout: Register Form, Fleet List, Edit Control */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Register New Ambulance Form Panel */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-5">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-amber-500" />
              <span>Register Ambulance Unit</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Add a new ambulance vehicle to your fleet in Supabase.
            </p>
          </div>

          <form onSubmit={handleRegisterAmbulance} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Vehicle Number *</label>
              <input
                type="text"
                required
                placeholder="e.g. DL-01-AB-1234"
                value={regVehicleNum}
                onChange={(e) => setRegVehicleNum(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono uppercase font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Ambulance Type</label>
                <select
                  value={regType}
                  onChange={(e) => setRegType(e.target.value as AmbulanceType)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold"
                >
                  {AMBULANCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Initial Status</label>
                <select
                  value={regStatus}
                  onChange={(e) => setRegStatus(e.target.value as AmbulanceStatus)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold"
                >
                  {AMBULANCE_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Driver Name *</label>
              <input
                type="text"
                required
                placeholder="Full name of driver"
                value={regDriverName}
                onChange={(e) => setRegDriverName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Driver Phone (Optional)</label>
              <input
                type="tel"
                placeholder="+91 9876543210"
                value={regDriverPhone}
                onChange={(e) => setRegDriverPhone(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Latitude</label>
                <input
                  type="number"
                  step="any"
                  placeholder="28.6139"
                  value={regLat}
                  onChange={(e) => setRegLat(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Longitude</label>
                <input
                  type="number"
                  step="any"
                  placeholder="77.2090"
                  value={regLng}
                  onChange={(e) => setRegLng(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={registering}
              className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-lg shadow-amber-600/30 transition-all flex items-center justify-center gap-2"
            >
              <Truck className="w-4 h-4" />
              <span>{registering ? 'Registering to Supabase...' : 'Register Ambulance'}</span>
            </button>
          </form>
        </div>

        {/* Fleet List Panel */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-base font-black text-white flex items-center gap-2">
                  <Radio className="w-5 h-5 text-amber-500" />
                  <span>Ambulance Fleet List</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  List of registered ambulance units for your provider account.
                </p>
              </div>

              <span className="text-xs font-mono font-bold px-3 py-1 bg-slate-950 border border-slate-800 text-slate-300 rounded-lg">
                {ambulances.length} Registered
              </span>
            </div>

            {loading ? (
              <LoadingState message="Loading fleet units from Supabase..." />
            ) : error ? (
              <ErrorState message={error} onRetry={fetchData} />
            ) : ambulances.length === 0 ? (
              <EmptyState
                icon={Truck}
                title="No active ambulances."
                description="Use the form on the left to register your first ambulance unit."
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ambulances.map((amb) => {
                  const isSelected = selectedAmbulance?.ambulance_id === amb.ambulance_id;
                  const assignedHospObj = amb.assigned_hospital
                    ? hospitals.find((h) => h.hospital_id === amb.assigned_hospital)
                    : null;

                  return (
                    <div
                      key={amb.ambulance_id}
                      onClick={() => populateEditForm(amb)}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all space-y-3 ${
                        isSelected
                          ? 'bg-amber-950/60 border-amber-500 ring-2 ring-amber-500/30'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-white text-base font-mono bg-slate-900 border border-slate-800 px-2.5 py-0.5 rounded-lg">
                            {amb.vehicle_number}
                          </span>
                          <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] font-extrabold font-mono border border-slate-700">
                            {amb.ambulance_type}
                          </span>
                        </div>

                        <span
                          className={`px-2.5 py-1 rounded font-extrabold text-[10px] ${
                            amb.status === 'Available'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : amb.status === 'Assigned'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {amb.status}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs text-slate-300 font-sans">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span>
                            Driver: <strong className="text-white">{amb.driver_name}</strong>
                          </span>
                        </div>

                        {amb.driver_phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono text-slate-400">{amb.driver_phone}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>
                            {amb.current_latitude !== null && amb.current_longitude !== null
                              ? `(${amb.current_latitude}, ${amb.current_longitude})`
                              : 'Location not set'}
                          </span>
                        </div>

                        {amb.assigned_hospital && (
                          <div className="flex items-center gap-1.5 text-[11px] text-amber-400 font-bold bg-amber-950/40 p-1.5 rounded-lg border border-amber-900/50 mt-1">
                            <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>
                              Assigned: {assignedHospObj ? assignedHospObj.hospital_name : amb.assigned_hospital}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Unit Control & Edit Details Panel */}
          {selectedAmbulance && (
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-5">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <Edit3 className="w-5 h-5 text-amber-500" />
                    <span>Manage Unit Details &amp; Status</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Editing Vehicle: <strong className="text-amber-400 font-mono text-sm">{selectedAmbulance.vehicle_number}</strong>
                  </p>
                </div>
              </div>

              <form onSubmit={handleUpdateAmbulance} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Status</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as AmbulanceStatus)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold"
                    >
                      {AMBULANCE_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Type</label>
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as AmbulanceType)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold"
                    >
                      {AMBULANCE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Driver Name *</label>
                    <input
                      type="text"
                      required
                      value={editDriverName}
                      onChange={(e) => setEditDriverName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Driver Phone</label>
                    <input
                      type="tel"
                      value={editDriverPhone}
                      onChange={(e) => setEditDriverPhone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Current Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={editLat}
                      onChange={(e) => setEditLat(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Current Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={editLng}
                      onChange={(e) => setEditLng(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">Assigned Hospital</label>
                  <select
                    value={editAssignedHospital}
                    onChange={(e) => setEditAssignedHospital(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                  >
                    <option value="">None (Unassigned)</option>
                    {hospitals.map((h) => (
                      <option key={h.hospital_id} value={h.hospital_id}>
                        {h.hospital_name} ({h.hospital_code}) - {h.district}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="submit"
                    disabled={updating}
                    className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-lg shadow-amber-600/30 transition-all flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>{updating ? 'Saving Changes...' : 'Save Unit Updates'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

