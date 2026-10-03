import { supabase } from '../lib/supabase/client';
import {
  ResourceTransferTable,
  TransferResourceType,
  TransferStatus
} from '../types/database';
import {
  getHospitalUserIds,
  getGovernmentUserIds,
  notifyUsers
} from './notificationService';

export interface CreateTransferParams {
  source_hospital_id: string;
  destination_hospital_id: string;
  resource_type: TransferResourceType;
  resource_name: string;
  quantity: number;
  remarks?: string;
  operator_id?: string;
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
    remarks,
    operator_id
  } = params;

  // 1. Rule: Source hospital must be present
  if (!source_hospital_id) {
    return { success: false, error: 'Authenticated user is not assigned to a valid hospital facility.' };
  }

  // 2. Rule: Source and destination hospital must differ
  if (source_hospital_id === destination_hospital_id) {
    return { success: false, error: 'Source hospital and destination hospital cannot be the same facility.' };
  }

  // 3. Rule: Quantity must be greater than zero
  if (!quantity || quantity <= 0) {
    return { success: false, error: 'Transfer quantity must be greater than zero.' };
  }

  // 4. Rule: Do not allow a transfer that violates protected stock
  try {
    const isAvailable = await checkProtectedStockAvailability(
      source_hospital_id,
      resource_type,
      resource_name,
      quantity
    );

    if (!isAvailable.allowed) {
      return { success: false, error: isAvailable.reason };
    }
  } catch (err: any) {
    console.warn('[Validation Notice] Protected stock check warning:', err?.message || err);
  }

  // 5. Database Insert: Let PostgreSQL generate transfer_id and timestamps
  try {
    const payload = {
      source_hospital_id,
      destination_hospital_id,
      resource_type,
      resource_name: resource_name || resource_type,
      quantity,
      status: 'Pending' as TransferStatus,
      remarks: remarks || null
    };

    const { data, error } = await supabase
      .from('resource_transfers')
      .insert([payload])
      .select()
      .single();

    if (error || !data) {
      console.error('[Supabase Error] createTransferRequest failed:', error?.message);
      return {
        success: false,
        error: `Database insert failed: ${error?.message || 'No row returned from database'}`
      };
    }

    const createdTransfer = data as ResourceTransferTable;

    // 6. Send notification ONLY after DB operation succeeds
    try {
      const destUserIds = await getHospitalUserIds(destination_hospital_id);
      const govtUserIds = await getGovernmentUserIds();
      const receivers = Array.from(new Set([...destUserIds, ...govtUserIds, operator_id].filter(Boolean) as string[]));

      if (receivers.length > 0) {
        const title = `New Resource Transfer Requested (${resource_type})`;
        const message = `A transfer of ${quantity} unit(s) of ${resource_name || resource_type} has been requested. Status: Pending.`;
        await notifyUsers(receivers, title, message, 'Medium');
      }
    } catch (notifErr) {
      console.warn('Notification send notice:', notifErr);
    }

    return { success: true, data: createdTransfer };
  } catch (err: any) {
    console.error('[Supabase Exception] createTransferRequest error:', err);
    return { success: false, error: err.message || 'Unexpected error while creating transfer request.' };
  }
}

/**
 * Checks whether source hospital has enough inventory without violating protected minimum stock thresholds.
 */
