import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Building2,
  Boxes,
  Wind,
  Pill,
  RefreshCw,
  CheckCircle2,
  Plus,
  AlertTriangle,
  Edit2,
  Save,
  ShieldCheck,
  X
} from 'lucide-react';
import {
  getHospitalById,
  getICUInventory,
  updateICUInventory,
  getGeneralBedInventory,
  saveGeneralBedInventory,
  getOxygenInventory,
  addOxygenInventoryItem,
  updateOxygenInventoryItem,
  getMedicineInventory,
  addMedicineItem
} from '../../services/hospitalService';
import {
  HospitalTable,
  ICUInventoryTable,
  GeneralBedInventoryTable,
  OxygenInventoryTable,
  MedicineInventoryTable,
  MedicineCategory,
  OxygenType
} from '../../types/database';
import { subscribeToSupabaseRealtime } from '../../services/supabaseDataLayer';
import { LoadingState, ErrorState } from '../common/EmptyState';
import { ResourceTransferManager } from '../ResourceTransferManager';
import { OperationalPredictionManager } from '../OperationalPredictionManager';

export const HospitalDashboard: React.FC = () => {
  const { userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const hospitalId = userProfile?.hospital_id;

  const [hospital, setHospital] = useState<HospitalTable | null>(null);
  const [icuInv, setIcuInv] = useState<ICUInventoryTable | null>(null);
  const [genInv, setGenInv] = useState<GeneralBedInventoryTable | null>(null);
  const [oxygenList, setOxygenList] = useState<OxygenInventoryTable[]>([]);
  const [medicines, setMedicines] = useState<MedicineInventoryTable[]>([]);

  // ICU Bed Form State
  const [icuAvailInput, setIcuAvailInput] = useState(0);
  const [icuTotalInput, setIcuTotalInput] = useState(0);
  const [savingIcu, setSavingIcu] = useState(false);

  // General Bed Form State
  const [genTotalInput, setGenTotalInput] = useState(0);
  const [genOccupiedInput, setGenOccupiedInput] = useState(0);
  const [genReservedInput, setGenReservedInput] = useState(0);
  const [savingGen, setSavingGen] = useState(false);

  // Add Oxygen Form State
  const [oxyType, setOxyType] = useState<OxygenType>('Cylinder');
  const [oxyTotal, setOxyTotal] = useState(0);
  const [oxyAvail, setOxyAvail] = useState(0);
  const [oxyMinThreshold, setOxyMinThreshold] = useState(0);
  const [oxyUnit, setOxyUnit] = useState('Cylinders');
  const [addingOxy, setAddingOxy] = useState(false);

  // Edit Oxygen Item State
  const [editingOxyId, setEditingOxyId] = useState<string | null>(null);
  const [editOxyType, setEditOxyType] = useState<OxygenType>('Cylinder');
  const [editOxyTotal, setEditOxyTotal] = useState(0);
  const [editOxyAvail, setEditOxyAvail] = useState(0);
  const [editOxyMin, setEditOxyMin] = useState(0);
  const [editOxyUnit, setEditOxyUnit] = useState('Cylinders');
  const [savingEditOxy, setSavingEditOxy] = useState(false);

  // Add Medicine Form State
  const [medName, setMedName] = useState('');
  const [medCategory, setMedCategory] = useState<MedicineCategory>('Emergency');
  const [medDosage, setMedDosage] = useState('1mg IV');
  const [medStock, setMedStock] = useState(100);
  const [medMinStock, setMedMinStock] = useState(20);
  const [medUnit, setMedUnit] = useState('Vials');
  const [addingMed, setAddingMed] = useState(false);

  const triggerToast = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const fetchData = async () => {
    if (!hospitalId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [hosp, icu, gen, oxy, med] = await Promise.all([
        getHospitalById(hospitalId),
        getICUInventory(hospitalId),
        getGeneralBedInventory(hospitalId),
        getOxygenInventory(hospitalId),
        getMedicineInventory(hospitalId)
      ]);

      setHospital(hosp);
      setIcuInv(icu);
      if (icu) {
        setIcuAvailInput(icu.available_icu_beds);
        setIcuTotalInput(icu.total_icu_beds);
      }

      setGenInv(gen);
      if (gen) {
        setGenTotalInput(gen.total_beds ?? 0);
        setGenOccupiedInput(gen.occupied_beds ?? 0);
        setGenReservedInput(gen.reserved_beds ?? 0);
      }

      setOxygenList(oxy);
      setMedicines(med);
    } catch (err: any) {
      console.error('HospitalDashboard load error:', err);
      setError('Failed to fetch hospital inventory from Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const unsubscribe = subscribeToSupabaseRealtime(
      ['hospitals', 'icu_inventory', 'general_bed_inventory', 'oxygen_inventory', 'medicine_inventory'],
      () => fetchData()
    );

    return () => unsubscribe();
  }, [hospitalId]);

  if (!hospitalId) {
    return (
      <div className="bg-slate-900 border border-amber-800/80 rounded-2xl p-8 text-center space-y-4 max-w-2xl mx-auto my-12">
        <div className="w-12 h-12 bg-amber-950/80 border border-amber-700 text-amber-400 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-white">Hospital Account Not Linked</h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          Your account (<strong>{userProfile?.email}</strong>) is assigned the <code className="text-blue-400 font-mono">hospital_admin</code> role, but is not linked to any specific hospital facility in <code className="text-amber-400 font-mono">public.users.hospital_id</code>.
        </p>
        <p className="text-xs text-slate-400">
          Please contact an administrator or register a new account selecting an associated hospital facility.
        </p>
      </div>
    );
  }

  const handleSaveIcu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospitalId) return;
    setSavingIcu(true);
    try {
      await updateICUInventory(hospitalId, icuAvailInput, icuTotalInput);
      triggerToast('ICU bed inventory updated in Supabase!');
      await fetchData();
    } catch (err: any) {
      alert('Failed to save ICU inventory: ' + err.message);
    } finally {
      setSavingIcu(false);
    }
  };

  const handleSaveGen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospitalId) return;

    if (genTotalInput < 0) {
      alert('Total beds must be a non-negative number (>= 0).');
      return;
    }
    if (genOccupiedInput < 0) {
      alert('Occupied beds must be a non-negative number (>= 0).');
      return;
    }
    if (genReservedInput < 0) {
      alert('Reserved beds must be a non-negative number (>= 0).');
      return;
    }
    if (genOccupiedInput + genReservedInput > genTotalInput) {
      alert(`Occupied beds (${genOccupiedInput}) + Reserved beds (${genReservedInput}) cannot exceed Total beds (${genTotalInput}).`);
      return;
    }

    const calculatedAvailable = genTotalInput - genOccupiedInput - genReservedInput;

    setSavingGen(true);
    try {
      const savedRow = await saveGeneralBedInventory({
        hospital_id: hospitalId,
        total_beds: genTotalInput,
        occupied_beds: genOccupiedInput,
        reserved_beds: genReservedInput,
        available_beds: calculatedAvailable
      });

      if (!savedRow || !savedRow.bed_inventory_id) {
        throw new Error('Supabase did not return the saved general bed inventory record.');
      }

      triggerToast('General bed inventory saved successfully in Supabase!');
      await fetchData();
    } catch (err: any) {
      console.error('Save General Bed Error:', err);
      alert('Failed to save General Bed inventory: ' + (err.message || 'Database error'));
    } finally {
      setSavingGen(false);
    }
  };

  const handleAddOxygen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospitalId) return;

    if (oxyTotal < 0) {
      alert('Total capacity must be a non-negative number (>= 0).');
      return;
    }
    if (oxyAvail < 0) {
      alert('Available capacity must be a non-negative number (>= 0).');
      return;
    }
    if (oxyMinThreshold < 0) {
      alert('Minimum threshold must be a non-negative number (>= 0).');
      return;
    }
    if (oxyAvail > oxyTotal) {
      alert(`Available capacity (${oxyAvail}) cannot exceed Total capacity (${oxyTotal}).`);
      return;
    }
    if (!oxyUnit.trim()) {
      alert('Unit is required (e.g. Cylinders, Liters).');
      return;
    }

    setAddingOxy(true);
    try {
      const saved = await addOxygenInventoryItem({
        hospital_id: hospitalId,
        oxygen_type: oxyType,
        total_capacity: oxyTotal,
        available_capacity: oxyAvail,
        minimum_threshold: oxyMinThreshold,
        unit: oxyUnit.trim()
      });

      if (!saved || !saved.oxygen_inventory_id) {
        throw new Error('Supabase did not return the saved oxygen record.');
      }

      triggerToast(`Added ${oxyType} oxygen inventory record!`);
      await fetchData();
    } catch (err: any) {
      console.error('Add Oxygen Error:', err);
      alert('Failed to add oxygen inventory: ' + (err.message || 'Database error'));
    } finally {
      setAddingOxy(false);
    }
  };

  const startEditOxygen = (oxy: OxygenInventoryTable) => {
    setEditingOxyId(oxy.oxygen_inventory_id);
    setEditOxyType(oxy.oxygen_type);
    setEditOxyTotal(oxy.total_capacity);
    setEditOxyAvail(oxy.available_capacity);
    setEditOxyMin(oxy.minimum_threshold);
    setEditOxyUnit(oxy.unit);
  };

  const handleSaveOxygenEdit = async (oxyId: string) => {
    if (editOxyTotal < 0) {
      alert('Total capacity must be non-negative.');
      return;
    }
    if (editOxyAvail < 0) {
      alert('Available capacity must be non-negative.');
      return;
    }
    if (editOxyMin < 0) {
      alert('Minimum threshold must be non-negative.');
      return;
    }
    if (editOxyAvail > editOxyTotal) {
      alert(`Available capacity (${editOxyAvail}) cannot exceed Total capacity (${editOxyTotal}).`);
      return;
    }
    if (!editOxyUnit.trim()) {
      alert('Unit is required.');
      return;
    }

    setSavingEditOxy(true);
    try {
      const updated = await updateOxygenInventoryItem(oxyId, {
        oxygen_type: editOxyType,
        total_capacity: editOxyTotal,
        available_capacity: editOxyAvail,
        minimum_threshold: editOxyMin,
        unit: editOxyUnit.trim()
      });

      if (!updated) {
        throw new Error('Supabase did not return the updated oxygen record.');
      }

      triggerToast('Oxygen inventory record updated!');
      setEditingOxyId(null);
      await fetchData();
    } catch (err: any) {
      console.error('Update Oxygen Error:', err);
      alert('Failed to update oxygen inventory: ' + (err.message || 'Database error'));
    } finally {
      setSavingEditOxy(false);
    }
  };

  const handleAddMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospitalId) return;
    setAddingMed(true);
    try {
      await addMedicineItem({
        hospital_id: hospitalId,
        medicine_name: medName,
        category: medCategory,
        dosage: medDosage,
        current_stock: medStock,
        minimum_stock: medMinStock,
        unit: medUnit
      });
      triggerToast(`Added ${medName} to medicine inventory!`);
      setMedName('');
      await fetchData();
    } catch (err: any) {
      alert('Failed to add medicine: ' + err.message);
    } finally {
      setAddingMed(false);
    }
  };

  const genAvailableCalculated = genTotalInput - genOccupiedInput - genReservedInput;

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
            <Building2 className="w-6 h-6 text-sky-400" />
            <h1 className="text-xl font-black text-white">{hospital?.hospital_name || 'Hospital Provider'}</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Code: <span className="font-mono text-white">{hospital?.hospital_code || 'N/A'}</span> | District: {hospital?.district || 'Central'}, {hospital?.state || 'NCT'} | Type: <span className="text-sky-400 font-bold">{hospital?.hospital_type || 'Government'}</span>
          </p>
        </div>

        <button
          onClick={fetchData}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl cursor-pointer transition-all flex items-center gap-1.5 text-xs font-bold"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Sync Hospital Inventory</span>
        </button>
      </div>

      {loading ? (
        <LoadingState message="Loading hospital inventory from Supabase..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchData} />
      ) : (
        <div className="space-y-8">
          {/* Hospital Emergency Queue Notice (Batch 1 Safety Boundary) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-3">
            <div className="flex items-center gap-2.5 text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">Emergency Requests &amp; Queue Status</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Emergency requests require authorised clinician review before entering the hospital operational queue. No unconfirmed patient request is shown or ranked here.
            </p>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              <span>Authority Boundary: Clinical urgency validation is restricted to Clinician Reviewers.</span>
            </div>
          </div>

          {/* Inter-Hospital Resource Transfer Requests */}
          <ResourceTransferManager
            title="Hospital Inter-Facility Resource Transfers"
            subtitle="Create and manage resource transfers for ICU beds, general beds, oxygen, and medical supplies."
          />

          {/* Operational Demand Forecasts & Stockout Predictions (Strictly for this hospital) */}
          <OperationalPredictionManager
            filterHospitalId={hospitalId}
            title="Facility Demand Predictions & Stockout Risk"
            subtitle="Deterministic baseline forecasts calculated directly from live Supabase inventory and patient request logs for your facility."
          />

          {/* Bed Inventory Forms Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* ICU Inventory Form */}
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4">
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-sky-400" />
                <span>ICU Bed Inventory (icu_inventory)</span>
              </h2>

              <form onSubmit={handleSaveIcu} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Available Beds</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={icuAvailInput}
                      onChange={(e) => setIcuAvailInput(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Total ICU Beds</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={icuTotalInput}
                      onChange={(e) => setIcuTotalInput(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 font-mono">
                  Occupied Beds: {Math.max(0, icuTotalInput - icuAvailInput)} / {icuTotalInput}
                </div>

                <button
                  type="submit"
                  disabled={savingIcu}
                  className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-lg shadow-sky-600/30"
                >
                  {savingIcu ? 'Saving...' : 'Update ICU Inventory'}
                </button>
              </form>
            </div>

            {/* General Bed Inventory Form */}
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4">
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <Boxes className="w-5 h-5 text-amber-400" />
                <span>General Bed Inventory (general_bed_inventory)</span>
              </h2>

              <form onSubmit={handleSaveGen} className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Total Beds</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={genTotalInput}
                      onChange={(e) => setGenTotalInput(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Occupied</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={genOccupiedInput}
                      onChange={(e) => setGenOccupiedInput(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Reserved</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={genReservedInput}
                      onChange={(e) => setGenReservedInput(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center text-xs font-mono">
                  <span className="text-slate-400">Available Beds (Calculated):</span>
                  <span className={`font-black text-sm ${genAvailableCalculated >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {genAvailableCalculated} / {genTotalInput}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={savingGen}
                  className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-lg shadow-amber-600/30"
                >
                  {savingGen ? 'Saving...' : 'Update General Beds'}
                </button>
              </form>
            </div>
          </div>

          {/* Oxygen Inventory Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Add Oxygen Item Form */}
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4">
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-cyan-400" />
                <span>Add Oxygen Inventory Item</span>
              </h2>

              <form onSubmit={handleAddOxygen} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">Oxygen Type</label>
                  <select
                    value={oxyType}
                    onChange={(e) => setOxyType(e.target.value as OxygenType)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="Cylinder">Cylinder</option>
                    <option value="Liquid Oxygen">Liquid Oxygen</option>
                    <option value="Medical Oxygen">Medical Oxygen</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Total Capacity</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={oxyTotal}
                      onChange={(e) => setOxyTotal(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Available</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={oxyAvail}
                      onChange={(e) => setOxyAvail(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Min Threshold</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={oxyMinThreshold}
                      onChange={(e) => setOxyMinThreshold(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Unit</label>
                    <input
                      type="text"
                      required
                      value={oxyUnit}
                      onChange={(e) => setOxyUnit(e.target.value)}
                      placeholder="e.g. Cylinders, Liters"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={addingOxy}
                  className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-lg shadow-cyan-600/30"
                >
                  {addingOxy ? 'Adding...' : 'Add Oxygen Item'}
                </button>
              </form>
            </div>

            {/* Oxygen Inventory Display List */}
            <div className="lg:col-span-2 bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4">
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <Wind className="w-5 h-5 text-cyan-400" />
                <span>Oxygen Inventory Stock (oxygen_inventory)</span>
              </h2>

              {oxygenList.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No oxygen inventory items logged for this hospital.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {oxygenList.map((oxy) => {
                    const isLowStock = oxy.available_capacity <= oxy.minimum_threshold;
                    const isEditing = editingOxyId === oxy.oxygen_inventory_id;

                    if (isEditing) {
                      return (
                        <div key={oxy.oxygen_inventory_id} className="p-4 bg-slate-950 border border-cyan-500 rounded-xl space-y-3">
                          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                            <span className="font-bold text-xs text-cyan-400">Edit Oxygen Record</span>
                            <button
                              onClick={() => setEditingOxyId(null)}
                              className="text-slate-400 hover:text-white p-1"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="space-y-2 text-xs">
                            <div>
                              <label className="block text-[11px] text-slate-400">Type</label>
                              <select
                                value={editOxyType}
                                onChange={(e) => setEditOxyType(e.target.value as OxygenType)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-white"
                              >
                                <option value="Cylinder">Cylinder</option>
                                <option value="Liquid Oxygen">Liquid Oxygen</option>
                                <option value="Medical Oxygen">Medical Oxygen</option>
                              </select>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] text-slate-400">Total Capacity</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={editOxyTotal}
                                  onChange={(e) => setEditOxyTotal(parseInt(e.target.value) || 0)}
                                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-white font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] text-slate-400">Available</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={editOxyAvail}
                                  onChange={(e) => setEditOxyAvail(parseInt(e.target.value) || 0)}
                                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-white font-mono"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] text-slate-400">Min Threshold</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={editOxyMin}
                                  onChange={(e) => setEditOxyMin(parseInt(e.target.value) || 0)}
                                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-white font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] text-slate-400">Unit</label>
                                <input
                                  type="text"
                                  value={editOxyUnit}
                                  onChange={(e) => setEditOxyUnit(e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-white"
                                />
                              </div>
                            </div>

                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => handleSaveOxygenEdit(oxy.oxygen_inventory_id)}
                                disabled={savingEditOxy}
                                className="flex-1 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-bold flex items-center justify-center gap-1 text-xs"
                              >
                                <Save className="w-3.5 h-3.5" />
                                <span>{savingEditOxy ? 'Saving...' : 'Save'}</span>
                              </button>
                              <button
                                onClick={() => setEditingOxyId(null)}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={oxy.oxygen_inventory_id} className={`p-4 bg-slate-950 border rounded-xl space-y-2 transition-all ${isLowStock ? 'border-red-800/80 bg-red-950/10' : 'border-slate-800'}`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-extrabold text-white text-sm block">{oxy.oxygen_type}</span>
                            {isLowStock && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 mt-1 bg-red-950 text-red-400 border border-red-800/80 rounded-md text-[10px] font-black uppercase tracking-wider animate-pulse">
                                <AlertTriangle className="w-3 h-3" /> LOW STOCK
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => startEditOxygen(oxy)}
                            className="p-1.5 text-slate-400 hover:text-cyan-400 bg-slate-900 border border-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Edit Record"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex justify-between items-baseline pt-1">
                          <span className="text-xs text-slate-400">Available / Total:</span>
                          <span className={`font-mono font-black text-sm ${isLowStock ? 'text-red-400' : 'text-cyan-400'}`}>
                            {oxy.available_capacity} / {oxy.total_capacity} {oxy.unit}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-400 font-mono">
                          Minimum Threshold: <span className="text-slate-300">{oxy.minimum_threshold} {oxy.unit}</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Medicine Inventory Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Add Medicine Form */}
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4">
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                <span>Add Medicine Item</span>
              </h2>

              <form onSubmit={handleAddMedicine} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">Medicine Name</label>
                  <input
                    type="text"
                    required
                    value={medName}
                    onChange={(e) => setMedName(e.target.value)}
                    placeholder="e.g. Epinephrine 1mg/mL"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Category</label>
                    <select
                      value={medCategory}
                      onChange={(e) => setMedCategory(e.target.value as MedicineCategory)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                    >
                      <option value="Emergency">Emergency</option>
                      <option value="Antibiotic">Antibiotic</option>
                      <option value="Analgesic">Analgesic</option>
                      <option value="Antipyretic">Antipyretic</option>
                      <option value="Injection">Injection</option>
                      <option value="IV Fluid">IV Fluid</option>
                      <option value="Vaccine">Vaccine</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Dosage</label>
                    <input
                      type="text"
                      required
                      value={medDosage}
                      onChange={(e) => setMedDosage(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Stock</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={medStock}
                      onChange={(e) => setMedStock(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Min Stock</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={medMinStock}
                      onChange={(e) => setMedMinStock(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Unit</label>
                    <input
                      type="text"
                      required
                      value={medUnit}
                      onChange={(e) => setMedUnit(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={addingMed}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-lg shadow-emerald-600/30"
                >
                  {addingMed ? 'Adding...' : 'Add Medicine Record'}
                </button>
              </form>
            </div>

            {/* Medicine Inventory Stream */}
            <div className="lg:col-span-2 bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4">
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <Pill className="w-5 h-5 text-emerald-400" />
                <span>Medicine Inventory Stock (medicine_inventory)</span>
              </h2>

              {medicines.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No medicine items logged for this hospital.</p>
              ) : (
                <div className="space-y-3">
                  {medicines.map((m) => (
                    <div key={m.medicine_inventory_id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex justify-between items-center text-xs">
                      <div>
                        <p className="font-extrabold text-white text-sm">{m.medicine_name}</p>
                        <p className="text-[11px] text-slate-400">Category: {m.category} | Dosage: {m.dosage}</p>
                      </div>
                      <div className="text-right font-mono">
                        <p className="text-emerald-400 font-bold text-sm">{m.current_stock} {m.unit}</p>
                        <p className="text-[10px] text-slate-500">Min: {m.minimum_stock} {m.unit}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

