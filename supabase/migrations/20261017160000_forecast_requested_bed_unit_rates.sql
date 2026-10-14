-- Forecast rates should reflect the number of beds requested, not just the
-- number of request records. Legacy rows without quantities count as one bed.
BEGIN;

CREATE OR REPLACE FUNCTION public.recalculate_synthetic_operational_bed_forecasts(p_hospital_id UUID DEFAULT NULL)
RETURNS TABLE (
  hospital_id UUID,
  hospital_name TEXT,
  district TEXT,
  resource_type TEXT,
  current_quantity NUMERIC,
  predicted_demand_24h NUMERIC,
  predicted_demand_7d NUMERIC,
  observed_requests_30d BIGINT,
  method_version TEXT,
  prediction_date DATE,
  last_calculated TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_generated_at TIMESTAMPTZ := clock_timestamp();
  v_forecast_run_id UUID := gen_random_uuid();
BEGIN
  SELECT * INTO v_user FROM public.users u WHERE u.user_id = auth.uid();
  IF NOT FOUND OR v_user.status IS NOT TRUE OR v_user.role::text NOT IN (
    'government_admin', 'hospital_admin', 'hospital_approver'
  ) THEN
    RAISE EXCEPTION 'Active government or facility account required';
  END IF;
  IF v_user.role::text IN ('hospital_admin', 'hospital_approver') AND v_user.hospital_id IS NULL THEN
    RAISE EXCEPTION 'Hospital account must be linked to a facility';
  END IF;
  IF p_hospital_id IS NOT NULL AND v_user.role::text IN ('hospital_admin', 'hospital_approver')
     AND p_hospital_id <> v_user.hospital_id THEN
    RAISE EXCEPTION 'Cannot recalculate forecasts for another facility';
  END IF;

  INSERT INTO public.prediction_history (
    hospital_id, resource_type, current_quantity, predicted_demand, confidence_score,
    prediction_model, prediction_date, created_at, updated_at,
    forecast_run_id, forecast_horizon_days, method_version, input_snapshot
  )
  WITH request_totals AS (
    SELECT ec.assigned_hospital_id AS hospital_id,
      COUNT(*) FILTER (WHERE pr.needs_icu)::BIGINT AS icu_request_count,
      COUNT(*) FILTER (WHERE pr.needs_general_bed)::BIGINT AS general_request_count,
      (SUM(COALESCE(pr.requested_icu_beds, 1)) FILTER (WHERE pr.needs_icu))::BIGINT AS icu_unit_count,
      (SUM(COALESCE(pr.requested_general_beds, 1)) FILTER (WHERE pr.needs_general_bed))::BIGINT AS general_unit_count
    FROM public.emergency_cases ec
    JOIN public.patient_requests pr ON pr.request_id = ec.request_id
    WHERE ec.assigned_hospital_id IS NOT NULL
      AND ec.confirmation_status = 'confirmed'
      AND pr.data_origin = 'synthetic'
      AND pr.created_at >= v_generated_at - INTERVAL '30 days'
    GROUP BY ec.assigned_hospital_id
  ),
  facilities AS (
    SELECT h.hospital_id,
      COALESCE(rt.icu_request_count, 0)::BIGINT AS icu_request_count,
      COALESCE(rt.general_request_count, 0)::BIGINT AS general_request_count,
      COALESCE(rt.icu_unit_count, 0)::BIGINT AS icu_unit_count,
      COALESCE(rt.general_unit_count, 0)::BIGINT AS general_unit_count,
      i.available_icu_beds::NUMERIC AS icu_stock,
      b.available_beds::NUMERIC AS general_stock
    FROM public.hospitals h
    LEFT JOIN request_totals rt ON rt.hospital_id = h.hospital_id
    LEFT JOIN public.icu_inventory i ON i.hospital_id = h.hospital_id
    LEFT JOIN public.general_bed_inventory b ON b.hospital_id = h.hospital_id
    WHERE h.status::text = 'Active'
      AND (p_hospital_id IS NULL OR h.hospital_id = p_hospital_id)
      AND (v_user.role::text = 'government_admin' OR h.hospital_id = v_user.hospital_id)
  ),
  resources AS (
    SELECT f.hospital_id, r.resource_type, r.stock, r.request_count, r.unit_count
    FROM facilities f
    CROSS JOIN LATERAL (VALUES
      ('ICU Beds'::TEXT, f.icu_stock, f.icu_request_count, f.icu_unit_count),
      ('General Beds'::TEXT, f.general_stock, f.general_request_count, f.general_unit_count)
    ) r(resource_type, stock, request_count, unit_count)
    WHERE r.stock IS NOT NULL AND r.request_count > 0 AND r.unit_count > 0
  ),
  horizons AS (
    SELECT r.hospital_id, r.resource_type, r.stock, r.request_count, r.unit_count, h.horizon_days,
      ROUND((r.unit_count::NUMERIC / 30) * h.horizon_days, 2) AS demand
    FROM resources r
    CROSS JOIN (VALUES (1::SMALLINT), (7::SMALLINT)) h(horizon_days)
  )
  SELECT x.hospital_id, x.resource_type::public.transfer_resource_type,
    x.stock::INTEGER, x.demand, NULL::NUMERIC(5,2),
    'SyntheticRequestRate'::public.prediction_model, v_generated_at::DATE,
    v_generated_at, v_generated_at, v_forecast_run_id, x.horizon_days,
    'synthetic_confirmed_bed_unit_rate_v2',
    jsonb_build_object(
      'data_origin', 'synthetic',
      'confirmation_status', 'confirmed',
      'window_days', 30,
      'window_started_at', v_generated_at - INTERVAL '30 days',
      'window_ended_at', v_generated_at,
      'observed_request_count', x.request_count,
      'observed_unit_count', x.unit_count,
      'inventory_quantity_at_generation', x.stock,
      'rate_per_day', ROUND(x.unit_count::NUMERIC / 30, 4)
    )
  FROM horizons x;

  RETURN QUERY SELECT * FROM public.get_latest_synthetic_operational_bed_forecasts(p_hospital_id);
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_synthetic_operational_bed_forecasts(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_synthetic_operational_bed_forecasts(UUID) TO authenticated;

COMMENT ON FUNCTION public.recalculate_synthetic_operational_bed_forecasts(UUID) IS
  'Persists synthetic 24-hour and 7-day bed estimates using requested bed units over 30 days. Not a validated ML forecast.';

COMMIT;
