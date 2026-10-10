import { supabase } from '../lib/supabase/client';

export interface PublicResourceItem {
  type?: string;
  quantity: number | null;
  unit?: string | null;
  updated_at?: string | null;
  availability_status?: 'Available' | 'Critical' | 'Unknown';
  blood_group?: string;
  name?: string;
  category?: string;
  dosage?: string;
}

export interface PublicHospital {
  id: string;
  name: string;
  address: string;
  district: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  hospital_type: string;
  trauma_center: boolean;
  profile_updated_at: string;
  icu_beds: number | null;
  icu_status: 'Available' | 'Critical' | 'Unknown';
  icu_updated_at: string | null;
  general_beds: number | null;
  general_beds_status: 'Available' | 'Critical' | 'Unknown';
  general_beds_updated_at: string | null;
  oxygen: PublicResourceItem[];
  medicines: PublicResourceItem[];
}

export interface PublicBloodBank {
  id: string;
  name: string;
  address: string;
  district: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  profile_updated_at: string;
  stock: Array<PublicResourceItem & { blood_group: string }>;
}

export interface PublicAmbulanceProvider {
  id: string;
  name: string;
  district: string;
  state: string;
  phone: string | null;
  available_units: number;
  availability_status: 'Available' | 'Critical' | 'Unknown';
  approximate_latitude: number | null;
  approximate_longitude: number | null;
  updated_at: string | null;
}

export interface PublicResourceDirectory {
  hospitals: PublicHospital[];
  blood_banks: PublicBloodBank[];
  ambulance_providers: PublicAmbulanceProvider[];
}

export async function getPublicResourceDirectory(): Promise<PublicResourceDirectory> {
  const { data, error } = await supabase.rpc('get_public_resource_directory');
  if (error) {
    const missingRpc = error.code === 'PGRST202'
      || error.code === '42883'
      || /function .*get_public_resource_directory.*(not found|does not exist|schema cache)/i.test(error.message);
    if (missingRpc) {
      throw new Error('The public resource directory is not configured in this Supabase project yet. A project administrator must reconcile the schema and migration history before this feature can be used.');
    }
    throw new Error(`Could not load the public resource directory: ${error.message}`);
  }
  if (!data || typeof data !== 'object') throw new Error('The public resource directory returned no data.');

  const result = data as Partial<PublicResourceDirectory>;
  if (!Array.isArray(result.hospitals) || !Array.isArray(result.blood_banks) || !Array.isArray(result.ambulance_providers)) {
    throw new Error('The public resource directory response is incomplete. Ask a project administrator to check the Supabase schema and migration state.');
  }
  if (result.hospitals.some((hospital) => !Array.isArray(hospital.oxygen) || !Array.isArray(hospital.medicines))
      || result.blood_banks.some((bank) => !Array.isArray(bank.stock))) {
    throw new Error('The public resource directory response does not match the current data contract.');
  }

  return {
    hospitals: result.hospitals,
    blood_banks: result.blood_banks,
    ambulance_providers: result.ambulance_providers
  };
}
