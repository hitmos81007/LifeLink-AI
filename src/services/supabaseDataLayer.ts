import { supabase } from '../lib/supabase/client';
import {
  Hospital,
  BloodBank,
  Ambulance,
  MedicineStock,
  BloodInventory,
  BloodRequest,
  EmergencyCall,
  HospitalRecommendation
} from '../types/entities';

export interface DataResult<T> {
  data: T | null;
  error: string | null;
}

export interface ListDataResult<T> {
  data: T[];
  error: string | null;
}

// Generic helper function for Supabase operations with error handling
async function handleSupabaseList<T>(
  tableName: string,
  queryModifier?: (query: any) => any
): Promise<ListDataResult<T>> {
  try {
    let query = supabase.from(tableName).select('*');
    if (queryModifier) {
      query = queryModifier(query);
    }
    const { data, error } = await query;
    if (error) {
      console.warn(`Supabase ${tableName} getAll notice:`, error.message);
      return { data: [], error: error.message };
    }
    return { data: (data as T[]) || [], error: null };
  } catch (err: any) {
    console.error(`Supabase ${tableName} getAll error:`, err);
    return { data: [], error: err.message || 'Failed to fetch data' };
  }
}

async function handleSupabaseGetById<T>(
  tableName: string,
  id: string
): Promise<DataResult<T>> {
  try {
    const { data, error } = await supabase.from(tableName).select('*').eq('id', id).single();
    if (error) {
      console.warn(`Supabase ${tableName} getById notice:`, error.message);
      return { data: null, error: error.message };
    }
    return { data: data as T, error: null };
  } catch (err: any) {
    console.error(`Supabase ${tableName} getById error:`, err);
    return { data: null, error: err.message || 'Failed to fetch record' };
  }
}

async function handleSupabaseCreate<T>(
  tableName: string,
  payload: Partial<T>
): Promise<DataResult<T>> {
  try {
    const { data, error } = await supabase.from(tableName).insert([payload as any]).select().single();
    if (error) {
      console.warn(`Supabase ${tableName} create error:`, error.message);
      return { data: null, error: error.message };
    }
    return { data: data as T, error: null };
  } catch (err: any) {
    console.error(`Supabase ${tableName} create error:`, err);
    return { data: null, error: err.message || 'Failed to create record' };
  }
}

async function handleSupabaseUpdate<T>(
  tableName: string,
  id: string,
  updates: Partial<T>
): Promise<DataResult<T>> {
  try {
    const { data, error } = await supabase.from(tableName).update(updates as any).eq('id', id).select().single();
    if (error) {
      console.warn(`Supabase ${tableName} update error:`, error.message);
      return { data: null, error: error.message };
    }
    return { data: data as T, error: null };
  } catch (err: any) {
    console.error(`Supabase ${tableName} update error:`, err);
    return { data: null, error: err.message || 'Failed to update record' };
  }
}

async function handleSupabaseDelete(
  tableName: string,
  id: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase.from(tableName).delete().eq('id', id);
    if (error) {
      console.warn(`Supabase ${tableName} delete notice:`, error.message);
      return { success: false, error: error.message };
    }
    return { success: true, error: null };
  } catch (err: any) {
    console.error(`Supabase ${tableName} delete error:`, err);
    return { success: false, error: err.message || 'Failed to delete record' };
  }
}

// ----------------------------------------------------------------------
// 1. Hospitals Module
// ----------------------------------------------------------------------
export const Hospitals = {
  async getAll(): Promise<ListDataResult<Hospital>> {
    return handleSupabaseList<Hospital>('hospitals');
  },
  async getById(id: string): Promise<DataResult<Hospital>> {
    return handleSupabaseGetById<Hospital>('hospitals', id);
  },
  async create(data: Partial<Hospital>): Promise<DataResult<Hospital>> {
    return handleSupabaseCreate<Hospital>('hospitals', data);
  },
  async update(id: string, data: Partial<Hospital>): Promise<DataResult<Hospital>> {
    return handleSupabaseUpdate<Hospital>('hospitals', id, data);
  },
  async delete(id: string): Promise<{ success: boolean; error: string | null }> {
    return handleSupabaseDelete('hospitals', id);
  }
};

