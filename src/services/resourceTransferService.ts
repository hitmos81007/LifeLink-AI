import { supabase } from '../lib/supabase/client';
import {
  ResourceTransferTable,
  TransferResourceType,
  TransferStatus
} from '../types/database';

export interface CreateTransferParams {
  source_hospital_id: string;
  destination_hospital_id: string;
  resource_type: TransferResourceType;
  resource_name: string;
  quantity: number;
  resource_identity?: {
    resource_type: 'Oxygen' | 'Medicine';
    name: string;
    unit: string | null;
    category?: string | null;
    dosage?: string | null;
    manufacturer?: string | null;
    expiry_date?: string | null;
  } | null;
  operator_id?: string;
  idempotency_key?: string;
}

export interface NearbyTransferSource {
  source_hospital_id: string;
  hospital_name: string;
  hospital_code: string;
  district: string;
  state: string;
  distance_km: number | null;
  resource_type: TransferResourceType;
  resource_name: string;
  resource_identity: Record<string, string | null>;
  transferable_quantity: number;
  unit: string;
  last_reported_at: string | null;
  key: string;
}

export interface ResourceTransferEvent {
  event_id: string;
  transfer_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string;
  quantity: number;
  created_at: string;
}

/**
 * Lists nearby active donor facilities that currently have stock above their
 * protected minimum. The database scopes the search to the authenticated
 * receiving hospital and ranks facilities by straight-line distance.
 */
export async function getNearbyTransferSources(
  resourceType: TransferResourceType,
  maxDistanceKm: number | null = 100
): Promise<NearbyTransferSource[]> {
  const { data, error } = await supabase.rpc('find_nearby_transfer_sources', {
    p_resource_type: resourceType,
    p_max_distance_km: maxDistanceKm
  });
  if (error) throw new Error(`Could not find nearby transfer sources: ${error.message}`);
  return ((data || []) as Omit<NearbyTransferSource, 'key'>[]).map((source) => ({
    ...source,
    distance_km: source.distance_km == null ? null : Number(source.distance_km),
    transferable_quantity: Number(source.transferable_quantity),
    key: `${source.source_hospital_id}:${JSON.stringify(source.resource_identity)}`
  }));
}

/** Creates a need request as the receiving facility; donor approval remains required. */
export async function createInboundTransferRequest(params: {
  source_hospital_id: string;
  resource_type: TransferResourceType;
  resource_name: string;
  resource_identity: Record<string, string | null>;
  quantity: number;
  idempotency_key?: string;
}): Promise<{ success: boolean; data?: ResourceTransferTable; error?: string }> {
  if (!params.source_hospital_id) return { success: false, error: 'Choose a nearby source facility.' };
  if (!Number.isSafeInteger(params.quantity) || params.quantity <= 0) {
    return { success: false, error: 'Transfer quantity must be a positive whole number.' };
  }
  try {
    const { data, error } = await supabase.rpc('request_inbound_resource_transfer', {
      p_source_hospital_id: params.source_hospital_id,
      p_resource_type: params.resource_type,
      p_resource_name: params.resource_name,
      p_quantity: params.quantity,
      p_resource_identity: params.resource_identity,
      p_idempotency_key: params.idempotency_key || crypto.randomUUID()
    });
    if (error || !data) return { success: false, error: error?.message || 'No transfer request was returned.' };
    const created = (Array.isArray(data) ? data[0] : data) as ResourceTransferTable | null;
    if (!created?.transfer_id || created.status !== 'Pending' || created.source_hospital_id !== params.source_hospital_id) {
      return { success: false, error: 'No verified pending inbound transfer was returned. Refresh before continuing.' };
    }
    return { success: true, data: created };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unexpected error while requesting a transfer.' };
  }
}

/**
 * Creates a new resource transfer request after validating constraints and stock availability.
 * Shows success ONLY after a real resource_transfers row is returned from DB.
 * Does not deduct inventory during creation.
 */
export async function createTransferRequest(
  params: CreateTransferParams
): Promise<{ success: boolean; data?: ResourceTransferTable; error?: string }> {
  const {
    source_hospital_id,
    destination_hospital_id,
    resource_type,
    resource_name,
    quantity,
    resource_identity,
    operator_id,
    idempotency_key
  } = params;
  void operator_id; // Notification recipients are resolved by trusted Supabase workflow functions.

  // 1. Rule: Source hospital must be present
  if (!source_hospital_id) {
    return { success: false, error: 'Authenticated user is not assigned to a valid hospital facility.' };
  }

  // 2. Rule: Source and destination hospital must differ
  if (source_hospital_id === destination_hospital_id) {
    return { success: false, error: 'Source hospital and destination hospital cannot be the same facility.' };
  }

  // 3. Rule: Quantity must be greater than zero
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    return { success: false, error: 'Transfer quantity must be a positive whole number.' };
  }

  // Creation authority and source hospital identity are derived from auth.uid() in PostgreSQL.
  try {
    const { data, error } = await supabase.rpc('request_resource_transfer', {
      p_destination_hospital_id: destination_hospital_id,
      p_resource_type: resource_type,
      p_resource_name: resource_name || resource_type,
      p_quantity: quantity,
      p_remarks: null,
      p_idempotency_key: idempotency_key || crypto.randomUUID(),
      p_resource_identity: resource_identity ?? null
    });

    if (error || !data) {
      console.error('[Supabase Error] createTransferRequest failed:', error?.message);
      return {
        success: false,
        error: `Database insert failed: ${error?.message || 'No row returned from database'}`
      };
    }

    const createdTransfer = (Array.isArray(data) ? data[0] : data) as ResourceTransferTable | null;
    if (!createdTransfer?.transfer_id || createdTransfer.status !== 'Pending') {
      return { success: false, error: 'No verified pending transfer row was returned. Refresh and verify before continuing.' };
    }

    return { success: true, data: createdTransfer };
  } catch (err: any) {
    console.error('[Supabase Exception] createTransferRequest error:', err);
    return { success: false, error: err.message || 'Unexpected error while creating transfer request.' };
  }
}

