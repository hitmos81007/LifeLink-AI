import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock('../lib/supabase/client', () => ({ supabase: { rpc: rpcMock } }));

import {
  generateOperationalBaselineEstimates,
  recalculateOperationalBaselineEstimates
} from '../services/predictionService';

const storedRows = [
  {
    hospital_id: 'hospital-1', hospital_name: 'Synthetic Hospital', district: 'Central',
    resource_type: 'ICU Beds', current_quantity: 2, predicted_demand_24h: 1,
    predicted_demand_7d: 7, observed_requests_30d: 30,
    method_version: 'synthetic_confirmed_request_rate_v1', prediction_date: '2026-10-07',
    last_calculated: '2026-10-07T10:00:00Z'
  },
  {
    hospital_id: 'hospital-1', hospital_name: 'Synthetic Hospital', district: 'Central',
    resource_type: 'General Beds', current_quantity: 2, predicted_demand_24h: 0.2,
    predicted_demand_7d: 1.4, observed_requests_30d: 6,
    method_version: 'synthetic_confirmed_request_rate_v1', prediction_date: '2026-10-07',
    last_calculated: '2026-10-07T10:00:00Z'
  }
];

describe('persisted synthetic operational estimates', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: storedRows, error: null });
  });
  afterEach(() => vi.clearAllMocks());

  it('loads persisted estimates and calculates risk against 24-hour and seven-day demand', async () => {
    const estimates = await generateOperationalBaselineEstimates();
    expect(rpcMock).toHaveBeenCalledWith('get_latest_synthetic_operational_bed_forecasts', { p_hospital_id: null });
    expect(estimates).toHaveLength(2);
    expect(estimates.find((item) => item.resource_type === 'ICU Beds')).toMatchObject({
      current_quantity: 2, predicted_demand_24h: 1, predicted_demand_7d: 7,
      observed_scenarios_30d: 30, confidence_score: null, shortage_risk: 'High'
    });
    expect(estimates.find((item) => item.resource_type === 'General Beds')?.shortage_risk).toBe('Medium');
  });

  it('generates and saves a first snapshot only when no saved history exists', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: storedRows, error: null });
    const estimates = await generateOperationalBaselineEstimates('hospital-1');
    expect(estimates).toHaveLength(2);
    expect(rpcMock).toHaveBeenNthCalledWith(1, 'get_latest_synthetic_operational_bed_forecasts', { p_hospital_id: 'hospital-1' });
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'recalculate_synthetic_operational_bed_forecasts', { p_hospital_id: 'hospital-1' });
  });

  it('uses the save RPC for an explicit recalculation', async () => {
    await recalculateOperationalBaselineEstimates('hospital-1');
    expect(rpcMock).toHaveBeenCalledWith('recalculate_synthetic_operational_bed_forecasts', { p_hospital_id: 'hospital-1' });
  });

  it('surfaces read failures rather than silently replacing saved data', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'authorization denied' } });
    await expect(generateOperationalBaselineEstimates()).rejects.toThrow('Could not load saved estimates: authorization denied');
  });

  it('surfaces persistence failures from the recalculation RPC', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'migration missing' } });
    await expect(recalculateOperationalBaselineEstimates()).rejects.toThrow('Could not save recalculated estimates: migration missing');
  });

  it('rejects unexpected resources and invalid stored values', async () => {
    rpcMock.mockResolvedValueOnce({ data: [{ ...storedRows[0], resource_type: 'Blood' }], error: null });
    await expect(generateOperationalBaselineEstimates()).rejects.toThrow('Stored forecast has an unsupported resource type: Blood.');
    rpcMock.mockResolvedValueOnce({ data: [{ ...storedRows[0], current_quantity: -1 }], error: null });
    await expect(generateOperationalBaselineEstimates()).rejects.toThrow('Stored forecast values are invalid for facility hospital-1.');
  });
});
