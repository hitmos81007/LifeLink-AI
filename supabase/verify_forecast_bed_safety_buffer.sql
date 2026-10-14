-- Run after 20261017130000_forecast_excludes_bed_safety_buffer.sql.
-- Read-only catalog check: confirms forecasts compare demand with beds above
-- the configured minimum while preserving the authenticated-only RPC boundary.
DO $$
DECLARE
  v_signature REGPROCEDURE := to_regprocedure('public.get_latest_synthetic_operational_bed_forecasts(uuid)');
  v_definition TEXT;
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'Synthetic bed forecast RPC is missing';
  END IF;
  SELECT pg_get_functiondef(v_signature) INTO v_definition;
  IF position('GREATEST(i.available_icu_beds - i.minimum_icu_beds, 0)' IN v_definition) = 0
     OR position('GREATEST(b.available_beds - b.minimum_beds, 0)' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Forecast current_quantity does not exclude protected minimum beds';
  END IF;
  IF position('government_admin' IN v_definition) = 0
     OR position('p_hospital_id <> v_user.hospital_id' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Forecast account or facility scope check is missing';
  END IF;
  IF has_function_privilege('anon', v_signature, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'Forecast RPC grants do not preserve authenticated-only access';
  END IF;
  RAISE NOTICE 'Forecast safety-buffer and access checks passed';
END;
$$;
