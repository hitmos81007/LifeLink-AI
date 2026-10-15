import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock('../lib/supabase/client', () => ({ supabase: { rpc: rpcMock } }));

import { approveAndAllocateEmergencyRequest } from '../services/clinicalApprovalService';

describe('clinician review submission boundary', () => {
  beforeEach(() => vi.resetAllMocks());

  it('does not call Supabase until a clinician explicitly confirms urgency', async () => {
    const result = await approveAndAllocateEmergencyRequest({
      requestId: 'request-a',
      selectedHospitalId: 'hospital-a'
    });

    expect(result).toEqual({
      success: false,
      error: 'A clinician must explicitly confirm urgency before recording an assignment.'
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('sends the clinician-selected urgency to the transactional review RPC', async () => {
    rpcMock.mockResolvedValue({ data: { case_id: 'case-a' }, error: null });

    const result = await approveAndAllocateEmergencyRequest({
      requestId: 'request-a',
      confirmedUrgency: 'High',
      selectedHospitalId: 'hospital-a'
    });

    expect(result.success).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('approve_emergency_request', {
      p_request_id: 'request-a',
      p_hospital_id: 'hospital-a',
      p_ambulance_id: null,
      p_blood_bank_id: null,
      p_confirmed_urgency: 'High'
    });
  });
});
