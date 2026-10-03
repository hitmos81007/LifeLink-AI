import { supabase } from '../lib/supabase/client';
import {
  BloodBankTable,
  BloodInventoryTable,
  BloodGroup
} from '../types/database';

export async function getBloodBanks(): Promise<BloodBankTable[]> {
  try {
    const { data, error } = await supabase.from('blood_banks').select('*');
    if (!error && data) {
      return data as BloodBankTable[];
    }
  } catch (err) {
    console.warn('getBloodBanks error:', err);
  }
  return [];
}

export async function getBloodBankById(id: string): Promise<BloodBankTable | null> {
  try {
    const { data, error } = await supabase
      .from('blood_banks')
      .select('*')
      .eq('blood_bank_id', id)
      .single();
    if (!error && data) {
      return data as BloodBankTable;
    }
  } catch (err) {
    console.warn('getBloodBankById error:', err);
  }
  return null;
}

export async function getBloodInventoryList(bloodBankId?: string): Promise<BloodInventoryTable[]> {
  let query = supabase.from('blood_inventory').select('*');
  if (bloodBankId) {
    query = query.eq('blood_bank_id', bloodBankId);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch blood inventory: ${error.message}`);
  }
  return (data || []) as BloodInventoryTable[];
}

export async function saveBloodInventoryItem(data: {
  blood_bank_id: string;
  blood_group: BloodGroup;
  available_units: number;
  reserved_units: number;
  expired_units: number;
  minimum_threshold: number;
  last_restocked?: string | null;
}): Promise<BloodInventoryTable> {
  // Query if record exists for this blood_bank_id and blood_group
  const { data: existing, error: queryErr } = await supabase
    .from('blood_inventory')
    .select('*')
    .eq('blood_bank_id', data.blood_bank_id)
    .eq('blood_group', data.blood_group)
    .maybeSingle();

  if (queryErr) {
    throw new Error(`Failed to query blood inventory: ${queryErr.message}`);
  }

  const now = new Date().toISOString();
  const restockedDate = data.last_restocked || now;

  if (existing) {
    // Attempt update with compatible payload
    let updatedRow: any = null;
    let updateErr: any = null;

    // Primary attempt: include both available_units and available_quantity for schema compatibility
    const res = await supabase
      .from('blood_inventory')
      .update({
        available_units: data.available_units,
        available_quantity: data.available_units,
        reserved_units: data.reserved_units,
        expired_units: data.expired_units,
        minimum_threshold: data.minimum_threshold,
        last_restocked: restockedDate,
        updated_at: now
      })
      .eq('inventory_id', existing.inventory_id)
      .select()
      .maybeSingle();

    if (res.error) {
      // Fallback 1: Attempt update with standard available_units only
      const fallbackRes1 = await supabase
        .from('blood_inventory')
        .update({
          available_units: data.available_units,
          reserved_units: data.reserved_units,
          expired_units: data.expired_units,
          minimum_threshold: data.minimum_threshold,
          last_restocked: restockedDate,
          updated_at: now
        })
        .eq('inventory_id', existing.inventory_id)
        .select()
        .maybeSingle();

      if (fallbackRes1.error) {
        // Fallback 2: Attempt update with available_quantity only
        const fallbackRes2 = await supabase
          .from('blood_inventory')
          .update({
            available_quantity: data.available_units,
            reserved_units: data.reserved_units,
            expired_units: data.expired_units,
            minimum_threshold: data.minimum_threshold,
            last_restocked: restockedDate,
            updated_at: now
          })
          .eq('inventory_id', existing.inventory_id)
          .select()
          .maybeSingle();

        if (fallbackRes2.error) {
          updateErr = fallbackRes2.error;
        } else {
          updatedRow = fallbackRes2.data;
        }
      } else {
        updatedRow = fallbackRes1.data;
      }
    } else {
      updatedRow = res.data;
    }

    if (updateErr || !updatedRow) {
      throw new Error(`Failed to update blood inventory: ${updateErr?.message || 'Database error'}`);
    }

    if (data.available_units < data.minimum_threshold) {
      try {
        const { getGovernmentUserIds, notifyUsers } = await import('./notificationService');
        const govUsers = await getGovernmentUserIds();
        await notifyUsers(
          govUsers,
          `LOW BLOOD STOCK ALERT: ${data.blood_group}`,
          `Blood bank inventory for ${data.blood_group} has fallen to ${data.available_units} units (Minimum threshold: ${data.minimum_threshold}).`,
          'Critical'
        );
      } catch (e) {
        console.warn('Low blood notification notice:', e);
      }
    }

    // Normalize output structure
    const normalized: BloodInventoryTable = {
      ...updatedRow,
      available_units: updatedRow.available_units ?? updatedRow.available_quantity ?? data.available_units
    };

    return normalized;
  } else {
    // Insert new row for this blood group
    let insertedRow: any = null;
    let insertErr: any = null;

    const res = await supabase
      .from('blood_inventory')
      .insert([{
        blood_bank_id: data.blood_bank_id,
        blood_group: data.blood_group,
        available_units: data.available_units,
        available_quantity: data.available_units,
        reserved_units: data.reserved_units,
        expired_units: data.expired_units,
        minimum_threshold: data.minimum_threshold,
        last_restocked: restockedDate,
        created_at: now,
        updated_at: now
      }])
      .select()
      .maybeSingle();

    if (res.error) {
      // Fallback 1: without available_quantity
      const fallbackRes1 = await supabase
        .from('blood_inventory')
        .insert([{
          blood_bank_id: data.blood_bank_id,
          blood_group: data.blood_group,
          available_units: data.available_units,
          reserved_units: data.reserved_units,
          expired_units: data.expired_units,
          minimum_threshold: data.minimum_threshold,
          last_restocked: restockedDate,
          created_at: now,
          updated_at: now
        }])
        .select()
        .maybeSingle();

      if (fallbackRes1.error) {
        // Fallback 2: with available_quantity only
        const fallbackRes2 = await supabase
          .from('blood_inventory')
          .insert([{
            blood_bank_id: data.blood_bank_id,
            blood_group: data.blood_group,
            available_quantity: data.available_units,
            reserved_units: data.reserved_units,
            expired_units: data.expired_units,
            minimum_threshold: data.minimum_threshold,
            last_restocked: restockedDate,
            created_at: now,
            updated_at: now
          }])
          .select()
          .maybeSingle();

        if (fallbackRes2.error) {
          insertErr = fallbackRes2.error;
        } else {
          insertedRow = fallbackRes2.data;
        }
      } else {
        insertedRow = fallbackRes1.data;
      }
    } else {
      insertedRow = res.data;
    }

    if (insertErr || !insertedRow) {
      throw new Error(`Failed to insert blood inventory: ${insertErr?.message || 'Database error'}`);
    }

    const normalized: BloodInventoryTable = {
      ...insertedRow,
      available_units: insertedRow.available_units ?? insertedRow.available_quantity ?? data.available_units
    };

    return normalized;
  }
}

export async function updateBloodInventoryUnits(
  inventoryId: string,
  availableUnits: number,
  reservedUnits: number = 0,
  expiredUnits: number = 0
): Promise<BloodInventoryTable> {
  const now = new Date().toISOString();
  
  let updatedRow: any = null;
  let updateErr: any = null;

  const res = await supabase
    .from('blood_inventory')
    .update({
      available_units: availableUnits,
      available_quantity: availableUnits,
      reserved_units: reservedUnits,
      expired_units: expiredUnits,
      last_restocked: now,
      updated_at: now
    })
    .eq('inventory_id', inventoryId)
    .select()
    .maybeSingle();

  if (res.error) {
    const fallbackRes = await supabase
      .from('blood_inventory')
      .update({
        available_units: availableUnits,
        reserved_units: reservedUnits,
        expired_units: expiredUnits,
        last_restocked: now,
        updated_at: now
      })
      .eq('inventory_id', inventoryId)
      .select()
      .maybeSingle();

    if (fallbackRes.error) {
      updateErr = fallbackRes.error;
    } else {
      updatedRow = fallbackRes.data;
    }
  } else {
    updatedRow = res.data;
  }

  if (updateErr || !updatedRow) {
    throw new Error(`Failed to update blood inventory: ${updateErr?.message || 'Database error'}`);
  }

  const normalized: BloodInventoryTable = {
    ...updatedRow,
    available_units: updatedRow.available_units ?? updatedRow.available_quantity ?? availableUnits
  };

  return normalized;
}

