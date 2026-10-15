import { afterEach, describe, expect, it, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock('../lib/supabase/client', () => ({ supabase: { rpc: rpcMock } }));

import { updateHospitalLocation } from '../services/hospitalService';

describe('hospital location persistence', () => {
  afterEach(() => vi.clearAllMocks());

  it('saves a valid coordinate pair through the audited Supabase RPC', async () => {
    const saved = {
      hospital_id: 'hospital-1', latitude: 13.08, longitude: 80.1,
      updated_at: '2026-10-11T12:00:00Z'
    };
    rpcMock.mockResolvedValue({ data: saved, error: null });

    await expect(updateHospitalLocation('hospital-1', '13.08', '80.10', saved.updated_at)).resolves.toEqual(saved);
    expect(rpcMock).toHaveBeenCalledWith('update_hospital_location', {
      p_hospital_id: 'hospital-1', p_latitude: 13.08, p_longitude: 80.1,
      p_expected_updated_at: saved.updated_at
    });
  });

  it.each([
    ['13.08', ''],
    ['', '80.1'],
    ['91', '80.1'],
    ['13.08', '181'],
    ['not-a-number', '80.1']
  ])('rejects invalid coordinate pairs before the database call', async (latitude, longitude) => {
    await expect(updateHospitalLocation('hospital-1', latitude, longitude, '2026-10-11T12:00:00Z'))
      .rejects.toThrow();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('allows clearing both coordinates but not just one', async () => {
    rpcMock.mockResolvedValue({ data: { hospital_id: 'hospital-1', latitude: null, longitude: null }, error: null });

    await updateHospitalLocation('hospital-1', '', '', '2026-10-11T12:00:00Z');
    expect(rpcMock).toHaveBeenCalledWith('update_hospital_location', expect.objectContaining({
      p_latitude: null, p_longitude: null
    }));
  });

  it('asks the hospital admin to refresh after a concurrent profile update', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '40001', message: 'version conflict' } });
    await expect(updateHospitalLocation('hospital-1', '13.08', '80.1', '2026-10-11T12:00:00Z'))
      .rejects.toThrow('Hospital profile changed since it was loaded. Refresh and reapply your location update.');
  });
});
