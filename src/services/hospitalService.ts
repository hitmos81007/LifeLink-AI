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
  totalBeds: number,
  minimumIcuBeds?: number,
  expectedUpdatedAt?: string | null
): Promise<ICUInventoryTable> {
  const configuredMinimum = minimumIcuBeds ?? 0;
  if (![availableBeds, totalBeds, configuredMinimum].every(Number.isSafeInteger)
      || availableBeds < 0 || totalBeds < 0 || configuredMinimum < 0) {
    throw new Error('ICU bed quantities and minimum must be non-negative whole numbers.');
  }
  if (configuredMinimum > totalBeds) throw new Error('Minimum ICU availability cannot exceed total ICU beds.');
  if (availableBeds > totalBeds) {
    throw new Error(`Available ICU beds (${availableBeds}) cannot exceed Total ICU beds (${totalBeds}).`);
  }
  const { data: savedRow, error } = await supabase.rpc('update_icu_inventory', {
    p_hospital_id: hospitalId,
    p_total_icu_beds: totalBeds,
    p_available_icu_beds: availableBeds,
    p_minimum_icu_beds: configuredMinimum,
    p_expected_updated_at: expectedUpdatedAt ?? null
  });

  if (error) {
    if (error.code === '40001') {
      throw new Error('ICU inventory changed since it was loaded. Refresh the dashboard and reapply your update.');
    }
    console.error('[Supabase Error] update_icu_inventory failed:', error.message);
    throw new Error(`Failed to save ICU inventory: ${error.message}`);
  }
  if (!savedRow || typeof savedRow !== 'object' || Array.isArray(savedRow)) {
    throw new Error('Supabase did not return the saved ICU inventory record.');
  }
  const inventory = savedRow as ICUInventoryTable;
  if (inventory.hospital_id !== hospitalId) {
    throw new Error('The saved ICU inventory does not match the assigned hospital. Refresh and retry.');
  }
  return inventory;
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
  minimum_beds?: number;
  expected_updated_at?: string | null;
  reason_code?: 'routine_count' | 'received_delivery' | 'correction' | 'other' | null;
}): Promise<GeneralBedInventoryTable> {
  // Input validations
  const configuredMinimum = data.minimum_beds ?? 0;
  const quantities = [data.total_beds, data.occupied_beds, data.reserved_beds, data.available_beds, configuredMinimum];
  if (!quantities.every((quantity) => Number.isSafeInteger(quantity) && quantity >= 0)) {
    throw new Error('All general bed quantities and minimum must be non-negative whole numbers.');
  }
  if (data.occupied_beds + data.reserved_beds > data.total_beds) {
    throw new Error(
      `Occupied beds (${data.occupied_beds}) + Reserved beds (${data.reserved_beds}) cannot exceed Total beds (${data.total_beds}).`
    );
  }
  if (configuredMinimum > data.total_beds) {
    throw new Error('Minimum general-bed availability must be between zero and total beds.');
  }

  const { data: savedRow, error } = await supabase.rpc('update_general_bed_inventory', {
    p_hospital_id: data.hospital_id,
    p_total_beds: data.total_beds,
    p_occupied_beds: data.occupied_beds,
    p_minimum_beds: configuredMinimum,
    p_expected_updated_at: data.expected_updated_at ?? null,
    p_reason_code: data.reason_code ?? null
  });

  if (error) {
    if (error.code === '40001') {
      throw new Error('General-bed inventory changed since it was loaded. Refresh the dashboard and reapply your update.');
    }
    console.error('[Supabase Error] update_general_bed_inventory failed:', error.message);
    throw new Error(`Failed to save general-bed inventory: ${error.message}`);
  }
  if (!savedRow || typeof savedRow !== 'object' || Array.isArray(savedRow)) {
    throw new Error('Supabase did not return the saved general-bed inventory record.');
  }

  const inventory = savedRow as GeneralBedInventoryTable;
  if (inventory.hospital_id !== data.hospital_id) {
    throw new Error('The saved inventory does not match the currently selected hospital. Refresh and retry.');
  }
  return inventory;
}