// ----------------------------------------------------------------------
// 2. Blood Banks Module
// ----------------------------------------------------------------------
export const BloodBanks = {
  async getAll(): Promise<ListDataResult<BloodBank>> {
    return handleSupabaseList<BloodBank>('blood_banks');
  },
  async getById(id: string): Promise<DataResult<BloodBank>> {
    return handleSupabaseGetById<BloodBank>('blood_banks', id);
  },
  async create(data: Partial<BloodBank>): Promise<DataResult<BloodBank>> {
    return handleSupabaseCreate<BloodBank>('blood_banks', data);
  },
  async update(id: string, data: Partial<BloodBank>): Promise<DataResult<BloodBank>> {
    return handleSupabaseUpdate<BloodBank>('blood_banks', id, data);
  },
  async delete(id: string): Promise<{ success: boolean; error: string | null }> {
    return handleSupabaseDelete('blood_banks', id);
  }
};

// ----------------------------------------------------------------------
// 3. Ambulances Module
// ----------------------------------------------------------------------
export const Ambulances = {
  async getAll(): Promise<ListDataResult<Ambulance>> {
    return handleSupabaseList<Ambulance>('ambulances');
  },
  async getById(id: string): Promise<DataResult<Ambulance>> {
    return handleSupabaseGetById<Ambulance>('ambulances', id);
  },
  async create(data: Partial<Ambulance>): Promise<DataResult<Ambulance>> {
    return handleSupabaseCreate<Ambulance>('ambulances', data);
  },
  async update(id: string, data: Partial<Ambulance>): Promise<DataResult<Ambulance>> {
    return handleSupabaseUpdate<Ambulance>('ambulances', id, data);
  },
  async delete(id: string): Promise<{ success: boolean; error: string | null }> {
    return handleSupabaseDelete('ambulances', id);
  }
};

// ----------------------------------------------------------------------
// 4. Medicine Inventory Module
// ----------------------------------------------------------------------
export const MedicineInventory = {
  async getAll(): Promise<ListDataResult<MedicineStock>> {
    return handleSupabaseList<MedicineStock>('medicine_inventory');
  },
  async getById(id: string): Promise<DataResult<MedicineStock>> {
    return handleSupabaseGetById<MedicineStock>('medicine_inventory', id);
  },
  async create(data: Partial<MedicineStock>): Promise<DataResult<MedicineStock>> {
    return handleSupabaseCreate<MedicineStock>('medicine_inventory', data);
  },
  async update(id: string, data: Partial<MedicineStock>): Promise<DataResult<MedicineStock>> {
    return handleSupabaseUpdate<MedicineStock>('medicine_inventory', id, data);
  },
  async delete(id: string): Promise<{ success: boolean; error: string | null }> {
    return handleSupabaseDelete('medicine_inventory', id);
  }
};

// ----------------------------------------------------------------------
// 5. Blood Inventory Module
// ----------------------------------------------------------------------
export const BloodInventoryData = {
  async getAll(): Promise<ListDataResult<BloodInventory>> {
    return handleSupabaseList<BloodInventory>('blood_inventory');
  },
  async getById(id: string): Promise<DataResult<BloodInventory>> {
    return handleSupabaseGetById<BloodInventory>('blood_inventory', id);
  },
  async create(data: Partial<BloodInventory>): Promise<DataResult<BloodInventory>> {
    return handleSupabaseCreate<BloodInventory>('blood_inventory', data);
  },
  async update(id: string, data: Partial<BloodInventory>): Promise<DataResult<BloodInventory>> {
    return handleSupabaseUpdate<BloodInventory>('blood_inventory', id, data);
  },
  async delete(id: string): Promise<{ success: boolean; error: string | null }> {
    return handleSupabaseDelete('blood_inventory', id);
  }
};

// ----------------------------------------------------------------------
// 6. Patient Requests Module
// ----------------------------------------------------------------------
export const PatientRequests = {
  async getAll(): Promise<ListDataResult<BloodRequest>> {
    return handleSupabaseList<BloodRequest>('patient_requests');
  },
  async getById(id: string): Promise<DataResult<BloodRequest>> {
    return handleSupabaseGetById<BloodRequest>('patient_requests', id);
  },
  async create(data: Partial<BloodRequest>): Promise<DataResult<BloodRequest>> {
    return handleSupabaseCreate<BloodRequest>('patient_requests', data);
  },
  async update(id: string, data: Partial<BloodRequest>): Promise<DataResult<BloodRequest>> {
    return handleSupabaseUpdate<BloodRequest>('patient_requests', id, data);
  },
  async delete(id: string): Promise<{ success: boolean; error: string | null }> {
    return handleSupabaseDelete('patient_requests', id);
  }
};

