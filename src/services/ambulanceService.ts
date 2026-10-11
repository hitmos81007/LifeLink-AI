import { supabase } from '../lib/supabase/client';
import {
  AmbulanceProviderTable,
  AmbulanceTable,
  AmbulanceStatus,
  AmbulanceType
} from '../types/database';

export async function getAmbulanceProviders(): Promise<AmbulanceProviderTable[]> {
  const { data, error } = await supabase.from('ambulance_providers').select('*');
  if (error) throw new Error(`Failed to fetch ambulance providers: ${error.message}`);
  if (!data) throw new Error('Failed to fetch ambulance providers: Supabase returned no data.');
  return data as AmbulanceProviderTable[];
}

export async function getAmbulanceProviderById(providerId: string): Promise<AmbulanceProviderTable | null> {
  const { data, error } = await supabase
    .from('ambulance_providers')
    .select('*')
    .eq('provider_id', providerId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch linked ambulance provider: ${error.message}`);
  return data as AmbulanceProviderTable | null;
}

export async function getAmbulances(providerId?: string): Promise<AmbulanceTable[]> {
  let query = supabase.from('ambulances').select('*');
  if (providerId) {
    query = query.eq('provider_id', providerId);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch ambulances: ${error.message}`);
  }
  if (!data) throw new Error('Failed to fetch ambulances: Supabase returned no data.');
  return data as AmbulanceTable[];
}

export async function createAmbulance(data: {
  provider_id: string;
  vehicle_number: string;
  ambulance_type: AmbulanceType;
  driver_name: string;
  driver_phone?: string | null;
  current_latitude?: number | null;
  current_longitude?: number | null;
  status: AmbulanceStatus;
}): Promise<AmbulanceTable> {
  if ((data.current_latitude == null) !== (data.current_longitude == null)) {
    throw new Error('Latitude and longitude must both be set or both be empty.');
  }
  const { data: inserted, error } = await supabase.rpc('create_ambulance', {
    p_provider_id: data.provider_id,
    p_vehicle_number: data.vehicle_number.trim().toUpperCase(),
    p_ambulance_type: data.ambulance_type,
    p_driver_name: data.driver_name.trim(),
    p_driver_phone: data.driver_phone?.trim() || null,
    p_current_latitude: data.current_latitude ?? null,
    p_current_longitude: data.current_longitude ?? null,
    p_status: data.status
  });

  if (error || !inserted) {
    throw new Error(`Failed to create ambulance: ${error?.message || 'Database error'}`);
  }

  return inserted as AmbulanceTable;
}

export async function updateAmbulance(
  ambulanceId: string,
  updates: Partial<Pick<AmbulanceTable, 'ambulance_type' | 'driver_name' | 'driver_phone' | 'current_latitude' | 'current_longitude' | 'status' | 'assigned_hospital'>>,
  expectedUpdatedAt?: string
): Promise<AmbulanceTable> {
  const editableFields = [
    'ambulance_type', 'driver_name', 'driver_phone', 'current_latitude',
    'current_longitude', 'status', 'assigned_hospital'
  ] as const;
  const needsCurrentRow = editableFields.some((field) => !Object.prototype.hasOwnProperty.call(updates, field));
  let current: AmbulanceTable | null = null;
  if (needsCurrentRow || !expectedUpdatedAt) {
    const { data, error } = await supabase.from('ambulances').select('*').eq('ambulance_id', ambulanceId).maybeSingle();
    if (error || !data) throw new Error(`Failed to read ambulance before updating: ${error?.message || 'Record not found'}`);
    current = data as AmbulanceTable;
  }
  const value = <K extends typeof editableFields[number]>(field: K): AmbulanceTable[K] =>
    Object.prototype.hasOwnProperty.call(updates, field)
      ? updates[field] as AmbulanceTable[K]
      : current![field];
  const { data, error } = await supabase.rpc('update_ambulance', {
    p_ambulance_id: ambulanceId,
    p_expected_updated_at: expectedUpdatedAt || current!.updated_at,
    p_ambulance_type: value('ambulance_type'),
    p_driver_name: value('driver_name'),
    p_driver_phone: value('driver_phone'),
    p_current_latitude: value('current_latitude'),
    p_current_longitude: value('current_longitude'),
    p_status: value('status'),
    p_assigned_hospital: value('assigned_hospital')
  });

  if (error || !data) {
    throw new Error(`Failed to update ambulance: ${error?.message || 'Database error'}`);
  }

  return data as AmbulanceTable;
}

export async function updateAmbulanceStatus(
  ambulanceId: string,
  status: AmbulanceStatus,
  assignedHospital?: string | null,
  expectedUpdatedAt?: string
): Promise<AmbulanceTable> {
  return updateAmbulance(ambulanceId, {
    status,
    assigned_hospital: assignedHospital || null
  }, expectedUpdatedAt);
}

export async function updateAmbulanceLocation(
  ambulanceId: string,
  latitude: number,
  longitude: number,
  expectedUpdatedAt?: string
): Promise<AmbulanceTable> {
  return updateAmbulance(ambulanceId, {
    current_latitude: latitude,
    current_longitude: longitude
  }, expectedUpdatedAt);
}

