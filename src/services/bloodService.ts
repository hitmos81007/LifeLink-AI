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
  inventory_id?: string | null;
  expected_updated_at?: string | null;
}): Promise<BloodInventoryTable> {
  validateBloodStockCounts(data);
  if (!Number.isSafeInteger(data.minimum_threshold) || data.minimum_threshold < 0) {
    throw new Error('minimum_threshold must be a non-negative whole number.');
  }
  if (Boolean(data.inventory_id) !== Boolean(data.expected_updated_at)) {
    throw new Error('Inventory edits require the record version; refresh and retry.');
  }
  const { data: savedRow, error: saveErr } = await supabase.rpc('save_blood_inventory', {
    p_blood_bank_id: data.blood_bank_id,
    p_blood_group: data.blood_group,
    p_available_units: data.available_units,
    p_reserved_units: data.reserved_units,
    p_expired_units: data.expired_units,
    p_minimum_threshold: data.minimum_threshold,
    p_last_restocked: data.last_restocked || null,
    p_inventory_id: data.inventory_id || null,
    p_expected_updated_at: data.expected_updated_at || null
  });

  if (saveErr || !savedRow) {
    throw new Error(`Failed to save blood inventory: ${saveErr?.message || 'Database error'}`);
  }

  return {
    ...savedRow,
    available_units: savedRow.available_units ?? data.available_units
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

  const { data: current, error: readError } = await supabase
    .from('blood_inventory')
    .select('blood_bank_id,blood_group,minimum_threshold,last_restocked,updated_at')
    .eq('inventory_id', inventoryId)
    .maybeSingle();
  if (readError || !current) {
    throw new Error(`Failed to read blood inventory before updating: ${readError?.message || 'Record not found'}`);
  }
  return saveBloodInventoryItem({
    blood_bank_id: current.blood_bank_id,
    blood_group: current.blood_group,
    available_units: availableUnits,
    reserved_units: reservedUnits,
    expired_units: expiredUnits,
    minimum_threshold: current.minimum_threshold,
    last_restocked: new Date().toISOString(),
    inventory_id: inventoryId,
    expected_updated_at: current.updated_at
  });
}

