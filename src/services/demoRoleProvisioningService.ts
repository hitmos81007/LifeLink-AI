import { supabase } from '../lib/supabase/client';
import { AppRole } from '../types/roles';

export type DemoProvisionableRole = 'clinician_reviewer' | 'government_admin' | 'hospital_admin' | 'hospital_approver';
export interface DemoRoleAccount {
  user_id: string;
  full_name: string;
  email: string;
  created_at: string;
}
export interface DemoRoleHospital {
  hospital_id: string;
  hospital_name: string;
  district: string;
  state: string;
}
export interface DemoRoleOptions {
  accounts: DemoRoleAccount[];
  hospitals: DemoRoleHospital[];
}
export type SyntheticDemoRegistrationCandidate = DemoRoleAccount;
export interface DemoRoleProvisioningEvent {
  event_id: string;
  user_id: string;
  prior_role: string;
  new_role: string;
  reason: string;
  actor_id: string | null;
  prior_hospital_id: string | null;
  new_hospital_id: string | null;
  created_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function getDemoRoleProvisioningOptions(): Promise<DemoRoleOptions> {
  const { data, error } = await supabase.rpc('get_demo_role_provisioning_options');
  if (error) throw new Error(`Could not load demo role options: ${error.message}`);
  if (!isRecord(data) || !Array.isArray(data.accounts) || !Array.isArray(data.hospitals)) {
    throw new Error('Demo role options returned an invalid response.');
  }
  const accounts = data.accounts.filter((row): row is DemoRoleAccount => isRecord(row) &&
    typeof row.user_id === 'string' && typeof row.full_name === 'string' &&
    typeof row.email === 'string' && typeof row.created_at === 'string');
  const hospitals = data.hospitals.filter((row): row is DemoRoleHospital => isRecord(row) &&
    typeof row.hospital_id === 'string' && typeof row.hospital_name === 'string' &&
    typeof row.district === 'string' && typeof row.state === 'string');
  if (accounts.length !== data.accounts.length || hospitals.length !== data.hospitals.length) {
    throw new Error('Demo role options included malformed records.');
  }
  return { accounts, hospitals };
}

export async function getSyntheticDemoRegistrationCandidates(): Promise<SyntheticDemoRegistrationCandidate[]> {
  const { data, error } = await supabase.rpc('get_synthetic_demo_registration_candidates');
  if (error) throw new Error(`Could not load accounts to review: ${error.message}`);
  if (!Array.isArray(data)) throw new Error('Synthetic demo registration candidates returned an invalid response.');
  const candidates = data.filter((row): row is SyntheticDemoRegistrationCandidate => isRecord(row) &&
    typeof row.user_id === 'string' && typeof row.full_name === 'string' &&
    typeof row.email === 'string' && typeof row.created_at === 'string');
  if (candidates.length !== data.length) throw new Error('Synthetic demo registration candidates included malformed records.');
  return candidates;
}

export async function registerSyntheticDemoAccount(input: {
  userId: string;
  reason: string;
  confirmedSynthetic: boolean;
}): Promise<void> {
  const reason = input.reason.trim();
  if (!input.userId || input.confirmedSynthetic !== true || reason.length < 3 || reason.length > 500) {
    throw new Error('Select a patient account, confirm it is dedicated synthetic data, and provide a valid reason.');
  }
  const { data, error } = await supabase.rpc('register_synthetic_demo_account', {
    p_user_id: input.userId,
    p_reason: reason,
    p_confirmed_synthetic: true
  });
  if (error) throw new Error(`Synthetic demo account was not registered: ${error.message}`);
  if (!isRecord(data) || data.user_id !== input.userId || data.is_active !== true ||
      !['registered', 'reactivated'].includes(String(data.action))) {
    throw new Error('No verified synthetic account registration was returned. Refresh and verify the account.');
  }
}

export async function getDemoRoleProvisioningHistory(): Promise<DemoRoleProvisioningEvent[]> {
  const { data, error } = await supabase.from('platform_role_provisioning_audit')
    .select('event_id,user_id,prior_role,new_role,reason,actor_id,prior_hospital_id,new_hospital_id,created_at')
    .order('created_at', { ascending: false }).order('event_id', { ascending: false }).limit(50);
  if (error) throw new Error(`Could not load role provisioning history: ${error.message}`);
  if (!Array.isArray(data)) throw new Error('Role provisioning history returned an invalid response.');
  return data as DemoRoleProvisioningEvent[];
}

export async function provisionDemoAccountRole(input: {
  userId: string;
  role: DemoProvisionableRole;
  hospitalId?: string | null;
  reason: string;
}): Promise<void> {
  const reason = input.reason.trim();
  const hospitalRole = input.role === 'hospital_admin' || input.role === 'hospital_approver';
  if (!input.userId || !['clinician_reviewer', 'government_admin', 'hospital_admin', 'hospital_approver'].includes(input.role) ||
      reason.length < 3 || reason.length > 500 ||
      hospitalRole !== Boolean(input.hospitalId)) {
    throw new Error('Choose a confirmed demo account, a permitted role, and a valid reason.');
  }
  const { data, error } = await supabase.rpc('provision_demo_account_role', {
    p_user_id: input.userId,
    p_new_role: input.role,
    p_hospital_id: hospitalRole ? input.hospitalId : null,
    p_reason: reason
  });
  if (error) throw new Error(`Demo role was not provisioned: ${error.message}`);
  if (!isRecord(data) || data.user_id !== input.userId || data.role !== input.role ||
      (hospitalRole && data.hospital_id !== input.hospitalId) ||
      (!hospitalRole && data.hospital_id !== null)) {
    throw new Error('No verified demo role result was returned. Refresh and verify the account role.');
  }
}

export const RESTRICTED_DEMO_ROLES: ReadonlyArray<{ role: DemoProvisionableRole; label: string }> = [
  { role: 'clinician_reviewer', label: 'Clinician Reviewer' },
  { role: 'hospital_admin', label: 'Hospital Admin' },
  { role: 'hospital_approver', label: 'Hospital Approver' },
  { role: 'government_admin', label: 'District Coordinator' }
];

export function isRestrictedDemoRole(role: AppRole): role is DemoProvisionableRole {
  return RESTRICTED_DEMO_ROLES.some((option) => option.role === role);
}
