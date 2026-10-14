import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Building2,
  CheckCircle2,
  ArrowRightLeft,
  AlertTriangle,
  RefreshCw,
  Clock,
  ShieldCheck,
  Lock,
  Package,
  Layers,
  Info,
  XCircle,
  Truck,
  Bed,
  Phone,
  Check,
  MapPin
} from 'lucide-react';
import { getResourceTransfers, updateTransferStatus } from '../../services/resourceTransferService';
import { getHospitalById } from '../../services/hospitalService';
import { ResourceTransferTable, HospitalTable } from '../../types/database';
import { subscribeToSupabaseRealtime } from '../../services/supabaseDataLayer';
import { LoadingState, ErrorState, EmptyState } from '../common/EmptyState';
import { hasCapability, getRoleDisplayLabel } from '../../types/roles';
import { LeafletEmergencyMap, MapEntity } from '../common/LeafletEmergencyMap';
import { canSourceHospitalReviewTransfer } from '../../services/resourceTransferCompatibility';
import { ResourceTransferTimeline } from '../ResourceTransferTimeline';

export const HospitalApprovalsDashboard: React.FC = () => {
  const { userProfile } = useAuth();
  const [transfers, setTransfers] = useState<any[]>([]);
  const [hospital, setHospital] = useState<HospitalTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [approvalQuantities, setApprovalQuantities] = useState<Record<string, number>>({});

  const userHospitalId = userProfile?.hospital_id || '';
  const isAuthorized = (hasCapability(userProfile?.role, 'review_hospital_approval') || userProfile?.role === 'hospital_approver') && Boolean(userHospitalId);

  const triggerToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [transData, hospData] = await Promise.all([
        userHospitalId ? getResourceTransfers(userHospitalId) : Promise.resolve([]),
        userHospitalId ? getHospitalById(userHospitalId) : Promise.resolve(null)
      ]);

      setTransfers(transData);
      setHospital(hospData);
    } catch (err: any) {
      console.error('Fetch hospital approvals error:', err);
      setError('Failed to load pending hospital transfer approvals.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const unsubscribe = subscribeToSupabaseRealtime(
      ['resource_transfers', 'hospitals'],
      () => fetchData()
    );

    return () => unsubscribe();
  }, [userHospitalId]);

  const handleApproveTransfer = async (transferId: string, requestedQuantity: number) => {
    setProcessingId(transferId);
    try {
      const res = await updateTransferStatus(
        transferId,
        'Approved',
        userProfile?.user_id || '',
        approvalQuantities[transferId] ?? requestedQuantity
      );
      if (!res.success) throw new Error(res.error || 'Failed to approve transfer');
      triggerToast('Prototype transfer record approved. No shipment or dispatch was scheduled.');
      await fetchData();
    } catch (err: any) {
      alert('Approval error: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectTransfer = async (transferId: string) => {
    setProcessingId(transferId);
    try {
      const res = await updateTransferStatus(
        transferId,
        'Rejected',
        userProfile?.user_id || ''
      );
      if (!res.success) throw new Error(res.error || 'Failed to reject transfer');
      triggerToast('Transfer rejected.');
      await fetchData();
    } catch (err: any) {
      alert('Rejection error: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Approved':
        return 'bg-blue-950 text-blue-300 border-blue-700';
      case 'In Transit':
        return 'bg-amber-950 text-amber-300 border-amber-700';
      case 'Completed':
        return 'bg-emerald-950 text-emerald-300 border-emerald-700';
      case 'Rejected':
      case 'Cancelled':
        return 'bg-rose-950 text-rose-300 border-rose-700';
      case 'Pending':
      default:
        return 'bg-indigo-950 text-indigo-300 border-indigo-700';
    }
  };

  const facilityRecords = new Map<string, {
    name: string; district: string; latitude: number | null; longitude: number | null; address: string; phone: string | null;
  }>();
  if (hospital) {
    facilityRecords.set(hospital.hospital_id, {
      name: hospital.hospital_name, district: hospital.district,
      latitude: hospital.latitude, longitude: hospital.longitude,
      address: hospital.address, phone: hospital.phone
    });
  }
  transfers.forEach((transfer) => {
    for (const [id, facility] of [
      [transfer.source_hospital_id, transfer.source_hospital],
      [transfer.destination_hospital_id, transfer.destination_hospital]
    ] as const) {
      if (facility) facilityRecords.set(id, facility);
    }
  });
  const mapEntities: MapEntity[] = Array.from(facilityRecords.entries())
    .filter(([, facility]) => Number.isFinite(facility.latitude) && Number.isFinite(facility.longitude))
    .map(([id, facility]) => ({
      id,
      name: facility.name,
      type: 'hospital',
      location: { lat: facility.latitude as number, lng: facility.longitude as number },
      address: facility.address,
      phone: facility.phone || undefined,
      details: { status: `Recorded facility location${facility.district ? ` • ${facility.district}` : ''}` }
    }));
  const mapCenter: [number, number] | null = hospital && Number.isFinite(hospital.latitude) && Number.isFinite(hospital.longitude)
    ? [hospital.latitude as number, hospital.longitude as number]
    : mapEntities[0] ? [mapEntities[0].location.lat, mapEntities[0].location.lng] : null;

  if (!isAuthorized) return <div className="p-8 text-center text-slate-300">This approvals workspace requires an authorized hospital approver account linked to a hospital.</div>;

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6 rounded-2xl border border-slate-800 shadow-2xl">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border border-emerald-400 text-xs font-bold animate-bounce">
          <CheckCircle2 className="w-5 h-5" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 border border-indigo-500/40 rounded-xl text-indigo-400">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white">Hospital Approvals &amp; Resource Movement Authority</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Designated Authority for Outgoing Resource Shipments, Inter-Facility Transfers &amp; Bed Allocations
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="bg-indigo-950 text-indigo-300 border border-indigo-800 px-2.5 py-1 rounded-lg font-bold">
              Approver: {userProfile?.full_name || 'Hospital Approver'}
            </span>
            <span className="bg-slate-800 text-sky-300 border border-slate-700 px-2.5 py-1 rounded-lg">
              Facility: <strong>{hospital?.hospital_name || 'Metro Regional Trauma Center'}</strong>
            </span>
          </div>
        </div>

        <button
          onClick={fetchData}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl cursor-pointer transition-all flex items-center gap-1.5 text-xs font-bold self-start sm:self-auto"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Sync Approvals</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Transfer Records */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-indigo-400" />
              <span>Inter-Facility Resource Transfers ({transfers.length})</span>
            </h2>
            <span className="text-xs text-slate-400 font-mono">Prototype database inventory records</span>
          </div>

          {loading ? (
            <LoadingState message="Loading hospital transfer records from database..." />
          ) : error ? (
            <ErrorState message={error} onRetry={fetchData} />
          ) : transfers.length === 0 ? (
            <EmptyState
              icon={ArrowRightLeft}
              title="No pending transfer requests."
              description="When inter-hospital resource transfer requests are initiated, they will appear here for formal approval."
            />
          ) : (
            <div className="space-y-4">
              {transfers.map((t) => {
                const isPending = t.status === 'Pending';
                const isApproved = t.status === 'Approved';
                const canReview = canSourceHospitalReviewTransfer(t, userHospitalId);

                return (
                  <div
                    key={t.transfer_id}
                    className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 text-xs"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-400 text-xs">Transfer ID:</span>
                          <span className="font-mono font-bold text-indigo-300 text-xs">{t.transfer_id.slice(0, 16)}...</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadge(t.status)}`}>
                            {t.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Initiated: {new Date(t.created_at).toLocaleString()}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-black text-sky-400 font-mono">{t.approved_quantity ?? t.quantity} Units</span>
                        <span className="text-[11px] text-slate-400 block">{t.resource_name || t.resource_type}</span>
                      </div>
                    </div>

                    {/* Transfer Route */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-500 uppercase font-mono font-bold block">Source</span>
                        <strong className="text-white text-xs">{t.source_hospital?.hospital_name || t.source_hospital_id}</strong>
                      </div>
                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-500 uppercase font-mono font-bold block">Destination</span>
                        <strong className="text-white text-xs">{t.destination_hospital?.hospital_name || t.destination_hospital_id}</strong>
                      </div>
                    </div>

                    <ResourceTransferTimeline transferId={t.transfer_id} />

                    {/* Action Controls */}
                    {canReview && (
                      <div className="flex items-center gap-3 pt-2">
                        <button
                          disabled={processingId === t.transfer_id}
                          onClick={() => handleApproveTransfer(t.transfer_id, t.quantity)}
                          className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md"
                        >
                          <Check className="w-4 h-4" />
                          <span>Approve simulated transfer</span>
                        </button>
                        <label className="text-[10px] text-slate-400 flex flex-col gap-1">Approve quantity
                          <input type="number" min="1" max={t.quantity} value={approvalQuantities[t.transfer_id] ?? t.quantity}
                            onChange={(e) => setApprovalQuantities((old) => ({ ...old, [t.transfer_id]: Math.max(1, Math.min(t.quantity, Number(e.target.value) || 1)) }))}
                            className="w-24 bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono" />
                        </label>
                        <button
                          disabled={processingId === t.transfer_id}
                          onClick={() => handleRejectTransfer(t.transfer_id)}
                          className="px-4 py-2.5 bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {isPending && !canReview && (
                      <p className="pt-2 text-[11px] text-slate-400">Awaiting review by the source hospital approver.</p>
                    )}

                    {isApproved && <p className="pt-2 text-amber-300 text-[11px]">This prototype records an approved quantity hold. It does not arrange transport; any next step must remain within a synthetic demonstration.</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Leaflet GIS Map */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-indigo-400" />
                <span>Inter-Hospital Logistics Map</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Facility coordinates from the Supabase directory. The map does not calculate a route or arrange transport.
              </p>
            </div>

            {mapCenter && mapEntities.length > 0 ? (
              <LeafletEmergencyMap entities={mapEntities} center={mapCenter} zoom={11} height="360px" />
            ) : (
              <div className="h-[360px] rounded-xl border border-slate-800 bg-slate-950 flex items-center justify-center p-6 text-center text-xs text-slate-400">
                No facility coordinates are available in the Supabase directory for these records, so the map is hidden.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
