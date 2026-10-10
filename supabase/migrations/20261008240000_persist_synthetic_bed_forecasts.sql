-- Use the project's canonical prediction_history table while preserving old rows.
-- Each recalculation appends one row per resource and horizon with an auditable input snapshot.
ALTER TABLE public.prediction_history
  ALTER COLUMN predicted_demand TYPE NUMERIC(12, 2)
    USING predicted_demand::NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS forecast_run_id UUID,
  ADD COLUMN IF NOT EXISTS forecast_horizon_days SMALLINT,
  ADD COLUMN IF NOT EXISTS method_version TEXT,
  ADD COLUMN IF NOT EXISTS input_snapshot JSONB;

ALTER TABLE public.prediction_history
  ADD CONSTRAINT prediction_history_valid_horizon
    CHECK (forecast_horizon_days IS NULL OR forecast_horizon_days IN (1, 7)),
  ADD CONSTRAINT prediction_history_valid_method
    CHECK (method_version IS NULL OR length(method_version) BETWEEN 1 AND 100),
  ADD CONSTRAINT prediction_history_snapshot_object
    CHECK (input_snapshot IS NULL OR jsonb_typeof(input_snapshot) = 'object'),
  ADD CONSTRAINT prediction_history_forecast_fields_complete
    CHECK (
      (forecast_run_id IS NULL AND forecast_horizon_days IS NULL AND method_version IS NULL AND input_snapshot IS NULL)
      OR (forecast_run_id IS NOT NULL AND forecast_horizon_days IS NOT NULL AND method_version IS NOT NULL AND input_snapshot IS NOT NULL)
    ),
  ADD CONSTRAINT prediction_history_synthetic_method_only
    CHECK (forecast_run_id IS NULL OR (prediction_model::TEXT = 'SyntheticRequestRate' AND confidence_score IS NULL));

CREATE INDEX IF NOT EXISTS prediction_history_latest_forecast_idx
  ON public.prediction_history (hospital_id, resource_type, forecast_horizon_days, created_at DESC)
  WHERE forecast_run_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS prediction_history_forecast_run_row_unique_idx
  ON public.prediction_history (forecast_run_id, hospital_id, resource_type, forecast_horizon_days)
  WHERE forecast_run_id IS NOT NULL;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.prediction_history FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_latest_synthetic_operational_bed_forecasts(p_hospital_id UUID DEFAULT NULL)
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
    RAISE EXCEPTION 'Cannot access forecasts for another facility';
  END IF;

  RETURN QUERY
  WITH latest_run AS (
    SELECT DISTINCT ON (ph.hospital_id, ph.resource_type)
      ph.hospital_id, ph.resource_type, ph.forecast_run_id
    FROM public.prediction_history ph
    WHERE ph.forecast_run_id IS NOT NULL
      AND ph.forecast_horizon_days IN (1, 7)
      AND ph.created_at >= now() - INTERVAL '24 hours'
      AND (p_hospital_id IS NULL OR ph.hospital_id = p_hospital_id)
      AND (v_user.role::text = 'government_admin' OR ph.hospital_id = v_user.hospital_id)
    ORDER BY ph.hospital_id, ph.resource_type, ph.created_at DESC, ph.forecast_run_id DESC
  ),
  latest AS (
    SELECT ph.hospital_id, ph.resource_type::TEXT AS resource_type,
      ph.forecast_horizon_days, ph.predicted_demand,
      ph.input_snapshot->>'observed_request_count' AS request_count,
      ph.method_version, ph.created_at
    FROM public.prediction_history ph
    JOIN latest_run r ON r.hospital_id = ph.hospital_id
      AND r.resource_type = ph.resource_type AND r.forecast_run_id = ph.forecast_run_id
  ),
  paired AS (
    SELECT d.hospital_id, d.resource_type,
      MAX(d.predicted_demand) FILTER (WHERE d.forecast_horizon_days = 1) AS demand_24h,
      MAX(d.predicted_demand) FILTER (WHERE d.forecast_horizon_days = 7) AS demand_7d,
      MAX(d.request_count::BIGINT) FILTER (WHERE d.forecast_horizon_days = 1) AS request_count,
      MAX(d.method_version) FILTER (WHERE d.forecast_horizon_days = 1) AS method,
      MAX(d.created_at) AS generated
    FROM latest d
    GROUP BY d.hospital_id, d.resource_type
    HAVING COUNT(*) FILTER (WHERE d.forecast_horizon_days = 1) = 1
       AND COUNT(*) FILTER (WHERE d.forecast_horizon_days = 7) = 1
  )
  SELECT p.hospital_id, h.hospital_name::TEXT, h.district::TEXT, p.resource_type,
    CASE WHEN p.resource_type = 'ICU Beds' THEN i.available_icu_beds::NUMERIC
         ELSE b.available_beds::NUMERIC END,
    p.demand_24h, p.demand_7d, p.request_count, p.method,
    p.generated::DATE, p.generated
  FROM paired p
  JOIN public.hospitals h ON h.hospital_id = p.hospital_id AND h.status::text = 'Active'
  LEFT JOIN public.icu_inventory i ON i.hospital_id = p.hospital_id AND p.resource_type = 'ICU Beds'
  LEFT JOIN public.general_bed_inventory b ON b.hospital_id = p.hospital_id AND p.resource_type = 'General Beds'
  WHERE CASE WHEN p.resource_type = 'ICU Beds' THEN i.available_icu_beds IS NOT NULL
             ELSE b.available_beds IS NOT NULL END
  ORDER BY h.hospital_name, p.resource_type;
