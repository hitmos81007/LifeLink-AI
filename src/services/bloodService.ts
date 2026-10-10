import { supabase } from '../lib/supabase/client';
import {
  BloodBankTable,
  BloodInventoryTable,
  BloodGroup
} from '../types/database';
import { validateBloodStockCounts } from './bloodInventoryUtils';

export async function getBloodBanks(): Promise<BloodBankTable[]> {
  const { data, error } = await supabase.from('blood_banks').select('*');
  if (error) throw new Error(`Failed to fetch blood banks: ${error.message}`);
  if (!data) throw new Error('Failed to fetch blood banks: Supabase returned no data.');
  return data as BloodBankTable[];
}

export async function getBloodBankById(id: string): Promise<BloodBankTable | null> {
  const { data, error } = await supabase
    .from('blood_banks')
    .select('*')
    .eq('blood_bank_id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch blood bank: ${error.message}`);
  return data as BloodBankTable | null;
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
  if (!data) throw new Error('Failed to fetch blood inventory: Supabase returned no data.');
  return data as BloodInventoryTable[];
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
  validateBloodStockCounts(data);
  if (!Number.isSafeInteger(data.minimum_threshold) || data.minimum_threshold < 0) {
    throw new Error('minimum_threshold must be a non-negative whole number.');
  }
  const now = new Date().toISOString();
  const restockedDate = data.last_restocked || now;
  const { data: savedRow, error: saveErr } = await supabase
    .from('blood_inventory')
    .upsert({
      blood_bank_id: data.blood_bank_id,
      blood_group: data.blood_group,
      available_units: data.available_units,
      reserved_units: data.reserved_units,
      expired_units: data.expired_units,
      minimum_threshold: data.minimum_threshold,
      last_restocked: restockedDate,
      updated_at: now
    }, { onConflict: 'blood_bank_id,blood_group' })
    .select()
    .single();

  if (saveErr || !savedRow) {
    throw new Error(`Failed to save blood inventory: ${saveErr?.message || 'Database error'}`);
  }

  return {
    ...savedRow,
    available_units: savedRow.available_units ?? savedRow.available_quantity ?? data.available_units
  } as BloodInventoryTable;
}

export async function updateBloodInventoryUnits(
  inventoryId: string,
  availableUnits: number,
  reservedUnits: number = 0,
  expiredUnits: number = 0
): Promise<BloodInventoryTable> {
  for (const [field, value] of Object.entries({
    available_units: availableUnits,
    reserved_units: reservedUnits,
    expired_units: expiredUnits
  })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${field} must be a non-negative whole number.`);
    }
  }

  if (reservedUnits + expiredUnits > availableUnits) {
    throw new Error('Reserved and expired units together cannot exceed on-hand units.');
  }

  const now = new Date().toISOString();

  const { data: updatedRow, error: updateErr } = await supabase
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

  if (updateErr || !updatedRow) {
    throw new Error(`Failed to update blood inventory: ${updateErr?.message || 'Database error'}`);
  }

  const normalized: BloodInventoryTable = {
    ...updatedRow,
    available_units: updatedRow.available_units ?? updatedRow.available_quantity ?? availableUnits
  };

  return normalized;
}

