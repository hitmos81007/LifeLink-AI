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

type CountResponse = { count: number | null; error: { message: string } | null };

function requireCount(label: string, response: CountResponse): number {
  if (response.error) throw new Error(`Could not load ${label}: ${response.error.message}`);
  if (typeof response.count !== 'number') throw new Error(`Could not load ${label}: Supabase returned no exact count.`);
  return response.count;
}

export async function getGovernmentOverviewMetrics(): Promise<GovernmentOverviewMetrics> {
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
    supabase.from('patient_requests').select('*', { count: 'exact', head: true }).eq('data_origin', 'synthetic'),
    supabase.from('emergency_cases').select('*', { count: 'exact', head: true }),
    supabase.from('resource_transfers').select('*', { count: 'exact', head: true }),
    supabase.from('audit_logs').select('*', { count: 'exact', head: true })
  ]);

  return {
    totalHospitals: requireCount('hospitals', hospitalsRes),
    totalBloodBanks: requireCount('blood banks', bloodBanksRes),
    totalAmbulanceProviders: requireCount('ambulance providers', providersRes),
    totalAmbulances: requireCount('ambulances', ambulancesRes),
    totalPatientRequests: requireCount('synthetic patient requests', requestsRes),
    activeEmergencyCases: requireCount('emergency cases', casesRes),
    totalResourceTransfers: requireCount('resource transfers', transfersRes),
    totalAuditLogs: requireCount('audit logs', auditRes)
  };
}

export interface GovernmentEmergencyCounts {
  pendingPatientRequests: number;
  confirmedEmergencyCases: number;
}

export async function getGovernmentEmergencyCaseCounts(): Promise<GovernmentEmergencyCounts> {
  const { data: rpcCount, error: rpcErr } = await supabase.rpc('get_government_emergency_case_count');
  const reqRes = await supabase
    .from('patient_requests')
    .select('*', { count: 'exact', head: true })
    .eq('data_origin', 'synthetic')
    .eq('status', 'Pending');
  const pendingPatientRequests = requireCount('pending synthetic patient requests', reqRes);

  if (!rpcErr && typeof rpcCount === 'number') {
    return { pendingPatientRequests, confirmedEmergencyCases: rpcCount };
  }

  // A direct, RLS-scoped Supabase count remains an authoritative fallback when
  // the aggregate RPC is unavailable. Query failures must still reach the UI.
  const caseRes = await supabase
    .from('emergency_cases')
    .select('*', { count: 'exact', head: true })
    .eq('confirmation_status', 'confirmed');
  return {
    pendingPatientRequests,
    confirmedEmergencyCases: requireCount('confirmed emergency cases', caseRes)
  };
}

export async function getResourceTransfers(): Promise<ResourceTransferTable[]> {
  const { data, error } = await supabase
    .from('resource_transfers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load resource transfers: ${error.message}`);
  if (!data) throw new Error('Could not load resource transfers: Supabase returned no data.');
  return data as ResourceTransferTable[];
}

export async function getAuditLogs(): Promise<AuditLogTable[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(`Could not load audit logs: ${error.message}`);
  if (!data) throw new Error('Could not load audit logs: Supabase returned no data.');
  return data as AuditLogTable[];
}
