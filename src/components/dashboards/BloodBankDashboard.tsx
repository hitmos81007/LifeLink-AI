import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Droplets,
  CheckCircle2,
  AlertTriangle,
  Boxes,
  RefreshCw,
  Plus,
  Edit2,
  Calendar,
  Save,
  X
} from 'lucide-react';
import {
  getBloodBankById,
  getBloodInventoryList,
  saveBloodInventoryItem
} from '../../services/bloodService';
import { BloodBankTable, BloodInventoryTable, BloodGroup } from '../../types/database';
import { subscribeToSupabaseRealtime } from '../../services/supabaseDataLayer';
import { LoadingState, ErrorState } from '../common/EmptyState';

const ALL_BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const BloodBankDashboard: React.FC = () => {
  const { userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const bloodBankId = userProfile?.blood_bank_id;

  const [bloodBank, setBloodBank] = useState<BloodBankTable | null>(null);
  const [inventoryList, setInventoryList] = useState<BloodInventoryTable[]>([]);

  // Add / Edit Form State
  const [selectedGroup, setSelectedGroup] = useState<BloodGroup>('A+');
  const [availUnitsInput, setAvailUnitsInput] = useState<number>(50);
  const [reservedUnitsInput, setReservedUnitsInput] = useState<number>(5);
  const [expiredUnitsInput, setExpiredUnitsInput] = useState<number>(0);
  const [minThresholdInput, setMinThresholdInput] = useState<number>(10);
  const [lastRestockedInput, setLastRestockedInput] = useState<string>(
    new Date().toISOString().slice(0, 16)
  );
  const [saving, setSaving] = useState(false);

  // Inline Quick Edit state for inventory items
  const [editingInventoryId, setEditingInventoryId] = useState<string | null>(null);
  const [editAvail, setEditAvail] = useState<number>(0);
  const [editReserved, setEditReserved] = useState<number>(0);
  const [editExpired, setEditExpired] = useState<number>(0);
  const [editMinThreshold, setEditMinThreshold] = useState<number>(0);
  const [editLastRestocked, setEditLastRestocked] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState(false);

  const triggerToast = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const fetchData = async () => {
    if (!bloodBankId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const bank = await getBloodBankById(bloodBankId);
      const inv = await getBloodInventoryList(bloodBankId);
      setBloodBank(bank);
      setInventoryList(inv);
    } catch (err: any) {
      console.error('BloodBankDashboard load error:', err);
      setError(err.message || 'Failed to query blood bank inventory from Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const unsubscribe = subscribeToSupabaseRealtime(['blood_banks', 'blood_inventory', 'notifications'], () => fetchData());
    return () => unsubscribe();
  }, [bloodBankId]);

  if (!bloodBankId) {
    return (
      <div className="bg-slate-900 border border-amber-800/80 rounded-2xl p-8 text-center space-y-4 max-w-2xl mx-auto my-12">
        <div className="w-12 h-12 bg-amber-950/80 border border-amber-700 text-amber-400 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-white">Blood Bank Account Not Linked</h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          Your account (<strong>{userProfile?.email}</strong>) is assigned the <code className="text-red-400 font-mono">blood_bank_admin</code> role, but is not linked to any specific blood bank facility in <code className="text-amber-400 font-mono">public.users.blood_bank_id</code>.
        </p>
        <p className="text-xs text-slate-400">
          Please contact an administrator or register a new account selecting an associated blood bank facility.
        </p>
      </div>
    );
  }

  const handleSaveInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bloodBankId) return;

    if (availUnitsInput < 0) {
      alert('Available units must be a non-negative number (>= 0).');
      return;
    }
    if (reservedUnitsInput < 0) {
      alert('Reserved units must be a non-negative number (>= 0).');
      return;
    }
    if (expiredUnitsInput < 0) {
      alert('Expired units must be a non-negative number (>= 0).');
      return;
    }
    if (minThresholdInput < 0) {
      alert('Minimum threshold must be a non-negative number (>= 0).');
      return;
    }
    if (reservedUnitsInput > availUnitsInput) {
      alert(`Reserved units (${reservedUnitsInput}) cannot exceed Available units (${availUnitsInput}).`);
      return;
    }

    setSaving(true);
    try {
      const restockedIso = lastRestockedInput ? new Date(lastRestockedInput).toISOString() : new Date().toISOString();
      const savedRow = await saveBloodInventoryItem({
        blood_bank_id: bloodBankId,
        blood_group: selectedGroup,
        available_units: availUnitsInput,
        reserved_units: reservedUnitsInput,
        expired_units: expiredUnitsInput,
        minimum_threshold: minThresholdInput,
        last_restocked: restockedIso
      });

      if (!savedRow || !savedRow.inventory_id) {
        throw new Error('Supabase did not return the saved blood inventory record.');
      }

      triggerToast(`Saved inventory stock for ${selectedGroup} successfully!`);
      await fetchData();
    } catch (err: any) {
      console.error('Save Blood Inventory Error:', err);
      alert('Failed to save blood inventory: ' + (err.message || 'Database error'));
    } finally {
      setSaving(false);
    }
  };

  const handleSelectForForm = (inv: BloodInventoryTable) => {
    setSelectedGroup(inv.blood_group);
    setAvailUnitsInput(inv.available_units);
    setReservedUnitsInput(inv.reserved_units);
    setExpiredUnitsInput(inv.expired_units);
    setMinThresholdInput(inv.minimum_threshold);
    if (inv.last_restocked) {
      setLastRestockedInput(new Date(inv.last_restocked).toISOString().slice(0, 16));
    }
  };

  const startInlineEdit = (inv: BloodInventoryTable) => {
    setEditingInventoryId(inv.inventory_id);
    setEditAvail(inv.available_units);
    setEditReserved(inv.reserved_units);
    setEditExpired(inv.expired_units);
    setEditMinThreshold(inv.minimum_threshold);
    setEditLastRestocked(
      inv.last_restocked ? new Date(inv.last_restocked).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16)
    );
  };

  const handleSaveInlineEdit = async (inv: BloodInventoryTable) => {
    if (editAvail < 0 || editReserved < 0 || editExpired < 0 || editMinThreshold < 0) {
      alert('All unit counts and thresholds must be non-negative (>= 0).');
      return;
    }
    if (editReserved > editAvail) {
      alert(`Reserved units (${editReserved}) cannot exceed Available units (${editAvail}).`);
      return;
    }

    setSavingEdit(true);
    try {
      const restockedIso = editLastRestocked ? new Date(editLastRestocked).toISOString() : new Date().toISOString();
      const savedRow = await saveBloodInventoryItem({
        blood_bank_id: bloodBankId,
        blood_group: inv.blood_group,
        available_units: editAvail,
        reserved_units: editReserved,
        expired_units: editExpired,
        minimum_threshold: editMinThreshold,
        last_restocked: restockedIso
      });

      if (!savedRow || !savedRow.inventory_id) {
        throw new Error('Supabase did not return the updated blood inventory record.');
      }

      triggerToast(`Updated ${inv.blood_group} inventory!`);
      setEditingInventoryId(null);
      await fetchData();
    } catch (err: any) {
      console.error('Inline Edit Blood Inventory Error:', err);
      alert('Failed to update blood inventory: ' + (err.message || 'Database error'));
    } finally {
      setSavingEdit(false);
    }
  };

  const totalAvailable = inventoryList.reduce((acc, curr) => acc + curr.available_units, 0);
  const totalReserved = inventoryList.reduce((acc, curr) => acc + curr.reserved_units, 0);
  const criticalGroups = inventoryList.filter((i) => i.available_units <= i.minimum_threshold);

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
            <Droplets className="w-6 h-6 text-red-500" />
            <h1 className="text-xl font-black text-white">{bloodBank?.blood_bank_name || 'Blood Bank Facility'}</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Code: <span className="font-mono text-white">{bloodBank?.blood_bank_code || 'N/A'}</span> | District: {bloodBank?.district || 'Central'}, {bloodBank?.state || 'State'} | Phone: {bloodBank?.phone || 'N/A'}
          </p>
        </div>

        <button
          onClick={fetchData}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl cursor-pointer transition-all flex items-center gap-1.5 text-xs font-bold"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Sync Database</span>
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-bold uppercase">Total Available Units</span>
          <p className="text-2xl font-black text-emerald-400 font-mono">{totalAvailable} Units</p>
        </div>

        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-bold uppercase">Reserved Units</span>
          <p className="text-2xl font-black text-amber-400 font-mono">{totalReserved} Units</p>
        </div>

        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-bold uppercase">Low Stock Threshold Alerts</span>
          <p className={`text-2xl font-black font-mono ${criticalGroups.length > 0 ? 'text-rose-500' : 'text-slate-300'}`}>
            {criticalGroups.length} Blood Groups
          </p>
        </div>
      </div>

      {/* Main Grid: Form Panel & Inventory List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Add / Update Blood Group Form Panel */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-5">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-red-500" />
              <span>Add / Update Blood Group Stock</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Creates or updates inventory stock for the selected blood group.
            </p>
          </div>

          <form onSubmit={handleSaveInventory} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Blood Group</label>
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value as BloodGroup)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono font-bold focus:ring-2 focus:ring-red-500"
              >
                {ALL_BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Available Units</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={availUnitsInput}
                  onChange={(e) => setAvailUnitsInput(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Reserved Units</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={reservedUnitsInput}
                  onChange={(e) => setReservedUnitsInput(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Expired Units</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={expiredUnitsInput}
                  onChange={(e) => setExpiredUnitsInput(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Min Threshold</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={minThresholdInput}
                  onChange={(e) => setMinThresholdInput(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Last Restocked Date</span>
              </label>
              <input
                type="datetime-local"
                required
                value={lastRestockedInput}
                onChange={(e) => setLastRestockedInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-lg shadow-red-600/30 transition-all"
            >
              {saving ? 'Saving to Supabase...' : `Save Stock for ${selectedGroup}`}
            </button>
          </form>
        </div>

        {/* Blood Groups Inventory Matrix & List */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-6">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <Boxes className="w-5 h-5 text-red-500" />
              <span>Blood Group Reserves Matrix (blood_inventory)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Configured blood groups and current unit allocations in Supabase.
            </p>
          </div>

          {loading ? (
            <LoadingState message="Loading blood inventory from Supabase..." />
          ) : error ? (
            <ErrorState message={error} onRetry={fetchData} />
          ) : inventoryList.length === 0 ? (
            <div className="p-8 text-center bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
              <p className="text-sm font-bold text-slate-300">No Inventory Records Yet</p>
              <p className="text-xs text-slate-400">
                Use the form on the left to add your first blood group stock for this facility.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {inventoryList.map((inv) => {
                const isCritical = inv.available_units <= inv.minimum_threshold;
                const isEditing = editingInventoryId === inv.inventory_id;

                if (isEditing) {
                  return (
                    <div key={inv.inventory_id} className="p-4 bg-slate-950 border border-red-500 rounded-2xl space-y-3">
                      <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                        <span className="font-extrabold text-sm text-red-400 font-mono">Edit {inv.blood_group}</span>
                        <button
                          onClick={() => setEditingInventoryId(null)}
                          className="text-slate-400 hover:text-white p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] text-slate-400 font-bold">Available</label>
                            <input
                              type="number"
                              min="0"
                              value={editAvail}
                              onChange={(e) => setEditAvail(parseInt(e.target.value) || 0)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-white font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 font-bold">Reserved</label>
                            <input
                              type="number"
                              min="0"
                              value={editReserved}
                              onChange={(e) => setEditReserved(parseInt(e.target.value) || 0)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-white font-mono"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] text-slate-400 font-bold">Expired</label>
                            <input
                              type="number"
                              min="0"
                              value={editExpired}
                              onChange={(e) => setEditExpired(parseInt(e.target.value) || 0)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-white font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 font-bold">Min Threshold</label>
                            <input
                              type="number"
                              min="0"
                              value={editMinThreshold}
                              onChange={(e) => setEditMinThreshold(parseInt(e.target.value) || 0)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-white font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] text-slate-400 font-bold">Last Restocked</label>
                          <input
                            type="datetime-local"
                            value={editLastRestocked}
                            onChange={(e) => setEditLastRestocked(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-white font-mono"
                          />
                        </div>

                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => handleSaveInlineEdit(inv)}
                            disabled={savingEdit}
                            className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold flex items-center justify-center gap-1 text-xs cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>{savingEdit ? 'Saving...' : 'Save'}</span>
                          </button>
                          <button
                            onClick={() => setEditingInventoryId(null)}
                            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold text-xs cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={inv.inventory_id}
                    className={`p-4 rounded-2xl border text-left space-y-3 transition-all ${
                      isCritical
                        ? 'bg-rose-950/20 border-rose-800/80'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-black text-white font-mono bg-red-950/80 border border-red-800 px-2.5 py-0.5 rounded-xl">
                          {inv.blood_group}
                        </span>
                        {isCritical && (
                          <span className="px-2 py-0.5 bg-rose-500/20 text-rose-400 border border-rose-500/40 rounded-md text-[10px] font-bold uppercase tracking-wider animate-pulse flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> LOW STOCK
                          </span>
                        )}
                      </div>

                      <div className="flex gap-1">
                        <button
                          onClick={() => handleSelectForForm(inv)}
                          className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-lg text-[10px] font-bold cursor-pointer"
                          title="Load into Form"
                        >
                          Load Form
                        </button>
                        <button
                          onClick={() => startInlineEdit(inv)}
                          className="p-1.5 text-slate-400 hover:text-red-400 bg-slate-900 border border-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Quick Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">Available</span>
                        <span className={`text-base font-black ${isCritical ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {inv.available_units} units
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">Reserved</span>
                        <span className="text-base font-black text-amber-400">
                          {inv.reserved_units} units
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">Expired</span>
                        <span className="text-sm font-bold text-slate-400">
                          {inv.expired_units} units
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">Min Threshold</span>
                        <span className="text-sm font-bold text-slate-300">
                          {inv.minimum_threshold} units
                        </span>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-400 font-mono">
                      Last Restocked: <span className="text-slate-300">{inv.last_restocked ? new Date(inv.last_restocked).toLocaleString() : 'N/A'}</span>
                    </p>
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

