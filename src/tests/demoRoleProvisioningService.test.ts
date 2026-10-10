import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock('../lib/supabase/client', () => ({ supabase: { rpc: rpcMock } }));
import { getDemoRoleProvisioningOptions, provisionDemoAccountRole } from '../services/demoRoleProvisioningService';

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

    rpcMock.mockResolvedValue({ data: { user_id: 'u1', role: 'government_admin', hospital_id: 'h1' }, error: null });
    await expect(provisionDemoAccountRole({ userId: 'u1', role: 'government_admin', reason: 'Synthetic role for workflow review' })).rejects.toThrow('verified demo role result');
  });
});