export async function updateGeneralBedInventory(
  hospitalId: string,
  availableBeds: number,
  totalBeds: number,
  minimumBeds = 0
): Promise<GeneralBedInventoryTable> {
  const occupied = Math.max(0, totalBeds - availableBeds);
  return await saveGeneralBedInventory({
    hospital_id: hospitalId,
    total_beds: totalBeds,
    occupied_beds: occupied,
    reserved_beds: 0,
    available_beds: availableBeds,
    minimum_beds: minimumBeds
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
  if (item.minimum_threshold > item.total_capacity) {
    throw new Error('Minimum oxygen threshold cannot exceed total capacity.');
  }
  if (!item.unit?.trim()) {
    throw new Error('Oxygen unit is required (e.g. Cylinders, Liters).');
  }

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

  const { data: savedRow, error: saveErr } = await supabase.rpc('save_oxygen_inventory', {
    p_hospital_id: item.hospital_id,
    p_oxygen_type: item.oxygen_type,
    p_total_capacity: item.total_capacity,
    p_available_capacity: item.available_capacity,
    p_minimum_threshold: item.minimum_threshold,
    p_unit: item.unit.trim(),
    p_oxygen_inventory_id: existing?.oxygen_inventory_id ?? null,
    p_expected_updated_at: existing?.updated_at ?? null
  });

  if (saveErr) {
    if (saveErr.code === '40001') {
      throw new Error('Oxygen inventory changed or was created by another user. Refresh and retry.');
    }
    console.error('[Supabase Error] save_oxygen_inventory failed:', saveErr.message);
    throw new Error(`Failed to save oxygen inventory: ${saveErr.message}`);
  }
  if (!savedRow || typeof savedRow !== 'object' || Array.isArray(savedRow)) {
    throw new Error('Supabase did not return the saved oxygen inventory record.');
  }
  const inventory = savedRow as OxygenInventoryTable;
  if (inventory.hospital_id !== item.hospital_id) {
    throw new Error('The saved oxygen inventory does not match the assigned hospital. Refresh and retry.');
  }
  return inventory;
}

export async function updateOxygenInventoryItem(
  oxygenInventoryId: string,
  updates: {
    oxygen_type?: OxygenType;
    total_capacity?: number;
    available_capacity?: number;
    minimum_threshold?: number;
    unit?: string;
  },
  expectedUpdatedAt: string
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
  if (updates.total_capacity !== undefined && updates.minimum_threshold !== undefined
      && updates.minimum_threshold > updates.total_capacity) {
    throw new Error('Minimum oxygen threshold cannot exceed total capacity.');
  }

  if (updates.total_capacity === undefined || updates.available_capacity === undefined
      || updates.minimum_threshold === undefined || updates.unit === undefined || !updates.oxygen_type) {
    throw new Error('Oxygen type, capacities, minimum threshold and unit are required to save the inventory record.');
  }
  if (!expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
    throw new Error('Refresh oxygen inventory before saving this change.');
  }

  const { data, error } = await supabase.rpc('save_oxygen_inventory', {
    p_hospital_id: null,
    p_oxygen_type: updates.oxygen_type,
    p_total_capacity: updates.total_capacity,
    p_available_capacity: updates.available_capacity,
    p_minimum_threshold: updates.minimum_threshold,
    p_unit: updates.unit.trim(),
    p_oxygen_inventory_id: oxygenInventoryId,
    p_expected_updated_at: expectedUpdatedAt
  });

  if (error) {
    if (error.code === '40001') {
      throw new Error('Oxygen inventory changed since it was loaded. Refresh and reapply your update.');
    }
    console.error('[Supabase Error] save_oxygen_inventory failed:', error.message);
    throw new Error(`Failed to save oxygen inventory: ${error.message}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Supabase did not return the saved oxygen inventory record.');
  }
  return data as OxygenInventoryTable;
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
  if (!Number.isInteger(item.current_stock) || item.current_stock < 0
      || !Number.isInteger(item.minimum_stock) || item.minimum_stock < 0) {
    throw new Error('Medicine stock values must be non-negative whole numbers.');
  }
  if (!item.hospital_id || !item.medicine_name?.trim() || !item.dosage?.trim() || !item.unit?.trim()) {
    throw new Error('Medicine name, dosage, and stock unit are required.');
  }
  const { data, error } = await supabase.rpc('save_medicine_inventory', {
    p_hospital_id: item.hospital_id,
    p_medicine_name: item.medicine_name.trim(),
    p_category: item.category,
    p_dosage: item.dosage.trim(),
    p_manufacturer: item.manufacturer?.trim() || null,
    p_current_stock: item.current_stock,
    p_minimum_stock: item.minimum_stock,
    p_unit: item.unit.trim(),
    p_expiry_date: item.expiry_date || null,
    p_medicine_inventory_id: null,
    p_expected_updated_at: null
  });

  if (error || !data) {
    console.error('[Supabase Error] addMedicineItem failed:', error?.message);
    throw new Error(`Failed to add medicine item: ${error?.message || 'No row returned'}`);
  }

  return data as MedicineInventoryTable;
}

export async function updateMedicineItem(
  medicineInventoryId: string,
  updates: Pick<MedicineInventoryTable, 'medicine_name' | 'category' | 'dosage' | 'manufacturer' | 'current_stock' | 'minimum_stock' | 'unit' | 'expiry_date'>,
  expectedUpdatedAt: string
): Promise<MedicineInventoryTable> {
  if (!medicineInventoryId) throw new Error('Medicine inventory record is required.');
  if (!expectedUpdatedAt) throw new Error('Refresh medicine inventory before saving changes.');
  if (!updates.medicine_name.trim() || !updates.dosage.trim() || !updates.unit.trim()) {
    throw new Error('Medicine name, dosage, and stock unit are required.');
  }
  if (!Number.isInteger(updates.current_stock) || updates.current_stock < 0
      || !Number.isInteger(updates.minimum_stock) || updates.minimum_stock < 0) {
    throw new Error('Medicine stock and minimum values must be non-negative whole numbers.');
  }

  const { data, error } = await supabase.rpc('save_medicine_inventory', {
    p_hospital_id: null,
    p_medicine_name: updates.medicine_name.trim(),
    p_category: updates.category,
    p_dosage: updates.dosage.trim(),
    p_manufacturer: updates.manufacturer?.trim() || null,
    p_current_stock: updates.current_stock,
    p_minimum_stock: updates.minimum_stock,
    p_unit: updates.unit.trim(),
    p_expiry_date: updates.expiry_date || null,
    p_medicine_inventory_id: medicineInventoryId,
    p_expected_updated_at: expectedUpdatedAt
  });

  if (error || !data) {
    if (error?.code === '40001') {
      throw new Error('Medicine inventory changed since it was loaded. Refresh the dashboard and reapply your update.');
    }
    throw new Error(`Failed to update medicine inventory: ${error?.message || 'No row returned'}`);
  }
  return data as MedicineInventoryTable;
}