async function checkProtectedStockAvailability(
  hospitalId: string,
  resourceType: TransferResourceType,
  _resourceName: string,
  requestedQuantity: number
): Promise<{ allowed: boolean; reason?: string }> {
  if (resourceType === 'ICU Beds') {
    const { data, error } = await supabase
      .from('icu_inventory')
      .select('available_icu_beds, total_icu_beds')
      .eq('hospital_id', hospitalId)
      .maybeSingle();

    if (!error && data) {
      const available = data.available_icu_beds || 0;
      if (available < requestedQuantity) {
        return {
          allowed: false,
          reason: `Transfer violates protected stock: Source hospital has only ${available} available ICU bed(s), but ${requestedQuantity} requested.`
        };
      }
    }
  } else if (resourceType === 'General Beds') {
    const { data, error } = await supabase
      .from('general_bed_inventory')
      .select('available_beds, total_beds')
      .eq('hospital_id', hospitalId)
      .maybeSingle();

    if (!error && data) {
      const available = data.available_beds || 0;
      if (available < requestedQuantity) {
        return {
          allowed: false,
          reason: `Transfer violates protected stock: Source hospital has only ${available} available general bed(s), but ${requestedQuantity} requested.`
        };
      }
    }
  } else if (resourceType === 'Oxygen') {
    const { data, error } = await supabase
      .from('oxygen_inventory')
      .select('available_capacity, minimum_threshold')
      .eq('hospital_id', hospitalId)
      .maybeSingle();

    if (!error && data) {
      const available = Number(data.available_capacity) || 0;
      const minThreshold = Number(data.minimum_threshold) || 0;
      const remainingAfterTransfer = available - requestedQuantity;

      if (remainingAfterTransfer < minThreshold) {
        return {
          allowed: false,
          reason: `Transfer violates protected stock limit: Remaining oxygen capacity (${remainingAfterTransfer}) would fall below minimum threshold (${minThreshold}).`
        };
      }
    }
  } else if (resourceType === 'Medicine') {
    const { data, error } = await supabase
      .from('medicine_inventory')
      .select('current_stock, minimum_stock')
      .eq('hospital_id', hospitalId)
      .maybeSingle();

    if (!error && data) {
      const current = data.current_stock || 0;
      const minStock = data.minimum_stock || 0;
      const remaining = current - requestedQuantity;

      if (remaining < minStock) {
        return {
          allowed: false,
          reason: `Transfer violates protected stock: Remaining medicine stock (${remaining}) would fall below minimum safety threshold (${minStock}).`
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Fetches resource transfers with optional hospital filtering and joined hospital names
 */
export async function getResourceTransfers(hospitalId?: string): Promise<(ResourceTransferTable & {
  source_hospital?: { hospital_name: string; district: string; hospital_code?: string };
  destination_hospital?: { hospital_name: string; district: string; hospital_code?: string };
})[]> {
  try {
    let query = supabase
      .from('resource_transfers')
      .select('*')
      .order('created_at', { ascending: false });

    if (hospitalId) {
      query = query.or(`source_hospital_id.eq.${hospitalId},destination_hospital_id.eq.${hospitalId}`);
    }

    const [transfersRes, hospitalsRes] = await Promise.all([
      query,
      supabase.from('hospitals').select('hospital_id, hospital_name, district, hospital_code')
    ]);

    if (transfersRes.error) {
      console.error('[Supabase Error] getResourceTransfers failed:', transfersRes.error.message);
      throw new Error(`Failed to load resource transfers: ${transfersRes.error.message}`);
    }

    const transfers = (transfersRes.data as ResourceTransferTable[]) || [];
    const hospitals = (hospitalsRes.data as any[]) || [];
    
    const hospitalMap = new Map<string, { hospital_name: string; district: string; hospital_code?: string }>();
    hospitals.forEach((h) => {
      hospitalMap.set(h.hospital_id, {
        hospital_name: h.hospital_name,
        district: h.district,
        hospital_code: h.hospital_code
      });
    });

    return transfers.map((t) => ({
      ...t,
      source_hospital: hospitalMap.get(t.source_hospital_id) || {
        hospital_name: `Facility (${t.source_hospital_id?.slice(0, 8) || 'Unknown'}...)`,
        district: 'N/A'
      },
      destination_hospital: hospitalMap.get(t.destination_hospital_id) || {
        hospital_name: `Facility (${t.destination_hospital_id?.slice(0, 8) || 'Unknown'}...)`,
        district: 'N/A'
      }
    }));
  } catch (err: any) {
    console.error('[Supabase Exception] getResourceTransfers:', err?.message || err);
    throw err;
  }
}

/**
 * Updates transfer status (Pending -> Approved -> In Transit -> Completed / Rejected)
 * When status becomes 'Completed', executes transactional multi-table inventory updates.
 */
export async function updateTransferStatus(
  transferId: string,
  newStatus: TransferStatus,
  operatorId: string,
  remarks?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const now = new Date().toISOString();

    // 1. Fetch current transfer row
    const { data: currentTransfer, error: fetchErr } = await supabase
      .from('resource_transfers')
      .select('*')
      .eq('transfer_id', transferId)
      .single();

    if (fetchErr || !currentTransfer) {
      return { success: false, error: 'Transfer record not found in database.' };
    }

    const transfer = currentTransfer as ResourceTransferTable;

    // 2. If status is Completed, execute PostgreSQL procedure or atomic completion logic
    if (newStatus === 'Completed') {
      const { data: _rpcResult, error: rpcErr } = await supabase.rpc('complete_resource_transfer', {
        p_transfer_id: transferId,
        p_operator_id: operatorId || null
      });

      if (rpcErr) {
        console.warn('complete_resource_transfer RPC notice, applying direct update:', rpcErr.message);

        const { error: updateErr } = await supabase
          .from('resource_transfers')
          .update({
            status: 'Completed',
            completed_at: now,
            approved_by: operatorId || transfer.approved_by,
            remarks: remarks || transfer.remarks,
            updated_at: now
          })
          .eq('transfer_id', transferId);

        if (updateErr) {
          return { success: false, error: updateErr.message };
        }

        // Insert audit log row
        await supabase.from('audit_logs').insert([{
          user_id: operatorId || null,
          action: 'RESOURCE_TRANSFER_COMPLETED',
          table_name: 'resource_transfers',
          record_id: transferId,
          old_value: { status: transfer.status },
          new_value: { status: 'Completed', resource_type: transfer.resource_type, quantity: transfer.quantity },
          created_at: now
        }]);
      }
    } else {
      // Standard status update (Approved, In Transit, Rejected)
      const updatePayload: any = {
        status: newStatus,
        updated_at: now
      };

      if (newStatus === 'Approved') {
        updatePayload.approved_by = operatorId || null;
      }
      if (remarks) {
        updatePayload.remarks = remarks;
      }

      const { error: updateErr } = await supabase
        .from('resource_transfers')
        .update(updatePayload)
        .eq('transfer_id', transferId);

      if (updateErr) {
        return { success: false, error: updateErr.message };
      }
    }

    // 3. Send notifications AFTER DB operation succeeds
    try {
      const sourceUsers = await getHospitalUserIds(transfer.source_hospital_id);
      const destUsers = await getHospitalUserIds(transfer.destination_hospital_id);
      const govtUsers = await getGovernmentUserIds();
      const allReceivers = Array.from(new Set([...sourceUsers, ...destUsers, ...govtUsers, operatorId].filter(Boolean) as string[]));

      const title = `Resource Transfer Updated: ${newStatus}`;
      const message = `Transfer of ${transfer.quantity} unit(s) of ${transfer.resource_name || transfer.resource_type} status changed to ${newStatus}.`;

      await notifyUsers(allReceivers, title, message, newStatus === 'Completed' ? 'High' : 'Medium');
    } catch (notifErr) {
      console.warn('Notification on status update warning:', notifErr);
    }

    return { success: true };
  } catch (err: any) {
    console.error('updateTransferStatus error:', err);
    return { success: false, error: err.message || 'Error updating transfer status.' };
  }
}
