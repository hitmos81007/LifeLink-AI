import { supabase } from '../lib/supabase/client';
import {
  AmbulanceProviderTable,
  AmbulanceTable,
  AmbulanceStatus,
  AmbulanceType
} from '../types/database';

export async function getAmbulanceProviders(): Promise<AmbulanceProviderTable[]> {
  const { data, error } = await supabase.from('ambulance_providers').select('*');
  if (error) {
    console.warn('getAmbulanceProviders error:', error.message);
    return [];
  }
  return (data || []) as AmbulanceProviderTable[];
}

export async function getAmbulanceProviderById(providerId: string): Promise<AmbulanceProviderTable | null> {
  const { data, error } = await supabase
    .from('ambulance_providers')
    .select('*')
    .eq('provider_id', providerId)
    .single();

  if (error) {
    console.warn('getAmbulanceProviderById error:', error.message);
    return null;
  }
  return data as AmbulanceProviderTable;
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
  return (data || []) as AmbulanceTable[];
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
  const now = new Date().toISOString();
  const { data: inserted, error } = await supabase
    .from('ambulances')
    .insert([{
      provider_id: data.provider_id,
      vehicle_number: data.vehicle_number,
      ambulance_type: data.ambulance_type,
      driver_name: data.driver_name,
      driver_phone: data.driver_phone || null,
      current_latitude: data.current_latitude !== undefined && data.current_latitude !== null ? data.current_latitude : null,
      current_longitude: data.current_longitude !== undefined && data.current_longitude !== null ? data.current_longitude : null,
      status: data.status,
      created_at: now,
      updated_at: now
    }])
    .select()
    .single();

  if (error || !inserted) {
    throw new Error(`Failed to create ambulance: ${error?.message || 'Database error'}`);
  }

  return inserted as AmbulanceTable;
}

export async function updateAmbulance(
  ambulanceId: string,
  updates: Partial<Pick<AmbulanceTable, 'vehicle_number' | 'ambulance_type' | 'driver_name' | 'driver_phone' | 'current_latitude' | 'current_longitude' | 'status' | 'assigned_hospital'>>
): Promise<AmbulanceTable> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('ambulances')
    .update({
      ...updates,
      updated_at: now
    })
    .eq('ambulance_id', ambulanceId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update ambulance: ${error?.message || 'Database error'}`);
  }

  return data as AmbulanceTable;
}

export async function updateAmbulanceStatus(
  ambulanceId: string,
  status: AmbulanceStatus,
  assignedHospital?: string | null
): Promise<AmbulanceTable> {
  return updateAmbulance(ambulanceId, {
    status,
    assigned_hospital: assignedHospital || null
  });
}

export async function updateAmbulanceLocation(
  ambulanceId: string,
  latitude: number,
  longitude: number
): Promise<AmbulanceTable> {
  return updateAmbulance(ambulanceId, {
    current_latitude: latitude,
    current_longitude: longitude
  });
}