END;
$$;

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
  WITH request_counts AS (
    SELECT ec.assigned_hospital_id AS hospital_id,
      COUNT(*) FILTER (WHERE pr.needs_icu)::BIGINT AS icu_count,
      COUNT(*) FILTER (WHERE pr.needs_general_bed)::BIGINT AS general_count
    FROM public.emergency_cases ec
    JOIN public.patient_requests pr ON pr.request_id = ec.request_id
    WHERE ec.assigned_hospital_id IS NOT NULL
      AND ec.confirmation_status = 'confirmed'
      AND pr.data_origin = 'synthetic'
      AND pr.created_at >= v_generated_at - INTERVAL '30 days'
    GROUP BY ec.assigned_hospital_id
  ),
  facilities AS (
    SELECT h.hospital_id, COALESCE(rc.icu_count, 0)::BIGINT AS icu_count,
      COALESCE(rc.general_count, 0)::BIGINT AS general_count,
      i.available_icu_beds::NUMERIC AS icu_stock, b.available_beds::NUMERIC AS general_stock
    FROM public.hospitals h
    LEFT JOIN request_counts rc ON rc.hospital_id = h.hospital_id
    LEFT JOIN public.icu_inventory i ON i.hospital_id = h.hospital_id
    LEFT JOIN public.general_bed_inventory b ON b.hospital_id = h.hospital_id
    WHERE h.status::text = 'Active'
      AND (p_hospital_id IS NULL OR h.hospital_id = p_hospital_id)
      AND (v_user.role::text = 'government_admin' OR h.hospital_id = v_user.hospital_id)
  ),
  resources AS (
    SELECT f.hospital_id, r.resource_type, r.stock, r.request_count
    FROM facilities f
    CROSS JOIN LATERAL (VALUES
      ('ICU Beds'::TEXT, f.icu_stock, f.icu_count),
      ('General Beds'::TEXT, f.general_stock, f.general_count)
    ) r(resource_type, stock, request_count)
    WHERE r.stock IS NOT NULL AND r.request_count > 0
  ),
  horizons AS (
    SELECT r.hospital_id, r.resource_type, r.stock, r.request_count, h.horizon_days,
      ROUND((r.request_count::NUMERIC / 30) * h.horizon_days, 2) AS demand
    FROM resources r
    CROSS JOIN (VALUES (1::SMALLINT), (7::SMALLINT)) h(horizon_days)
  )
  SELECT x.hospital_id, x.resource_type::public.transfer_resource_type,
    x.stock::INTEGER, x.demand, NULL::NUMERIC(5,2),
    'SyntheticRequestRate'::public.prediction_model, v_generated_at::DATE,
    v_generated_at, v_generated_at, v_forecast_run_id, x.horizon_days,
    'synthetic_confirmed_request_rate_v1',
    jsonb_build_object(
      'data_origin', 'synthetic',
      'confirmation_status', 'confirmed',
      'window_days', 30,
      'window_started_at', v_generated_at - INTERVAL '30 days',
      'window_ended_at', v_generated_at,
      'observed_request_count', x.request_count,
      'inventory_quantity_at_generation', x.stock,
      'rate_per_day', ROUND(x.request_count::NUMERIC / 30, 4)
    )
  FROM horizons x;

  RETURN QUERY SELECT * FROM public.get_latest_synthetic_operational_bed_forecasts(p_hospital_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_latest_synthetic_operational_bed_forecasts(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recalculate_synthetic_operational_bed_forecasts(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_latest_synthetic_operational_bed_forecasts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_synthetic_operational_bed_forecasts(UUID) TO authenticated;

COMMENT ON COLUMN public.prediction_history.forecast_horizon_days IS
  'Forecast horizon for synthetic operational rows: 1 or 7 days; NULL for legacy records.';
COMMENT ON COLUMN public.prediction_history.input_snapshot IS
  'Aggregate synthetic-only inputs captured at calculation time; contains no patient identifiers.';