// ----------------------------------------------------------------------
// 7. Emergency Cases Module
// ----------------------------------------------------------------------
export const EmergencyCases = {
  async getAll(): Promise<ListDataResult<EmergencyCall>> {
    return handleSupabaseList<EmergencyCall>('emergency_cases');
  },
  async getById(id: string): Promise<DataResult<EmergencyCall>> {
    return handleSupabaseGetById<EmergencyCall>('emergency_cases', id);
  },
  async create(data: Partial<EmergencyCall>): Promise<DataResult<EmergencyCall>> {
    return handleSupabaseCreate<EmergencyCall>('emergency_cases', data);
  },
  async update(id: string, data: Partial<EmergencyCall>): Promise<DataResult<EmergencyCall>> {
    return handleSupabaseUpdate<EmergencyCall>('emergency_cases', id, data);
  },
  async delete(id: string): Promise<{ success: boolean; error: string | null }> {
    return handleSupabaseDelete('emergency_cases', id);
  }
};

// ----------------------------------------------------------------------
// 8. AI Recommendations Module
// ----------------------------------------------------------------------
export const AIRecommendations = {
  async getAll(): Promise<ListDataResult<HospitalRecommendation>> {
    return handleSupabaseList<HospitalRecommendation>('ai_recommendations');
  },
  async getById(id: string): Promise<DataResult<HospitalRecommendation>> {
    return handleSupabaseGetById<HospitalRecommendation>('ai_recommendations', id);
  },
  async create(data: Partial<HospitalRecommendation>): Promise<DataResult<HospitalRecommendation>> {
    return handleSupabaseCreate<HospitalRecommendation>('ai_recommendations', data);
  },
  async update(id: string, data: Partial<HospitalRecommendation>): Promise<DataResult<HospitalRecommendation>> {
    return handleSupabaseUpdate<HospitalRecommendation>('ai_recommendations', id, data);
  },
  async delete(id: string): Promise<{ success: boolean; error: string | null }> {
    return handleSupabaseDelete('ai_recommendations', id);
  }
};

// ----------------------------------------------------------------------
// 9. Real-Time Subscriptions & Notifications System
// ----------------------------------------------------------------------
export function subscribeToSupabaseRealtime(
  tables: string[],
  onDataChange: (tableName: string, payload: any) => void
) {
  const uniqueId = Math.random().toString(36).substring(2, 9);
  const channel = supabase.channel(`public:realtime_${Date.now()}_${uniqueId}`);

  tables.forEach((table) => {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload) => {
        onDataChange(table, payload);
      }
    );
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('Supabase Realtime active for tables:', tables);
    }
  });

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function sendNotification(
  receiverId: string,
  title: string,
  message: string,
  priority: 'Low' | 'Medium' | 'High' | 'Critical' = 'Low'
) {
  try {
    const { error } = await supabase.from('notifications').insert([{
      receiver_id: receiverId,
      title,
      message,
      priority,
      is_read: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }]);
    if (error) {
      console.warn('Supabase notifications insert notice:', error.message);
    }
  } catch (err) {
    console.warn('sendNotification exception:', err);
  }
}

export async function createNotificationRecord(
  title: string,
  message: string,
  type: string = 'INVENTORY_ALERT',
  severity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO',
  facilityId?: string
) {
  const priorityMap: Record<string, 'Low' | 'Medium' | 'High' | 'Critical'> = {
    INFO: 'Low',
    WARNING: 'Medium',
    CRITICAL: 'Critical'
  };

  try {
    const { error } = await supabase.from('notifications').insert([{
      receiver_id: facilityId || '00000000-0000-0000-0000-000000000000',
      title,
      message,
      priority: priorityMap[severity] || 'Low',
      is_read: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }]);
    if (error) {
      console.warn('Supabase notifications table insert notice:', error.message);
    }
  } catch (err) {
    console.warn('Notifications record exception:', err);
  }
}

