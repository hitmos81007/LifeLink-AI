import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock, fromMock, reviewHistoryQuery } = vi.hoisted(() => ({
  rpcMock: vi.fn(), fromMock: vi.fn(), reviewHistoryQuery: { limit: vi.fn() as any }
}));
vi.mock('../lib/supabase/client', () => ({ supabase: { rpc: rpcMock, from: fromMock } }));

import {
  getProviderAccountReviewHistory,
  getProviderAccountsForReview,
  reviewProviderAccount
} from '../services/providerAccountService';

describe('platform provider account review client', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
    reviewHistoryQuery.limit.mockReset();
    reviewHistoryQuery.limit.mockResolvedValue({ data: [], error: null });
    fromMock.mockReturnValue({
      select: () => ({
        order: () => ({ order: () => reviewHistoryQuery })
      })
    });
  });
  afterEach(() => vi.clearAllMocks());

  it('loads provider accounts only through the platform review RPC', async () => {
    const rows = [{ user_id: 'u1', account_status: 'pending', provider_name: 'Synthetic Hospital' }];
    rpcMock.mockResolvedValue({ data: rows, error: null });
    await expect(getProviderAccountsForReview()).resolves.toEqual(rows);
    expect(rpcMock).toHaveBeenCalledWith('list_provider_accounts_for_review');
  });

  it('does not accept a malformed account list response', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await expect(getProviderAccountsForReview()).rejects.toThrow('invalid response');
  });

  it('loads review history with a bounded record count', async () => {
    const events = [{ review_id: 'r1', action: 'pending' }];
    reviewHistoryQuery.limit.mockResolvedValue({ data: events, error: null });
    await expect(getProviderAccountReviewHistory()).resolves.toEqual(events);
    expect(fromMock).toHaveBeenCalledWith('provider_account_reviews');
    expect(reviewHistoryQuery.limit).toHaveBeenCalledWith(50);
  });

  it('validates the review reason before calling the database', async () => {
    await expect(reviewProviderAccount('user-1', 'activate', '  ')).rejects.toThrow('review reason');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('requires the returned account and status to match the requested review', async () => {
    rpcMock.mockResolvedValue({ data: { user_id: 'user-1', account_status: 'active' }, error: null });
    await expect(reviewProviderAccount('user-1', 'activate', 'Verified provider details')).resolves.toBeUndefined();
    expect(rpcMock).toHaveBeenCalledWith('review_provider_account', {
      p_user_id: 'user-1', p_decision: 'activate', p_reason: 'Verified provider details'
    });

    rpcMock.mockResolvedValue({ data: { user_id: 'another-user', account_status: 'active' }, error: null });
    await expect(reviewProviderAccount('user-1', 'activate', 'Verified provider details')).rejects.toThrow('verified provider review result');
  });
});
