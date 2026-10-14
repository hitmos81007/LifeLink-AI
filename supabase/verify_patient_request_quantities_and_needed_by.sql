-- Run after 20261017150000_request_quantities_and_needed_by.sql.
-- Catalog-only verification of the synthetic request contract and privileges.
DO $$
DECLARE
  v_request_rpc regprocedure := to_regprocedure(
    'public.create_synthetic_patient_request_with_needs(text,text,boolean,boolean,boolean,boolean,boolean,text,numeric,numeric,integer,integer,integer,integer,integer,timestamp with time zone)'
  );
  v_legacy_request_rpc regprocedure := to_regprocedure(
    'public.create_synthetic_patient_request(text,text,boolean,boolean,boolean,boolean,boolean,text)'
  );
  v_legacy_location_rpc regprocedure := to_regprocedure(
    'public.create_synthetic_patient_request_with_location(text,text,boolean,boolean,boolean,boolean,boolean,text,numeric,numeric)'
  );
  v_definition text;
  v_column text;
BEGIN
  IF v_request_rpc IS NULL THEN
    RAISE EXCEPTION 'Quantity- and needed-by-aware request RPC is missing';
  END IF;
  IF NOT has_function_privilege('authenticated',v_request_rpc,'EXECUTE')
     OR has_function_privilege('anon',v_request_rpc,'EXECUTE')
     OR has_function_privilege('authenticated',v_legacy_request_rpc,'EXECUTE')
     OR has_function_privilege('authenticated',v_legacy_location_rpc,'EXECUTE') THEN
    RAISE EXCEPTION 'New RPC grants or retired legacy RPC grants are incorrect';
  END IF;
  FOREACH v_column IN ARRAY ARRAY[
    'requested_icu_beds','requested_general_beds','requested_oxygen_units',
    'requested_blood_units','requested_ambulances','needed_by'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='patient_requests' AND column_name=v_column
    ) THEN
      RAISE EXCEPTION 'patient_requests.% is missing',v_column;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.patient_requests'::regclass
      AND conname='patient_requests_synthetic_need_quantities_check' AND convalidated) THEN
    RAISE EXCEPTION 'Synthetic request cross-field quantity constraint is missing or unvalidated';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY[
    'patient_requests_icu_quantity_nonnegative','patient_requests_general_bed_quantity_nonnegative',
    'patient_requests_oxygen_quantity_nonnegative','patient_requests_blood_quantity_nonnegative',
    'patient_requests_ambulance_quantity_nonnegative'
  ]) AS required(name)
  WHERE NOT EXISTS (SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.patient_requests'::regclass AND c.conname=required.name AND c.convalidated)) THEN
    RAISE EXCEPTION 'One or more nonnegative request quantity constraints are missing or unvalidated';
  END IF;
  IF has_table_privilege('authenticated','public.patient_requests','INSERT')
     OR has_table_privilege('authenticated','public.patient_requests','UPDATE')
     OR has_any_column_privilege('authenticated','public.patient_requests','INSERT')
     OR has_any_column_privilege('authenticated','public.patient_requests','UPDATE') THEN
    RAISE EXCEPTION 'Authenticated users can bypass the validated request RPC';
  END IF;
  SELECT pg_get_functiondef(v_request_rpc) INTO v_definition;
  IF position('An active patient account' IN v_definition)=0
     OR position('p_needed_by <= now()' IN v_definition)=0
     OR position('interval ''30 days''' IN v_definition)=0
     OR position('p_requested_oxygen_units' IN v_definition)=0
     OR position('Select at least one resource' IN v_definition)=0
     OR position('patient_request_needs_review' IN v_definition)=0
     OR position('No emergency service was contacted' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Request RPC is missing role, quantity, time-window, or human-review safeguards';
  END IF;
  RAISE NOTICE 'Synthetic request quantity, needed-by, human-review, and privilege checks passed';
END;
$$;
