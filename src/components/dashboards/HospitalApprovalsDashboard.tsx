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

export const HospitalApprovalsDashboard: React.FC = () => {
  const { userProfile } = useAuth();
  const [transfers, setTransfers] = useState<any[]>([]);
  const [hospital, setHospital] = useState<HospitalTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const userHospitalId = userProfile?.hospital_id || 'hosp-01';
  const isAuthorized = hasCapability(userProfile?.role, 'review_hospital_approval') || userProfile?.role === 'hospital_approver';

  const triggerToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [transData, hospData] = await Promise.all([
        getResourceTransfers(userHospitalId || undefined),
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

  const handleApproveTransfer = async (transferId: string) => {
    setProcessingId(transferId);
    try {
      const res = await updateTransferStatus(
        transferId,
        'Approved',
        userProfile?.user_id || 'hospital_approver_demo',
        'Approved by designated hospital approver'
      );
      if (!res.success) throw new Error(res.error || 'Failed to approve transfer');
      triggerToast('Inter-facility transfer approved and scheduled for dispatch!');
      await fetchData();
    } catch (err: any) {
      alert('Approval error: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleCompleteTransfer = async (transferId: string) => {
    setProcessingId(transferId);
    try {
      const res = await updateTransferStatus(
        transferId,
        'Completed',
        userProfile?.user_id || 'hospital_approver_demo',
        'Resources received and added to facility inventory'
      );
      if (!res.success) throw new Error(res.error || 'Failed to complete transfer');
      triggerToast('Transfer completed & inventory adjusted!');
      await fetchData();
    } catch (err: any) {
      alert('Completion error: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectTransfer = async (transferId: string) => {
    const reason = prompt('Reason for transfer rejection:', 'Capacity constraints / critical local demand');
    if (!reason) return;

    setProcessingId(transferId);
    try {
      const res = await updateTransferStatus(
        transferId,
        'Rejected',
        userProfile?.user_id || 'hospital_approver_demo',
        reason
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

  const mapEntities: MapEntity[] = [
    {
      id: 'hosp-01',
      name: hospital?.hospital_name || 'Metro Regional Trauma Center',
      type: 'hospital',
      location: { lat: 28.6139, lng: 77.2090 },
      address: hospital?.address || 'Sector 4 Metro Medical Corridor',
      phone: hospital?.phone || '+91-11-2345-0001',
      details: {
        traumaLevel: 'Level 1 Trauma Center',
        icuBeds: 6,
        availableBeds: 35
      }
    },
    {
      id: 'hosp-02',
      name: 'St. Jude Super-Specialty Hospital',
      type: 'hospital',
      location: { lat: 28.6300, lng: 77.2250 },
      address: 'South District Ring Road',
      phone: '+91-11-2345-0002',
      details: {
        traumaLevel: 'Level 2 Center',
        icuBeds: 3,
        availableBeds: 20
      }
    }
  ];

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
            <span className="text-xs text-slate-400 font-mono">Live Inventory Impact</span>
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
                        <span className="text-sm font-black text-sky-400 font-mono">{t.quantity} Units</span>
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

                    {t.remarks && (
                      <p className="text-slate-300 bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-[11px]">
                        <strong>Medical Urgency / Remarks:</strong> {t.remarks}
                      </p>
                    )}

                    {/* Action Controls */}
                    {isPending && (
                      <div className="flex items-center gap-3 pt-2">
                        <button
                          disabled={processingId === t.transfer_id}
                          onClick={() => handleApproveTransfer(t.transfer_id)}
                          className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md"
                        >
                          <Check className="w-4 h-4" />
                          <span>Approve &amp; Schedule Shipment</span>
                        </button>
                        <button
                          disabled={processingId === t.transfer_id}
                          onClick={() => handleRejectTransfer(t.transfer_id)}
                          className="px-4 py-2.5 bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {isApproved && (
                      <div className="pt-2">
                        <button
                          disabled={processingId === t.transfer_id}
                          onClick={() => handleCompleteTransfer(t.transfer_id)}
                          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Confirm Shipment Delivery &amp; Restock</span>
                        </button>
                      </div>
                    )}
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
                Monitoring regional transfer corridors and logistics routes
              </p>
            </div>

            <LeafletEmergencyMap
              entities={mapEntities}
              center={[28.6139, 77.2090]}
              zoom={13}
              height="360px"
              activeRouteDestinationId="hosp-02"
            />
          </div>
        </div>

      </div>
    </div>
  );
};
