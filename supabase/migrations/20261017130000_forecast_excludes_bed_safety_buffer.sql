-- Forecast shortage comparisons must use stock above the facility's protected
-- minimum, matching the safety boundary used by nearby transfer discovery.
BEGIN;

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
      MAX(d.predicted_demand::NUMERIC) FILTER (WHERE d.forecast_horizon_days = 1) AS demand_24h,
      MAX(d.predicted_demand::NUMERIC) FILTER (WHERE d.forecast_horizon_days = 7) AS demand_7d,
      MAX(d.request_count::BIGINT) FILTER (WHERE d.forecast_horizon_days = 1) AS request_count,
      MAX(d.method_version) FILTER (WHERE d.forecast_horizon_days = 1) AS method,
      MAX(d.created_at) AS generated
    FROM latest d
    GROUP BY d.hospital_id, d.resource_type
    HAVING COUNT(*) FILTER (WHERE d.forecast_horizon_days = 1) = 1
       AND COUNT(*) FILTER (WHERE d.forecast_horizon_days = 7) = 1
  )
  SELECT p.hospital_id, h.hospital_name::TEXT, h.district::TEXT, p.resource_type,
    CASE WHEN p.resource_type = 'ICU Beds'
      THEN GREATEST(i.available_icu_beds - i.minimum_icu_beds, 0)::NUMERIC
      ELSE GREATEST(b.available_beds - b.minimum_beds, 0)::NUMERIC END,
    p.demand_24h::NUMERIC, p.demand_7d::NUMERIC, p.request_count::BIGINT, p.method::TEXT,
    p.generated::DATE, p.generated::TIMESTAMPTZ
  FROM paired p
  JOIN public.hospitals h ON h.hospital_id = p.hospital_id AND h.status::text = 'Active'
  LEFT JOIN public.icu_inventory i ON i.hospital_id = p.hospital_id AND p.resource_type = 'ICU Beds'
  LEFT JOIN public.general_bed_inventory b ON b.hospital_id = p.hospital_id AND p.resource_type = 'General Beds'
  WHERE CASE WHEN p.resource_type = 'ICU Beds' THEN i.available_icu_beds IS NOT NULL
             ELSE b.available_beds IS NOT NULL END
  ORDER BY h.hospital_name, p.resource_type;
END;
$$;

REVOKE ALL ON FUNCTION public.get_latest_synthetic_operational_bed_forecasts(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_latest_synthetic_operational_bed_forecasts(UUID) TO authenticated;

COMMIT;
