-- Run after 20261017170000_keep_saved_bed_forecasts_visible_when_stale.sql.
-- Catalog-only verification; does not generate or mutate forecast rows.
DO $$
DECLARE
  v_rpc regprocedure := to_regprocedure('public.get_latest_synthetic_operational_bed_forecasts(uuid)');
  v_definition text;
BEGIN
  IF v_rpc IS NULL THEN
    RAISE EXCEPTION 'Synthetic bed forecast read RPC is missing';
  END IF;
  IF NOT has_function_privilege('authenticated',v_rpc,'EXECUTE')
     OR has_function_privilege('anon',v_rpc,'EXECUTE') THEN
    RAISE EXCEPTION 'Synthetic bed forecast read RPC grants are incorrect';
  END IF;
  SELECT pg_get_functiondef(v_rpc) INTO v_definition;
  IF position('p_hospital_id <> v_user.hospital_id' IN v_definition)=0
     OR position('ph.hospital_id = v_user.hospital_id' IN v_definition)=0
     OR position('i.available_icu_beds - i.minimum_icu_beds' IN v_definition)=0
     OR position('b.available_beds - b.minimum_beds' IN v_definition)=0
     OR position('forecast_horizon_days IN (1, 7)' IN v_definition)=0
     OR position('INTERVAL ''24 hours''' IN v_definition)>0 THEN
    RAISE EXCEPTION 'Forecast read RPC lost tenant scope, protected-supply logic, horizon pairing, or stale-row retention';
  END IF;
  RAISE NOTICE 'Saved synthetic bed forecast retention and access checks passed';
END;
$$;
