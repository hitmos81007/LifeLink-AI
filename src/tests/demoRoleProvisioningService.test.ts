import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock('../lib/supabase/client', () => ({ supabase: { rpc: rpcMock } }));
import { getDemoRoleProvisioningOptions, getSyntheticDemoRegistrationCandidates, provisionDemoAccountRole, registerSyntheticDemoAccount } from '../services/demoRoleProvisioningService';

describe('restricted demo role provisioning client', () => {
  beforeEach(() => rpcMock.mockReset());

  it('loads only well-formed confirmed-account and hospital options from the privileged RPC', async () => {
    const options = {
      accounts: [{ user_id: 'u1', full_name: 'Synthetic Reviewer', email: 'reviewer@example.invalid', created_at: '2026-10-01T00:00:00Z' }],
      hospitals: [{ hospital_id: 'h1', hospital_name: 'Demo Hospital', district: 'North', state: 'Demo' }]
    };
    rpcMock.mockResolvedValue({ data: options, error: null });
    await expect(getDemoRoleProvisioningOptions()).resolves.toEqual(options);
    expect(rpcMock).toHaveBeenCalledWith('get_demo_role_provisioning_options');
  });

  it('rejects malformed options before rendering them', async () => {
    rpcMock.mockResolvedValue({ data: { accounts: [{ user_id: 'u1' }], hospitals: [] }, error: null });
    await expect(getDemoRoleProvisioningOptions()).rejects.toThrow('malformed records');
  });

  it('loads candidate accounts separately from registered synthetic accounts', async () => {
    const candidates = [{ user_id: 'u2', full_name: 'Patient Two', email: 'patient@example.invalid', created_at: '2026-10-02T00:00:00Z' }];
    rpcMock.mockResolvedValue({ data: candidates, error: null });
    await expect(getSyntheticDemoRegistrationCandidates()).resolves.toEqual(candidates);
    expect(rpcMock).toHaveBeenCalledWith('get_synthetic_demo_registration_candidates');
  });

  it('requires explicit synthetic confirmation and a reason before registration', async () => {
    await expect(registerSyntheticDemoAccount({ userId: 'u2', reason: 'For testing', confirmedSynthetic: false })).rejects.toThrow('confirm it is dedicated synthetic data');
    expect(rpcMock).not.toHaveBeenCalled();
    rpcMock.mockResolvedValue({ data: { user_id: 'u2', is_active: true, action: 'registered' }, error: null });
    await expect(registerSyntheticDemoAccount({ userId: 'u2', reason: 'Dedicated synthetic test account', confirmedSynthetic: true })).resolves.toBeUndefined();
    expect(rpcMock).toHaveBeenCalledWith('register_synthetic_demo_account', {
      p_user_id: 'u2', p_reason: 'Dedicated synthetic test account', p_confirmed_synthetic: true
    });
  });

  it('validates restricted role and hospital requirements before RPC', async () => {
    await expect(provisionDemoAccountRole({ userId: 'u1', role: 'hospital_approver', reason: 'For demo' })).rejects.toThrow('permitted role');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('checks the database confirmation response against the exact requested assignment', async () => {
    rpcMock.mockResolvedValue({ data: { user_id: 'u1', role: 'hospital_approver', hospital_id: 'h1' }, error: null });
    await expect(provisionDemoAccountRole({ userId: 'u1', role: 'hospital_approver', hospitalId: 'h1', reason: 'Synthetic role for workflow review' })).resolves.toBeUndefined();
    expect(rpcMock).toHaveBeenCalledWith('provision_demo_account_role', {
      p_user_id: 'u1', p_new_role: 'hospital_approver', p_hospital_id: 'h1', p_reason: 'Synthetic role for workflow review'
    });

    rpcMock.mockResolvedValue({ data: { user_id: 'u1', role: 'hospital_admin', hospital_id: 'h2' }, error: null });
    await expect(provisionDemoAccountRole({ userId: 'u1', role: 'hospital_admin', hospitalId: 'h2', reason: 'Synthetic transfer source' })).resolves.toBeUndefined();
    expect(rpcMock).toHaveBeenCalledWith('provision_demo_account_role', {
      p_user_id: 'u1', p_new_role: 'hospital_admin', p_hospital_id: 'h2', p_reason: 'Synthetic transfer source'
    });

    rpcMock.mockResolvedValue({ data: { user_id: 'u1', role: 'government_admin', hospital_id: 'h1' }, error: null });
    await expect(provisionDemoAccountRole({ userId: 'u1', role: 'government_admin', reason: 'Synthetic role for workflow review' })).rejects.toThrow('verified demo role result');
  });
});
