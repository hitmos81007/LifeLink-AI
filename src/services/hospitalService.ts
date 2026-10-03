import { supabase } from '../lib/supabase/client';
import {
  HospitalTable,
  ICUInventoryTable,
  GeneralBedInventoryTable,
  OxygenInventoryTable,
  MedicineInventoryTable,
  MedicineCategory,
  OxygenType,
  HospitalStatus
} from '../types/database';

export interface HospitalDirectoryItem {
  hospital_id: string;
  hospital_name: string;
  hospital_code: string;
  district: string;
  state: string;
  status: HospitalStatus;
}

/**
 * Fetch active hospitals directory for inter-hospital resource transfer selection.
 * Excludes the current authenticated hospital if specified.
 */
export async function getActiveHospitals(excludeHospitalId?: string): Promise<HospitalDirectoryItem[]> {
  try {
    let query = supabase
      .from('hospitals')
      .select('hospital_id, hospital_name, hospital_code, district, state, status')
      .eq('status', 'Active');

    if (excludeHospitalId) {
      query = query.neq('hospital_id', excludeHospitalId);
    }

    const { data, error } = await query.order('hospital_name', { ascending: true });

    if (error) {
      console.error('[Supabase Error] getActiveHospitals query failed:', error.message);
      throw new Error(`Failed to load active hospitals directory: ${error.message}`);
    }

    return (data as HospitalDirectoryItem[]) || [];
  } catch (err: any) {
    console.error('[Supabase Exception] getActiveHospitals:', err?.message || err);
    throw err;
  }
}

/**
 * Fetch all hospitals list
 */
export async function getHospitals(): Promise<HospitalTable[]> {
  const { data, error } = await supabase
    .from('hospitals')
    .select('*')
    .order('hospital_name', { ascending: true });

  if (error) {
    console.error('[Supabase Error] getHospitals failed:', error.message);
    throw new Error(`Failed to fetch hospitals: ${error.message}`);
  }

  return (data as HospitalTable[]) || [];
}

/**
 * Fetch single hospital by ID
 */
export async function getHospitalById(id: string): Promise<HospitalTable | null> {
  const { data, error } = await supabase
    .from('hospitals')
    .select('*')
    .eq('hospital_id', id)
    .maybeSingle();

  if (error) {
    console.error('[Supabase Error] getHospitalById failed for id:', id, error.message);
    throw new Error(`Failed to fetch hospital: ${error.message}`);
  }

  return (data as HospitalTable) || null;
}

// ============================================================================
// ICU INVENTORY
// ============================================================================

