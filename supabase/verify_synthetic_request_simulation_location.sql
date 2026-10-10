-- Run after 20261008260000_optional_coarse_synthetic_request_location.sql.
-- Read-only verification of RPC grants and coarse-coordinate safeguards.
DO $$
DECLARE
  v_location_rpc regprocedure := to_regprocedure(
    'public.create_synthetic_patient_request_with_location(text,text,boolean,boolean,boolean,boolean,boolean,text,numeric,numeric)'
  );
  v_legacy_rpc regprocedure := to_regprocedure(
    'public.create_synthetic_patient_request(text,text,boolean,boolean,boolean,boolean,boolean,text)'
  );
  v_definition TEXT;
  v_legacy_definition TEXT;
BEGIN
  IF v_location_rpc IS NULL OR v_legacy_rpc IS NULL THEN
    RAISE EXCEPTION 'Location-aware or backwards-compatible synthetic request RPC is missing';
  END IF;
  IF NOT has_function_privilege('authenticated',v_location_rpc,'EXECUTE')
     OR has_function_privilege('anon',v_location_rpc,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_legacy_rpc,'EXECUTE')
     OR has_function_privilege('anon',v_legacy_rpc,'EXECUTE') THEN
    RAISE EXCEPTION 'Synthetic request RPC grants are missing or anonymous execution is enabled';
  END IF;
  IF has_table_privilege('authenticated','public.patient_requests','INSERT')
     OR has_table_privilege('authenticated','public.patient_requests','UPDATE')
     OR has_table_privilege('authenticated','public.patient_requests','DELETE')
     OR has_any_column_privilege('authenticated','public.patient_requests','INSERT')
     OR has_any_column_privilege('authenticated','public.patient_requests','UPDATE')
     OR has_table_privilege('anon','public.patient_requests','INSERT')
     OR has_table_privilege('anon','public.patient_requests','UPDATE')
     OR has_table_privilege('anon','public.patient_requests','DELETE')
     OR has_any_column_privilege('anon','public.patient_requests','INSERT')
     OR has_any_column_privilege('anon','public.patient_requests','UPDATE') THEN
    RAISE EXCEPTION 'Patients can bypass the synthetic request RPC';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='patient_requests' AND column_name='latitude')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='patient_requests' AND column_name='longitude') THEN
    RAISE EXCEPTION 'Patient request location columns are missing';
  END IF;
  SELECT pg_get_functiondef(v_location_rpc) INTO v_definition;
  SELECT pg_get_functiondef(v_legacy_rpc) INTO v_legacy_definition;
  IF position('create_synthetic_patient_request(' IN v_definition)=0
     OR position('outside valid coordinate bounds' IN v_definition)=0
     OR position('rounded to about one kilometer' IN v_definition)=0
     OR position('p_latitude IS NULL' IN v_definition)=0
     OR position('active patient account' IN v_legacy_definition)=0
     OR position('synthetic' IN v_legacy_definition)=0 THEN
    RAISE EXCEPTION 'Synthetic request role, coordinate bounds, precision, or optional-location behavior is missing';
  END IF;
  RAISE NOTICE 'Optional synthetic location RPC permissions and coordinate precision checks passed.';
END;
$$;
