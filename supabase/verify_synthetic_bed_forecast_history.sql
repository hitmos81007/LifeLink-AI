-- Run after 20261008230000_extend_prediction_history_types.sql and
-- 20261008240000_persist_synthetic_bed_forecasts.sql.
DO $$
DECLARE
  v_recalc_definition TEXT;
  v_get_definition TEXT;
BEGIN
  IF to_regclass('public.prediction_history') IS NULL THEN
    RAISE EXCEPTION 'Canonical prediction_history table is missing';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.prediction_history'::regclass) THEN
    RAISE EXCEPTION 'prediction_history RLS is not enabled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='prediction_history' AND column_name='input_snapshot')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='prediction_history' AND column_name='forecast_horizon_days') THEN
    RAISE EXCEPTION 'Forecast provenance columns are missing from prediction_history';
  END IF;
  IF has_table_privilege('authenticated', 'public.prediction_history', 'INSERT')
     OR has_table_privilege('authenticated', 'public.prediction_history', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.prediction_history', 'DELETE') THEN
    RAISE EXCEPTION 'Authenticated clients can mutate prediction_history directly';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_latest_synthetic_operational_bed_forecasts(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.recalculate_synthetic_operational_bed_forecasts(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated forecast RPC grants are missing';
  END IF;
  IF has_function_privilege('anon', 'public.get_latest_synthetic_operational_bed_forecasts(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.recalculate_synthetic_operational_bed_forecasts(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous forecast RPC access is enabled';
  END IF;
  SELECT pg_get_functiondef('public.recalculate_synthetic_operational_bed_forecasts(uuid)'::regprocedure)
    INTO v_recalc_definition;
  SELECT pg_get_functiondef('public.get_latest_synthetic_operational_bed_forecasts(uuid)'::regprocedure)
    INTO v_get_definition;
  IF position('data_origin' IN v_recalc_definition) = 0
     OR position('synthetic' IN v_recalc_definition) = 0
     OR position('confirmation_status' IN v_recalc_definition) = 0
     OR position('government_admin' IN v_recalc_definition) = 0
     OR position('hospital_approver' IN v_get_definition) = 0
     OR position('24 hours' IN v_get_definition) = 0
     OR position('forecast_run_id' IN v_get_definition) = 0 THEN
    RAISE EXCEPTION 'Forecast calculation, freshness, run pairing, or role scope is missing';
  END IF;
  RAISE NOTICE 'Synthetic bed forecast history access and source checks passed';
END;
$$;