export async function getICUInventory(hospitalId?: string): Promise<ICUInventoryTable | null> {
  let query = supabase.from('icu_inventory').select('*');
  if (hospitalId) {
    query = query.eq('hospital_id', hospitalId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error('[Supabase Error] getICUInventory failed:', error.message);
    throw new Error(`Failed to fetch ICU bed inventory: ${error.message}`);
  }

  return (data as ICUInventoryTable) || null;
}

export async function updateICUInventory(
  hospitalId: string,
  availableBeds: number,
  totalBeds: number
): Promise<ICUInventoryTable> {
  if (availableBeds < 0 || totalBeds < 0) {
    throw new Error('ICU bed quantities must be non-negative.');
  }
  if (availableBeds > totalBeds) {
    throw new Error(`Available ICU beds (${availableBeds}) cannot exceed Total ICU beds (${totalBeds}).`);
  }

  const occupied = Math.max(0, totalBeds - availableBeds);
  const now = new Date().toISOString();

  // 1. Query for existing record
  const { data: existing, error: queryErr } = await supabase
    .from('icu_inventory')
    .select('*')
    .eq('hospital_id', hospitalId)
    .maybeSingle();

  if (queryErr) {
    console.error('[Supabase Error] Querying icu_inventory failed:', queryErr.message);
    throw new Error(`Failed to check existing ICU inventory: ${queryErr.message}`);
  }

  if (existing) {
    // 2. Update existing row by primary key
    const { data: updatedRow, error: updateErr } = await supabase
      .from('icu_inventory')
      .update({
        total_icu_beds: totalBeds,
        occupied_icu_beds: occupied,
        available_icu_beds: availableBeds,
        updated_at: now
      })
      .eq('icu_inventory_id', existing.icu_inventory_id)
      .select()
      .single();

    if (updateErr || !updatedRow) {
      console.error('[Supabase Error] Updating icu_inventory failed:', updateErr?.message);
      throw new Error(`Failed to update ICU inventory: ${updateErr?.message || 'No row returned'}`);
    }

    return updatedRow as ICUInventoryTable;
  }

  // 3. Insert new row (letting PostgreSQL assign UUID)
  const { data: insertedRow, error: insertErr } = await supabase
    .from('icu_inventory')
    .insert([{
      hospital_id: hospitalId,
      total_icu_beds: totalBeds,
      occupied_icu_beds: occupied,
      reserved_icu_beds: 0,
      available_icu_beds: availableBeds,
      created_at: now,
      updated_at: now
    }])
    .select()
    .single();

  if (insertErr || !insertedRow) {
    console.error('[Supabase Error] Inserting icu_inventory failed:', insertErr?.message);
    throw new Error(`Failed to insert ICU inventory: ${insertErr?.message || 'No row returned'}`);
  }

  return insertedRow as ICUInventoryTable;
}

// ============================================================================
// GENERAL BED INVENTORY (PART 2)
// ============================================================================

export async function getGeneralBedInventory(hospitalId?: string): Promise<GeneralBedInventoryTable | null> {
  let query = supabase.from('general_bed_inventory').select('*');
  if (hospitalId) {
    query = query.eq('hospital_id', hospitalId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error('[Supabase Error] getGeneralBedInventory failed:', error.message);
    throw new Error(`Failed to fetch general bed inventory: ${error.message}`);
  }

  return (data as GeneralBedInventoryTable) || null;
}

export async function saveGeneralBedInventory(data: {
  hospital_id: string;
  total_beds: number;
  occupied_beds: number;
  reserved_beds: number;
  available_beds: number;
}): Promise<GeneralBedInventoryTable> {
  // Input validations
  if (data.total_beds < 0 || data.occupied_beds < 0 || data.reserved_beds < 0 || data.available_beds < 0) {
    throw new Error('All general bed quantities must be non-negative (>= 0).');
  }
  if (data.occupied_beds + data.reserved_beds > data.total_beds) {
    throw new Error(
      `Occupied beds (${data.occupied_beds}) + Reserved beds (${data.reserved_beds}) cannot exceed Total beds (${data.total_beds}).`
    );
  }

  const now = new Date().toISOString();

  // 1. Query for the row belonging to users.hospital_id
  const { data: existing, error: queryErr } = await supabase
    .from('general_bed_inventory')
    .select('*')
    .eq('hospital_id', data.hospital_id)
    .maybeSingle();

  if (queryErr) {
    console.error('[Supabase Error] Querying general_bed_inventory failed:', queryErr.message);
    throw new Error(`Failed to query general bed inventory: ${queryErr.message}`);
  }

  if (existing) {
    // 2. If it exists, update it by its real primary key
    const { data: updatedRow, error: updateErr } = await supabase
      .from('general_bed_inventory')
      .update({
        total_beds: data.total_beds,
        occupied_beds: data.occupied_beds,
        reserved_beds: data.reserved_beds,
        available_beds: data.available_beds,
        updated_at: now
      })
      .eq('bed_inventory_id', existing.bed_inventory_id)
      .select()
      .single();

    if (updateErr || !updatedRow) {
      console.error('[Supabase Error] Updating general_bed_inventory failed:', updateErr?.message);
      throw new Error(`Failed to update general bed inventory: ${updateErr?.message || 'No row returned'}`);
    }

    return updatedRow as GeneralBedInventoryTable;
  }

  // 3. If it does not exist, insert it with hospital_id (PostgreSQL generates bed_inventory_id UUID)
  const { data: insertedRow, error: insertErr } = await supabase
    .from('general_bed_inventory')
    .insert([{
      hospital_id: data.hospital_id,
      total_beds: data.total_beds,
      occupied_beds: data.occupied_beds,
      reserved_beds: data.reserved_beds,
      available_beds: data.available_beds,
      created_at: now,
      updated_at: now
    }])
    .select()
    .single();

  if (insertErr || !insertedRow) {
    console.error('[Supabase Error] Inserting general_bed_inventory failed:', insertErr?.message);
    throw new Error(`Failed to insert general bed inventory: ${insertErr?.message || 'No row returned'}`);
  }

  return insertedRow as GeneralBedInventoryTable;
}

export async function updateGeneralBedInventory(
  hospitalId: string,
  availableBeds: number,
  totalBeds: number
): Promise<GeneralBedInventoryTable> {
  const occupied = Math.max(0, totalBeds - availableBeds);
  return await saveGeneralBedInventory({
    hospital_id: hospitalId,
    total_beds: totalBeds,
    occupied_beds: occupied,
    reserved_beds: 0,
    available_beds: availableBeds
  });
}

// ============================================================================
// OXYGEN INVENTORY (PART 3)
// ============================================================================

export async function getOxygenInventory(hospitalId?: string): Promise<OxygenInventoryTable[]> {
  let query = supabase.from('oxygen_inventory').select('*');
  if (hospitalId) {
    query = query.eq('hospital_id', hospitalId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('[Supabase Error] getOxygenInventory failed:', error.message);
    throw new Error(`Failed to fetch oxygen inventory: ${error.message}`);
  }

  return (data as OxygenInventoryTable[]) || [];
}

export async function addOxygenInventoryItem(item: {
  hospital_id: string;
  oxygen_type: OxygenType;
  total_capacity: number;
  available_capacity: number;
  minimum_threshold: number;
  unit: string;
}): Promise<OxygenInventoryTable> {
  // Validations
  if (item.total_capacity < 0 || item.available_capacity < 0 || item.minimum_threshold < 0) {
    throw new Error('Oxygen capacity values and threshold must be non-negative (>= 0).');
  }
  if (item.available_capacity > item.total_capacity) {
    throw new Error(`Available capacity (${item.available_capacity}) cannot exceed Total capacity (${item.total_capacity}).`);
  }
  if (!item.unit?.trim()) {
    throw new Error('Oxygen unit is required (e.g. Cylinders, Liters).');
  }

  const now = new Date().toISOString();

  // 1. Check if an existing record exists for this hospital_id and oxygen_type
  const { data: existing, error: queryErr } = await supabase
    .from('oxygen_inventory')
    .select('*')
    .eq('hospital_id', item.hospital_id)
    .eq('oxygen_type', item.oxygen_type)
    .maybeSingle();

  if (queryErr) {
    console.error('[Supabase Error] Querying oxygen_inventory failed:', queryErr.message);
    throw new Error(`Failed to check existing oxygen inventory: ${queryErr.message}`);
  }

  if (existing) {
    // 2. Update existing record by its real primary key
    const { data: updatedRow, error: updateErr } = await supabase
      .from('oxygen_inventory')
      .update({
        total_capacity: item.total_capacity,
        available_capacity: item.available_capacity,
        minimum_threshold: item.minimum_threshold,
        unit: item.unit.trim(),
        updated_at: now
      })
      .eq('oxygen_inventory_id', existing.oxygen_inventory_id)
      .select()
      .single();

    if (updateErr || !updatedRow) {
      console.error('[Supabase Error] Updating oxygen_inventory failed:', updateErr?.message);
      throw new Error(`Failed to update oxygen inventory: ${updateErr?.message || 'No row returned'}`);
    }

    return updatedRow as OxygenInventoryTable;
  }

  // 3. Insert new record without client-side fake string IDs
  const { data: insertedRow, error: insertErr } = await supabase
    .from('oxygen_inventory')
    .insert([{
      hospital_id: item.hospital_id,
      oxygen_type: item.oxygen_type,
      total_capacity: item.total_capacity,
      available_capacity: item.available_capacity,
      minimum_threshold: item.minimum_threshold,
      unit: item.unit.trim(),
      created_at: now,
      updated_at: now
    }])
    .select()
    .single();

  if (insertErr || !insertedRow) {
    console.error('[Supabase Error] Inserting oxygen_inventory failed:', insertErr?.message);
    throw new Error(`Failed to insert oxygen inventory: ${insertErr?.message || 'No row returned'}`);
  }

  return insertedRow as OxygenInventoryTable;
}

export async function updateOxygenInventoryItem(
  oxygenInventoryId: string,
  updates: {
    oxygen_type?: OxygenType;
    total_capacity?: number;
    available_capacity?: number;
    minimum_threshold?: number;
    unit?: string;
  }
): Promise<OxygenInventoryTable> {
  if (updates.total_capacity !== undefined && updates.total_capacity < 0) {
    throw new Error('Total capacity must be non-negative (>= 0).');
  }
  if (updates.available_capacity !== undefined && updates.available_capacity < 0) {
    throw new Error('Available capacity must be non-negative (>= 0).');
  }
  if (updates.minimum_threshold !== undefined && updates.minimum_threshold < 0) {
    throw new Error('Minimum threshold must be non-negative (>= 0).');
  }
  if (
    updates.total_capacity !== undefined &&
    updates.available_capacity !== undefined &&
    updates.available_capacity > updates.total_capacity
  ) {
    throw new Error(
      `Available capacity (${updates.available_capacity}) cannot exceed Total capacity (${updates.total_capacity}).`
    );
  }

  const now = new Date().toISOString();
  const payload = {
    ...updates,
    unit: updates.unit !== undefined ? updates.unit.trim() : undefined,
    updated_at: now
  };

  const { data, error } = await supabase
    .from('oxygen_inventory')
    .update(payload)
    .eq('oxygen_inventory_id', oxygenInventoryId)
    .select()
    .single();

  if (error || !data) {
    console.error('[Supabase Error] updateOxygenInventoryItem failed:', error?.message);
    throw new Error(`Failed to update oxygen inventory: ${error?.message || 'No row returned'}`);
  }

  const updatedItem = data as OxygenInventoryTable;

  // Trigger alert if low stock
  if (updatedItem.available_capacity <= updatedItem.minimum_threshold) {
    try {
      const { notifyLowStockAlert } = await import('./notificationService');
      await notifyLowStockAlert(
        updatedItem.hospital_id,
        'Oxygen',
        updatedItem.available_capacity,
        updatedItem.minimum_threshold
      );
    } catch (e) {
      console.warn('Oxygen low stock notification warning:', e);
    }
  }

  return updatedItem;
}

// ============================================================================
// MEDICINE INVENTORY
// ============================================================================

export async function getMedicineInventory(hospitalId?: string): Promise<MedicineInventoryTable[]> {
  let query = supabase.from('medicine_inventory').select('*');
  if (hospitalId) {
    query = query.eq('hospital_id', hospitalId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('[Supabase Error] getMedicineInventory failed:', error.message);
    throw new Error(`Failed to fetch medicine inventory: ${error.message}`);
  }

  return (data as MedicineInventoryTable[]) || [];
}

export async function addMedicineItem(item: {
  hospital_id: string;
  medicine_name: string;
  category: MedicineCategory;
  dosage: string;
  manufacturer?: string | null;
  current_stock: number;
  minimum_stock: number;
  unit: string;
  expiry_date?: string | null;
}): Promise<MedicineInventoryTable> {
  if (item.current_stock < 0 || item.minimum_stock < 0) {
    throw new Error('Medicine stock numbers must be non-negative.');
  }
  if (!item.medicine_name?.trim()) {
    throw new Error('Medicine name is required.');
  }

  const now = new Date().toISOString();
  const payload = {
    hospital_id: item.hospital_id,
    medicine_name: item.medicine_name.trim(),
    category: item.category,
    dosage: item.dosage.trim(),
    manufacturer: item.manufacturer || null,
    current_stock: item.current_stock,
    minimum_stock: item.minimum_stock,
    unit: item.unit.trim(),
    expiry_date: item.expiry_date || null,
    created_at: now,
    updated_at: now
  };

  const { data, error } = await supabase
    .from('medicine_inventory')
    .insert([payload])
    .select()
    .single();

  if (error || !data) {
    console.error('[Supabase Error] addMedicineItem failed:', error?.message);
    throw new Error(`Failed to add medicine item: ${error?.message || 'No row returned'}`);
  }

  return data as MedicineInventoryTable;
}