/**
 * Fetches resource transfers with optional hospital filtering and joined hospital names
 */
export async function getResourceTransfers(hospitalId?: string): Promise<(ResourceTransferTable & {
  source_hospital?: { hospital_name: string; district: string; hospital_code?: string; latitude: number | null; longitude: number | null; address: string; phone: string | null };
  destination_hospital?: { hospital_name: string; district: string; hospital_code?: string; latitude: number | null; longitude: number | null; address: string; phone: string | null };
})[]> {
  try {
    // Supabase caps individual reads; page the full history and use a stable tie-breaker
    // so transfers created in the same timestamp are not skipped between pages.
    const pageSize = 500;
    const transfers: ResourceTransferTable[] = [];
    for (let from = 0; ; from += pageSize) {
      let query = supabase
        .from('resource_transfers')
        .select('*')
        .order('created_at', { ascending: false })
        .order('transfer_id', { ascending: false })
        .range(from, from + pageSize - 1);

      if (hospitalId) {
        query = query.or(`source_hospital_id.eq.${hospitalId},destination_hospital_id.eq.${hospitalId}`);
      }

      const transfersRes = await query;
      if (transfersRes.error) {
        console.error('[Supabase Error] getResourceTransfers failed:', transfersRes.error.message);
        throw new Error(`Failed to load resource transfers: ${transfersRes.error.message}`);
      }
      const page = (transfersRes.data as ResourceTransferTable[]) || [];
      transfers.push(...page);
      if (page.length < pageSize) break;
    }

    const hospitalIds = [...new Set(transfers.flatMap((t) => [t.source_hospital_id, t.destination_hospital_id]).filter(Boolean))];
    const hospitalsRes = hospitalIds.length
      ? await supabase.from('hospitals').select('hospital_id, hospital_name, district, hospital_code, latitude, longitude, address, phone').in('hospital_id', hospitalIds)
      : { data: [], error: null };
    if (hospitalsRes.error) {
      console.error('[Supabase Error] getResourceTransfers hospital directory failed:', hospitalsRes.error.message);
      throw new Error(`Failed to load transfer facility details: ${hospitalsRes.error.message}`);
    }

    const hospitals = (hospitalsRes.data as any[]) || [];
    
    const hospitalMap = new Map<string, { hospital_name: string; district: string; hospital_code?: string; latitude: number | null; longitude: number | null; address: string; phone: string | null }>();
    hospitals.forEach((h) => {
      hospitalMap.set(h.hospital_id, {
        hospital_name: h.hospital_name,
        district: h.district,
        hospital_code: h.hospital_code,
        latitude: h.latitude,
        longitude: h.longitude,
        address: h.address,
        phone: h.phone
      });
    });

    return transfers.map((t) => ({
      ...t,
      source_hospital: hospitalMap.get(t.source_hospital_id) || {
        hospital_name: `Facility (${t.source_hospital_id?.slice(0, 8) || 'Unknown'}...)`,
        district: 'N/A', latitude: null, longitude: null, address: '', phone: null
      },
      destination_hospital: hospitalMap.get(t.destination_hospital_id) || {
        hospital_name: `Facility (${t.destination_hospital_id?.slice(0, 8) || 'Unknown'}...)`,
        district: 'N/A', latitude: null, longitude: null, address: '', phone: null
      }
    }));
  } catch (err: any) {
    console.error('[Supabase Exception] getResourceTransfers:', err?.message || err);
    throw err;
  }
}

/** Reads the participant-scoped audit timeline for one transfer. */
export async function getResourceTransferEvents(transferId: string): Promise<ResourceTransferEvent[]> {
  if (!transferId) throw new Error('A transfer ID is required to load its timeline.');
  const { data, error } = await supabase
    .from('resource_transfer_events')
    .select('event_id,transfer_id,event_type,from_status,to_status,quantity,created_at')
    .eq('transfer_id', transferId)
    .order('created_at', { ascending: true })
    .order('event_id', { ascending: true });

  if (error) throw new Error(`Failed to load transfer timeline: ${error.message}`);
  return ((data || []) as ResourceTransferEvent[]).map((event) => ({
    ...event,
    quantity: Number(event.quantity)
  }));
}

/**
 * Updates transfer status (Pending -> Approved -> In Transit -> Completed / Rejected)
 * When status becomes 'Completed', executes transactional multi-table inventory updates.
 */
export async function updateTransferStatus(
  transferId: string,
  newStatus: TransferStatus,
  operatorId: string,
  quantity?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    void operatorId; // Kept for call-site compatibility; the RPC derives actor identity from auth.uid().
    const { data, error } = await supabase.rpc('transition_resource_transfer', {
      p_transfer_id: transferId,
      p_new_status: newStatus,
      p_quantity: quantity ?? null,
      p_remarks: null
    });
    if (error || !data) return { success: false, error: error?.message || 'Transfer transition returned no row.' };
    const transfer = (Array.isArray(data) ? data[0] : data) as ResourceTransferTable | null;
    if (!transfer?.transfer_id || transfer.transfer_id !== transferId || transfer.status !== newStatus) {
      return { success: false, error: 'No verified transfer row with the requested status was returned.' };
    }

    return { success: true };
  } catch (err: any) {
    console.error('updateTransferStatus error:', err);
    return { success: false, error: err.message || 'Error updating transfer status.' };
  }
}
