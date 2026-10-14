import { supabase } from '../lib/supabase/client';
import { AccountStatus } from '../types/database';

export type ProviderKind = 'hospital' | 'blood_bank' | 'ambulance';
export type ProviderReviewAction = 'pending' | 'activated' | 'suspended' | 'revoked';
export type ProviderDecision = 'activate' | 'suspend' | 'revoke';

export interface ProviderAccountForReview {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  account_status: AccountStatus;
  provider_id: string | null;
  provider_name: string | null;
  district: string | null;
  state: string | null;
  created_at: string;
}

export interface ProviderAccountReviewEvent {
  review_id: string;
  user_id: string;
  provider_kind: ProviderKind;
  provider_id: string | null;
  action: ProviderReviewAction;
  reason: string;
  actor_id: string | null;
  created_at: string;
}

export async function getProviderAccountsForReview(): Promise<ProviderAccountForReview[]> {
  const { data, error } = await supabase.rpc('list_provider_accounts_for_review');
  if (error) throw new Error(`Could not load provider accounts: ${error.message}`);
  if (!Array.isArray(data)) throw new Error('Provider account list returned an invalid response.');
  return data as ProviderAccountForReview[];
}

export async function getProviderAccountReviewHistory(): Promise<ProviderAccountReviewEvent[]> {
  const { data, error } = await supabase
    .from('provider_account_reviews')
    .select('review_id,user_id,provider_kind,provider_id,action,reason,actor_id,created_at')
    .order('created_at', { ascending: false })
    .order('review_id', { ascending: false })
    .limit(50);
  if (error) throw new Error(`Could not load provider review history: ${error.message}`);
  return (data || []) as ProviderAccountReviewEvent[];
}

export async function reviewProviderAccount(
  userId: string,
  decision: ProviderDecision,
  reason: string
): Promise<void> {
  const normalizedReason = reason.trim();
  if (!userId || normalizedReason.length < 3 || normalizedReason.length > 500) {
    throw new Error('Choose a provider and enter a review reason between 3 and 500 characters.');
  }
  const { data, error } = await supabase.rpc('review_provider_account', {
    p_user_id: userId,
    p_decision: decision,
    p_reason: normalizedReason
  });
  if (error) throw new Error(`Provider review was not saved: ${error.message}`);
  if (!data || typeof data !== 'object' || (data as { user_id?: string }).user_id !== userId ||
      (data as { account_status?: string }).account_status !== (decision === 'activate' ? 'active' : decision === 'suspend' ? 'suspended' : 'revoked')) {
    throw new Error('No verified provider review result was returned. Refresh and verify the account status.');
  }
}
