import { supabase } from '../lib/supabase/client';
import { TransferResourceType } from '../types/database';

export interface OperationalForecastItem {
  prediction_id?: string;
  hospital_id: string;
  hospital_name: string;
  district: string;
  resource_type: TransferResourceType;
  current_quantity: number;
  predicted_demand_24h: number;
  predicted_demand_7d: number;
  confidence_score: number | null;
  prediction_model: string;
  observed_scenarios_30d: number;
  shortage_risk: 'Critical' | 'High' | 'Medium' | 'Low';
  prediction_date: string;
  last_calculated: string;
}

interface StoredForecastRow {
  hospital_id: string;
  hospital_name: string;
  district: string;
  resource_type: string;
  current_quantity: number | string;
  predicted_demand_24h: number | string;
  predicted_demand_7d: number | string;
  observed_requests_30d: number | string;
  method_version: string;
  prediction_date: string;
  last_calculated: string;
}

/** Compares the same current-stock snapshot with immediate and seven-day demand. */
function estimateShortageRisk(currentStock: number, demand24h: number, demand7d: number): OperationalForecastItem['shortage_risk'] {
  if (currentStock < demand24h) return 'Critical';
  if (currentStock < demand7d) return 'High';
  if (currentStock < demand7d * 2) return 'Medium';
  return 'Low';
}

function mapStoredForecasts(rows: StoredForecastRow[] | null): OperationalForecastItem[] {
  if (!rows) throw new Error('Supabase returned no forecast history result.');
  return rows.map((row) => {
    const resourceType = row.resource_type;
    if (resourceType !== 'ICU Beds' && resourceType !== 'General Beds') {
      throw new Error(`Stored forecast has an unsupported resource type: ${resourceType}.`);
    }
    const currentQuantity = Number(row.current_quantity);
    const demand24h = Number(row.predicted_demand_24h);
    const demand7d = Number(row.predicted_demand_7d);
    const observed = Number(row.observed_requests_30d);
    if (![currentQuantity, demand24h, demand7d, observed].every(Number.isFinite)
      || currentQuantity < 0 || demand24h < 0 || demand7d < 0 || observed < 1) {
      throw new Error(`Stored forecast values are invalid for facility ${row.hospital_id}.`);
    }
    return {
      hospital_id: row.hospital_id,
      hospital_name: row.hospital_name,
      district: row.district,
      resource_type: resourceType,
      current_quantity: currentQuantity,
      predicted_demand_24h: demand24h,
      predicted_demand_7d: demand7d,
      confidence_score: null,
      prediction_model: row.method_version,
      observed_scenarios_30d: observed,
      shortage_risk: estimateShortageRisk(currentQuantity, demand24h, demand7d),
      prediction_date: row.prediction_date,
      last_calculated: row.last_calculated
    };
  });
}

/** Loads the latest persisted synthetic estimate and only generates a first snapshot when none exists. */
export async function generateOperationalBaselineEstimates(hospitalId?: string): Promise<OperationalForecastItem[]> {
  const params = { p_hospital_id: hospitalId ?? null };
  const { data, error } = await supabase.rpc('get_latest_synthetic_operational_bed_forecasts', params);
  if (error) throw new Error(`Could not load saved estimates: ${error.message}`);
  if (!data) throw new Error('Could not load saved estimates: Supabase returned no data.');

  if (data.length > 0) return mapStoredForecasts(data as StoredForecastRow[]);

  const { data: generated, error: generateError } = await supabase.rpc(
    'recalculate_synthetic_operational_bed_forecasts', params
  );
  if (generateError) throw new Error(`Could not generate the initial saved estimates: ${generateError.message}`);
  return mapStoredForecasts(generated as StoredForecastRow[] | null);
}

/** Recalculates forecasts on explicit user action and persists server-computed snapshots. */
export async function recalculateOperationalBaselineEstimates(hospitalId?: string): Promise<OperationalForecastItem[]> {
  const { data, error } = await supabase.rpc('recalculate_synthetic_operational_bed_forecasts', {
    p_hospital_id: hospitalId ?? null
  });
  if (error) throw new Error(`Could not save recalculated estimates: ${error.message}`);
  return mapStoredForecasts(data as StoredForecastRow[] | null);
}
