import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  ArrowRightLeft,
  Building2,
  Package,
  PlusCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Truck,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Send,
  Info
} from 'lucide-react';
import {
  createTransferRequest,
  getResourceTransfers,
  updateTransferStatus
} from '../services/resourceTransferService';
import { getActiveHospitals, HospitalDirectoryItem } from '../services/hospitalService';
import { ResourceTransferTable, TransferResourceType, TransferStatus } from '../types/database';
import { subscribeToSupabaseRealtime } from '../services/supabaseDataLayer';
import { LoadingState, ErrorState } from './common/EmptyState';

interface ResourceTransferManagerProps {
  title?: string;
  subtitle?: string;
}

export const ResourceTransferManager: React.FC<ResourceTransferManagerProps> = ({
  title = "Inter-Hospital Resource Transfers",
  subtitle = "Transfer ICU beds, oxygen, medicines, and medical supplies between regional hospitals with protected stock enforcement."
}) => {
  const { userProfile } = useAuth();
  const userHospitalId = userProfile?.hospital_id;
  const isGovtAdmin = userProfile?.role === 'government_admin';

  const [transfers, setTransfers] = useState<any[]>([]);
  const [hospitals, setHospitals] = useState<HospitalDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Transfer Form State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [destHospitalId, setDestHospitalId] = useState<string>('');
  const [resourceType, setResourceType] = useState<TransferResourceType>('ICU Beds');
  const [resourceName, setResourceName] = useState<string>('ICU Beds Transfer');
  const [quantity, setQuantity] = useState<number>(1);
  const [remarks, setRemarks] = useState<string>('');

  const triggerToast = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const fetchInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [transData, activeHospData] = await Promise.all([
        getResourceTransfers(isGovtAdmin ? undefined : userHospitalId || undefined),
        getActiveHospitals(userHospitalId || undefined)
      ]);

      setTransfers(transData);
      setHospitals(activeHospData);

      // Default destination hospital to first active hospital in directory
      if (activeHospData.length > 0) {
        setDestHospitalId(prev => {
          const exists = activeHospData.some(h => h.hospital_id === prev);
          return exists ? prev : activeHospData[0].hospital_id;
        });
      } else {
        setDestHospitalId('');
      }
    } catch (err: any) {
      console.error('Fetch transfers error:', err);
      setError(err?.message || 'Failed to load inter-hospital resource transfers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();

    const unsubscribe = subscribeToSupabaseRealtime(
      ['resource_transfers', 'hospitals', 'icu_inventory', 'general_bed_inventory', 'oxygen_inventory', 'medicine_inventory'],
      () => fetchInitialData()
    );

    return () => unsubscribe();
  }, [userHospitalId, isGovtAdmin]);

  const handleResourceTypeChange = (type: TransferResourceType) => {
    setResourceType(type);
    if (type === 'ICU Beds') setResourceName('ICU Beds Allocation');
    else if (type === 'General Beds') setResourceName('General Emergency Beds');
    else if (type === 'Oxygen') setResourceName('Oxygen Cylinders (40L)');
    else if (type === 'Medicine') setResourceName('Essential Emergency Antibiotics');
    else if (type === 'Blood') setResourceName('PRBC Blood Units');
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!userHospitalId && !isGovtAdmin) {
      setFormError('Your account is not linked to a valid hospital facility. Only hospital admins can submit transfer requests.');
      return;
    }

    const sourceId = userHospitalId || '';
    if (!sourceId) {
      setFormError('Source hospital ID is missing.');
      return;
    }

    if (!destHospitalId) {
      setFormError('Please select a destination hospital.');
      return;
    }

    if (sourceId === destHospitalId) {
      setFormError('Source and destination hospital must differ.');
      return;
    }

    if (!quantity || quantity <= 0) {
      setFormError('Quantity must be greater than zero.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await createTransferRequest({
        source_hospital_id: sourceId,
        destination_hospital_id: destHospitalId,
        resource_type: resourceType,
        resource_name: resourceName,
        quantity: Number(quantity),
        remarks,
        operator_id: userProfile?.user_id
      });

      if (result.success && result.data) {
        triggerToast(`Resource transfer request #${result.data.transfer_id.slice(0, 8)} created successfully!`);
        setShowCreateModal(false);
        setRemarks('');
        setQuantity(1);
        await fetchInitialData();
      } else {
        setFormError(result.error || 'Failed to submit transfer request.');
      }
    } catch (err: any) {
      setFormError('Error submitting transfer request: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (transferId: string, newStatus: TransferStatus) => {
    try {
      const operatorId = userProfile?.user_id || 'system_operator';
      const res = await updateTransferStatus(transferId, newStatus, operatorId);

      if (res.success) {
        triggerToast(`Transfer status updated to "${newStatus}" successfully!`);
        await fetchInitialData();
      } else {
        setError('Failed to update transfer status: ' + (res.error || 'Unknown error'));
      }
    } catch (err: any) {
      setError('Error updating transfer status: ' + err.message);
    }
  };

  const getStatusBadge = (status: TransferStatus) => {
    switch (status) {
      case 'Approved':
        return 'bg-blue-950/80 text-blue-300 border-blue-800';
      case 'In Transit':
        return 'bg-amber-950/80 text-amber-300 border-amber-800 animate-pulse';
      case 'Completed':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800';
      case 'Rejected':
        return 'bg-rose-950/80 text-rose-300 border-rose-800';
      case 'Pending':
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-6 shadow-2xl">
      {/* Toast Notification */}
      {actionSuccess && (
        <div className="bg-emerald-950/90 border border-emerald-700 text-emerald-200 p-3 rounded-xl flex items-center gap-2 text-xs font-bold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-black text-white">{title}</h2>
            <span className="bg-blue-950 text-blue-300 border border-blue-800 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
              {transfers.length} Transfers
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={fetchInitialData}
            disabled={loading}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => {
              setFormError(null);
              setShowCreateModal(true);
            }}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-950/50 flex items-center gap-2 transition-all cursor-pointer border border-blue-500"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Request Transfer</span>
          </button>
        </div>
      </div>

      {/* Create Transfer Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <ArrowRightLeft className="w-4 h-4 text-blue-400" />
                <span>Create Hospital Resource Transfer Request</span>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg text-xs"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="bg-rose-950/90 border border-rose-800 text-rose-200 p-3 rounded-xl text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              {/* Destination Hospital */}
              <div className="space-y-1">
                <label className="text-slate-300 font-bold block">Destination Hospital</label>
                {hospitals.length === 0 ? (
                  <div className="p-3 bg-slate-950 border border-amber-800/80 text-amber-300 rounded-xl text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>No other active destination hospitals found in directory.</span>
                  </div>
                ) : (
                  <select
                    value={destHospitalId}
                    onChange={(e) => setDestHospitalId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-white p-2.5 rounded-xl focus:border-blue-500 focus:outline-none"
                    required
                  >
                    {hospitals.map((h) => (
                      <option key={h.hospital_id} value={h.hospital_id}>
                        {h.hospital_name} ({h.hospital_code})
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[10px] text-slate-500">Destination hospital must differ from source hospital.</p>
              </div>

              {/* Resource Type & Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-bold block">Resource Category</label>
                  <select
                    value={resourceType}
                    onChange={(e) => handleResourceTypeChange(e.target.value as TransferResourceType)}
                    className="w-full bg-slate-950 border border-slate-800 text-white p-2.5 rounded-xl focus:border-blue-500 focus:outline-none"
                  >
                    <option value="ICU Beds">ICU Beds</option>
                    <option value="General Beds">General Beds</option>
                    <option value="Oxygen">Oxygen</option>
                    <option value="Medicine">Medicine</option>
                    <option value="Blood">Blood</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-bold block">Resource Description</label>
                  <input
                    type="text"
                    value={resourceName}
                    onChange={(e) => setResourceName(e.target.value)}
                    placeholder="e.g. Oxygen Cylinders"
                    className="w-full bg-slate-950 border border-slate-800 text-white p-2.5 rounded-xl focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* Quantity */}
              <div className="space-y-1">
                <label className="text-slate-300 font-bold block">Transfer Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-slate-950 border border-slate-800 text-white p-2.5 rounded-xl focus:border-blue-500 focus:outline-none font-mono"
                  required
                />
              </div>

              {/* Remarks */}
              <div className="space-y-1">
                <label className="text-slate-300 font-bold block">Remarks / Medical Urgency Justification</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Emergency surge in respiratory ward. Requesting immediate dispatch."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 text-white p-2.5 rounded-xl focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || hospitals.length === 0}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-950/50"
                >
                  {submitting ? (
                    <span>Submitting...</span>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Submit Request</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Content List / Table */}
      {loading ? (
        <LoadingState message="Loading resource transfer requests from Supabase..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchInitialData} />
      ) : transfers.length === 0 ? (
        <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 space-y-2">
          <ArrowRightLeft className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-xs font-bold text-slate-300">No Inter-Hospital Resource Transfers Recorded</p>
          <p className="text-[11px] text-slate-500 max-w-md mx-auto">
            Use the "Request Transfer" button above to allocate beds, oxygen, medicines, or supplies across facilities in the region.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-3">Transfer ID</th>
                <th className="py-3 px-3">Resource</th>
                <th className="py-3 px-3">Quantity</th>
                <th className="py-3 px-3">Source Facility</th>
                <th className="py-3 px-3">Destination Facility</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Created</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {transfers.map((t: ResourceTransferTable & {
                source_hospital?: { hospital_name: string; district: string; hospital_code?: string };
                destination_hospital?: { hospital_name: string; district: string; hospital_code?: string };
              }) => {
                const isSource = t.source_hospital_id === userHospitalId;
                const isDest = t.destination_hospital_id === userHospitalId;

                return (
                  <tr key={t.transfer_id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3 font-bold text-slate-300">
                      #{t.transfer_id.slice(0, 8)}
                    </td>
                    <td className="py-3 px-3 font-sans">
                      <span className="font-bold text-white block">{t.resource_name || t.resource_type}</span>
                      <span className="text-[10px] text-slate-500">{t.resource_type}</span>
                    </td>
                    <td className="py-3 px-3 font-bold text-sky-400">
                      {t.quantity}
                    </td>
                    <td className="py-3 px-3 font-sans">
                      <span className="font-bold text-slate-200 block">
                        {t.source_hospital?.hospital_name || t.source_hospital_id.slice(0, 8)}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {t.source_hospital?.district || 'Source'} {isSource ? '(You)' : ''}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-sans">
                      <span className="font-bold text-slate-200 block">
                        {t.destination_hospital?.hospital_name || t.destination_hospital_id.slice(0, 8)}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {t.destination_hospital?.district || 'Destination'} {isDest ? '(You)' : ''}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadge(t.status)}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-sans text-[10px]">
                      {new Date(t.created_at).toLocaleDateString()} {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1 font-sans">
                        {t.status === 'Completed' ? (
                          <span className="text-emerald-400 text-[10px] font-bold flex items-center gap-1 justify-end">
                            <CheckCircle2 className="w-3 h-3" /> Completed
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px] italic">
                            Approval execution will become available after the trusted transfer workflow is configured.
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
