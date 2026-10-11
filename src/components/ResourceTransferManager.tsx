import React, { useState, useEffect, useRef } from 'react';
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
  createInboundTransferRequest,
  getNearbyTransferSources,
  getResourceTransfers,
  NearbyTransferSource,
  updateTransferStatus
} from '../services/resourceTransferService';
import { ResourceTransferTable, TransferResourceType, TransferStatus } from '../types/database';
import { subscribeToSupabaseRealtime } from '../services/supabaseDataLayer';
import { getResourceFreshness, ResourceCategory } from '../services/resourceFreshness';
import { LoadingState, ErrorState } from './common/EmptyState';
import { ResourceTransferTimeline } from './ResourceTransferTimeline';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Transfer Form State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [resourceType, setResourceType] = useState<TransferResourceType>('ICU Beds');
  const [maxDistanceKm, setMaxDistanceKm] = useState<number | null>(100);
  const [nearbySources, setNearbySources] = useState<NearbyTransferSource[]>([]);
  const [selectedSourceKey, setSelectedSourceKey] = useState<string>('');
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [transitioningTransferId, setTransitioningTransferId] = useState<string | null>(null);
  const transferAttemptRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);

  const triggerToast = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const fetchInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      setTransfers(await getResourceTransfers(isGovtAdmin ? undefined : userHospitalId || undefined));
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
    setSelectedSourceKey('');
    setQuantity(1);
  };

  useEffect(() => {
    if (!showCreateModal || !userHospitalId) return;
    let cancelled = false;
    setStockLoading(true);
    setStockError(null);
    setNearbySources([]);
    setSelectedSourceKey('');
    const loadStock = async () => {
      try {
        const options = await getNearbyTransferSources(resourceType, maxDistanceKm);
        if (!cancelled) {
          setNearbySources(options);
          setSelectedSourceKey((current) => options.some((option) => option.key === current) ? current : (options[0]?.key || ''));
        }
      } catch (err: any) {
        if (!cancelled) setStockError(err?.message || 'Could not load source inventory.');
      } finally {
        if (!cancelled) setStockLoading(false);
      }
    };
    void loadStock();
    return () => { cancelled = true; };
  }, [showCreateModal, userHospitalId, resourceType, maxDistanceKm]);

  const selectedStock = nearbySources.find((option) => option.key === selectedSourceKey);
  const freshnessCategory: ResourceCategory = resourceType === 'ICU Beds'
    ? 'icu'
    : resourceType === 'General Beds'
      ? 'beds'
      : resourceType === 'Oxygen'
        ? 'oxygen'
        : 'medicine';
  const selectedStockFreshness = selectedStock
    ? getResourceFreshness(selectedStock.last_reported_at, freshnessCategory)
    : 'Unknown';

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!userHospitalId || userProfile?.role !== 'hospital_admin') {
      setFormError('Your account is not linked to a valid hospital facility. Only hospital admins can submit transfer requests.');
      return;
    }

    const receivingHospitalId = userHospitalId;
    if (!receivingHospitalId) {
      setFormError('Receiving hospital ID is missing.');
      return;
    }

    if (!quantity || quantity <= 0) {
      setFormError('Quantity must be greater than zero.');
      return;
    }
    if (!selectedStock || quantity > selectedStock.transferable_quantity) {
      setFormError('Choose a nearby source and a quantity within its stock available above the protected minimum.');
      return;
    }

    setSubmitting(true);
    try {
      const fingerprint = JSON.stringify([
        receivingHospitalId, selectedStock.source_hospital_id, resourceType, selectedStock.key, quantity
      ]);
      if (!transferAttemptRef.current || transferAttemptRef.current.fingerprint !== fingerprint) {
        transferAttemptRef.current = { fingerprint, idempotencyKey: crypto.randomUUID() };
      }
      const result = await createInboundTransferRequest({
        source_hospital_id: selectedStock.source_hospital_id,
        resource_type: resourceType,
        resource_name: selectedStock.resource_name,
        resource_identity: selectedStock.resource_identity,
        quantity: Number(quantity),
        idempotency_key: transferAttemptRef.current.idempotencyKey
      });

      if (result.success && result.data) {
        transferAttemptRef.current = null;
        triggerToast(`Inbound request #${result.data.transfer_id.slice(0, 8)} sent to ${selectedStock.hospital_name} for source approval.`);
        setShowCreateModal(false);
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
    if (transitioningTransferId) return;
    setTransitioningTransferId(transferId);
    try {
      const operatorId = userProfile?.user_id || '';
      const res = await updateTransferStatus(transferId, newStatus, operatorId);

      if (res.success) {
        triggerToast(`Transfer status updated to "${newStatus}" successfully!`);
        await fetchInitialData();
      } else {
        setError('Failed to update transfer status: ' + (res.error || 'Unknown error'));
      }
    } catch (err: any) {
      setError('Error updating transfer status: ' + err.message);
    } finally {
      setTransitioningTransferId(null);
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
            disabled={userProfile?.role !== 'hospital_admin' || !userHospitalId}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-950/50 flex items-center gap-2 transition-all cursor-pointer border border-blue-500"
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
            <div className="bg-amber-950/50 border border-amber-800/70 text-amber-200 p-3 rounded-xl text-[11px] leading-relaxed">
              Synthetic demonstration only. These actions update prototype inventory records; no shipment, transport, or dispatch is arranged.
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-bold block">Resource needed at this hospital</label>
                <select
                  value={resourceType}
                  onChange={(e) => handleResourceTypeChange(e.target.value as TransferResourceType)}
                  className="w-full bg-slate-950 border border-slate-800 text-white p-2.5 rounded-xl focus:border-blue-500 focus:outline-none"
                >
                  <option value="ICU Beds">ICU Beds</option>
                  <option value="General Beds">General Beds</option>
                  <option value="Oxygen">Oxygen</option>
                  <option value="Medicine">Medicine</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-slate-300 font-bold block" htmlFor="transfer-max-distance">Maximum straight-line distance</label>
                <select
                  id="transfer-max-distance"
                  value={maxDistanceKm ?? ''}
                  onChange={(e) => setMaxDistanceKm(e.target.value ? Number(e.target.value) : null)}
                  className="w-full bg-slate-950 border border-slate-800 text-white p-2.5 rounded-xl focus:border-blue-500 focus:outline-none"
                >
                  <option value="25">Within 25 km</option>
                  <option value="50">Within 50 km</option>
                  <option value="100">Within 100 km</option>
                  <option value="250">Within 250 km</option>
                  <option value="">Any distance</option>
                </select>
                <p className="text-[10px] text-slate-500">Distance is estimated in a straight line from your assigned hospital, not by road.</p>
              </div>
              {/* Nearby donor facility */}
              <div className="space-y-1">
                <label className="text-slate-300 font-bold block">Nearby facilities with transferable stock</label>
                {nearbySources.length === 0 ? (
                  <div className="p-3 bg-slate-950 border border-amber-800/80 text-amber-300 rounded-xl text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{stockLoading ? 'Searching nearby facilities…' : 'No active facility has matching stock above its protected minimum for this resource.'}</span>
                  </div>
                ) : (
                  <select
                    value={selectedSourceKey}
                    onChange={(e) => { setSelectedSourceKey(e.target.value); setQuantity(1); }}
                    className="w-full bg-slate-950 border border-slate-800 text-white p-2.5 rounded-xl focus:border-blue-500 focus:outline-none"
                    required
                  >
                    {nearbySources.map((candidate) => (
                      <option key={candidate.key} value={candidate.key}>
                        {candidate.hospital_name} · {candidate.district} · {candidate.distance_km == null ? 'distance unavailable' : `${candidate.distance_km} km`} · {candidate.resource_name}: {candidate.transferable_quantity} {candidate.unit} · {getResourceFreshness(candidate.last_reported_at, freshnessCategory)}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[10px] text-slate-500">Your assigned hospital receives the request. Facilities are ranked nearest first; records without coordinates appear only when Any distance is selected.</p>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-bold block">Selected item</label>
                <div className="w-full bg-slate-950 border border-slate-800 text-slate-200 p-2.5 rounded-xl min-h-10">{selectedStock?.resource_name || 'No nearby item available'}</div>
              </div>
              {stockLoading ? <p className="text-[10px] text-slate-400">Checking nearby stock…</p> : stockError ? <p className="text-[10px] text-rose-300">{stockError}</p> : selectedStock ? (
                <div className="space-y-1">
                  <p className="text-[10px] text-amber-300">Your hospital is receiving. Up to {selectedStock.transferable_quantity} {selectedStock.unit} is releasable at this donor. This is a synthetic prototype record.</p>
                  <p className={`text-[10px] ${selectedStockFreshness === 'Fresh' ? 'text-emerald-300' : 'text-amber-300'}`}>
                    Inventory report: {selectedStockFreshness} · {selectedStock.last_reported_at ? new Date(selectedStock.last_reported_at).toLocaleString() : 'update time unknown'}
                  </p>
                  {selectedStockFreshness !== 'Fresh' && (
                    <p className="text-[10px] text-amber-200">Confirm the donor’s current stock directly before approval. The database rechecks its recorded quantity but cannot verify physical inventory.</p>
                  )}
                </div>
              ) : <p className="text-[10px] text-amber-300">No unique inventory item has stock above its protected minimum within the selected distance range.</p>}

              {/* Quantity */}
              <div className="space-y-1">
                <label className="text-slate-300 font-bold block">Transfer Quantity</label>
                <input
                  type="number"
                  min="1"
                  max={selectedStock?.transferable_quantity || undefined}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-slate-950 border border-slate-800 text-white p-2.5 rounded-xl focus:border-blue-500 focus:outline-none font-mono"
                  required
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
                  disabled={submitting || nearbySources.length === 0 || stockLoading || !selectedStock || quantity > (selectedStock?.transferable_quantity || 0)}
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
                      {t.approved_quantity ?? t.quantity}
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
                      <div className="flex flex-col items-end gap-2 font-sans">
                        <div className="flex items-center justify-end gap-1">
                          {t.status === 'Completed' ? (
                            <span className="text-emerald-400 text-[10px] font-bold flex items-center gap-1 justify-end">
                              <CheckCircle2 className="w-3 h-3" /> Completed
                            </span>
                          ) : userProfile?.role === 'hospital_approver' && isSource && t.status === 'Pending' ? (
                            <>
                              <button
                                onClick={() => handleStatusChange(t.transfer_id, 'Approved')}
                                disabled={transitioningTransferId !== null}
                                className="text-emerald-300 hover:text-emerald-200 disabled:opacity-50 font-bold inline-flex items-center gap-1"
                              ><CheckCircle2 className="w-3 h-3" />Approve</button>
                              <button
                                onClick={() => handleStatusChange(t.transfer_id, 'Rejected')}
                                disabled={transitioningTransferId !== null}
                                className="text-rose-300 hover:text-rose-200 disabled:opacity-50 font-bold inline-flex items-center gap-1"
                              ><XCircle className="w-3 h-3" />Reject</button>
                            </>
                          ) : userProfile?.role === 'hospital_admin' && isSource && t.status === 'Approved' ? (
                            <button onClick={() => handleStatusChange(t.transfer_id, 'In Transit')} className="text-amber-300 hover:text-amber-200 font-bold inline-flex items-center gap-1"><Truck className="w-3 h-3"/>Record simulated handoff</button>
                          ) : userProfile?.role === 'hospital_admin' && isDest && t.status === 'In Transit' ? (
                            <button onClick={() => handleStatusChange(t.transfer_id, 'Completed')} className="text-emerald-300 hover:text-emerald-200 font-bold inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/>Record simulated receipt</button>
                          ) : <span className="text-slate-500 text-[10px]">Awaiting authorized action</span>}
                        </div>
                        <ResourceTransferTimeline transferId={t.transfer_id} />
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
