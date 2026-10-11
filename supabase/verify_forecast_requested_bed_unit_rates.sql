-- Run after 20261017160000_forecast_requested_bed_unit_rates.sql.
DO $$
DECLARE
  v_definition TEXT;
BEGIN
  IF to_regprocedure('public.recalculate_synthetic_operational_bed_forecasts(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Synthetic bed forecast RPC is missing';
  END IF;

  SELECT pg_get_functiondef('public.recalculate_synthetic_operational_bed_forecasts(uuid)'::regprocedure)
    INTO v_definition;

  IF position('requested_icu_beds' IN v_definition) = 0
     OR position('requested_general_beds' IN v_definition) = 0
     OR position('observed_unit_count' IN v_definition) = 0
     OR position('synthetic_confirmed_bed_unit_rate_v2' IN v_definition) = 0
     OR position('COALESCE(pr.requested_icu_beds, 1)' IN v_definition) = 0
     OR position('COALESCE(pr.requested_general_beds, 1)' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Forecast RPC does not use requested bed units with legacy one-bed fallback';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.recalculate_synthetic_operational_bed_forecasts(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.recalculate_synthetic_operational_bed_forecasts(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Forecast RPC grants are not authenticated-only';
  END IF;

  RAISE NOTICE 'Synthetic bed unit-rate forecast verifier passed';
END;
$$;
