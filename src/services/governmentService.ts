import { supabase } from '../lib/supabase/client';
import {
  ResourceTransferTable,
  AuditLogTable
} from '../types/database';

export interface GovernmentOverviewMetrics {
  totalHospitals: number;
  totalBloodBanks: number;
  totalAmbulanceProviders: number;
  totalAmbulances: number;
  totalPatientRequests: number;
  activeEmergencyCases: number;
  totalResourceTransfers: number;
  totalAuditLogs: number;
}

export async function getGovernmentOverviewMetrics(): Promise<GovernmentOverviewMetrics> {
  try {
    const [
      hospitalsRes,
      bloodBanksRes,
      providersRes,
      ambulancesRes,
      requestsRes,
      casesRes,
      transfersRes,
      auditRes
    ] = await Promise.all([
      supabase.from('hospitals').select('*', { count: 'exact', head: true }),
      supabase.from('blood_banks').select('*', { count: 'exact', head: true }),
      supabase.from('ambulance_providers').select('*', { count: 'exact', head: true }),
      supabase.from('ambulances').select('*', { count: 'exact', head: true }),
      supabase.from('patient_requests').select('*', { count: 'exact', head: true }),
      supabase.from('emergency_cases').select('*', { count: 'exact', head: true }),
      supabase.from('resource_transfers').select('*', { count: 'exact', head: true }),
      supabase.from('audit_logs').select('*', { count: 'exact', head: true })
    ]);

    return {
      totalHospitals: hospitalsRes.count ?? 0,
      totalBloodBanks: bloodBanksRes.count ?? 0,
      totalAmbulanceProviders: providersRes.count ?? 0,
      totalAmbulances: ambulancesRes.count ?? 0,
      totalPatientRequests: requestsRes.count ?? 0,
      activeEmergencyCases: casesRes.count ?? 0,
      totalResourceTransfers: transfersRes.count ?? 0,
      totalAuditLogs: auditRes.count ?? 0
    };
  } catch (err) {
    console.warn('getGovernmentOverviewMetrics error:', err);
    return {
      totalHospitals: 0,
      totalBloodBanks: 0,
      totalAmbulanceProviders: 0,
      totalAmbulances: 0,
      totalPatientRequests: 0,
      activeEmergencyCases: 0,
      totalResourceTransfers: 0,
      totalAuditLogs: 0
    };
  }
}

export interface GovernmentEmergencyCounts {
  pendingPatientRequests: number;
  confirmedEmergencyCases: number;
}

export async function getGovernmentEmergencyCaseCounts(): Promise<GovernmentEmergencyCounts> {
  try {
    // 1. Try restricted RPC for emergency case counts
    const { data: rpcCount, error: rpcErr } = await supabase.rpc('get_government_emergency_case_count');
    
    // 2. Query pending requests count
    const reqRes = await supabase
      .from('patient_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Pending');

    const pendingCount = reqRes.count ?? 0;
    
    if (!rpcErr && typeof rpcCount === 'number') {
      return {
        pendingPatientRequests: pendingCount,
        confirmedEmergencyCases: rpcCount
      };
    }

    // 3. Direct count query fallback
    const caseRes = await supabase
      .from('emergency_cases')
      .select('*', { count: 'exact', head: true })
      .eq('confirmation_status', 'confirmed');

    return {
      pendingPatientRequests: pendingCount,
      confirmedEmergencyCases: caseRes.count ?? 0
    };
  } catch (err) {
    console.warn('getGovernmentEmergencyCaseCounts exception:', err);
    return {
      pendingPatientRequests: 0,
      confirmedEmergencyCases: 0
    };
  }
}

export async function getResourceTransfers(): Promise<ResourceTransferTable[]> {
  try {
    const { data, error } = await supabase
      .from('resource_transfers')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      return data as ResourceTransferTable[];
    }
  } catch (err) {
    console.warn('getResourceTransfers error:', err);
  }
  return [];
}

export async function getAuditLogs(): Promise<AuditLogTable[]> {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (!error && data) {
      return data as AuditLogTable[];
    }
  } catch (err) {
    console.warn('getAuditLogs error:', err);
  }
  return [];
}
