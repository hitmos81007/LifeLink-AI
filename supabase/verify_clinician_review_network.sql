-- Run after 20261007120000_clinician_review_network.sql is applied.
-- Read-only function catalog check; no account or resource records are created.
DO $$
DECLARE
  v_rpc regprocedure := to_regprocedure('public.get_clinician_review_network()');
  v_definition text;
BEGIN
  IF v_rpc IS NULL THEN RAISE EXCEPTION 'Clinician review network RPC is missing'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_rpc) THEN
    RAISE EXCEPTION 'Review network RPC must use SECURITY DEFINER';
  END IF;
  IF NOT has_function_privilege('authenticated',v_rpc,'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated RPC execution grant is missing';
  END IF;
  IF has_function_privilege('anon',v_rpc,'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous users must not execute the review network RPC';
  END IF;

  v_definition := pg_get_functiondef(v_rpc);
  IF position('clinician_reviewer' IN v_definition)=0 OR
     position('v_user.status IS DISTINCT FROM true' IN v_definition)=0 OR
     position('available_icu_beds' IN v_definition)=0 OR
     position('available_capacity > o.minimum_threshold' IN v_definition)=0 OR
     position('blood_stock' IN v_definition)=0 OR
     position('ambulance_providers' IN v_definition)=0 OR
     position('driver_phone' IN v_definition)>0 OR
     position('driver_name' IN v_definition)>0 THEN
    RAISE EXCEPTION 'Role check or minimum review-candidate projection is missing';
  END IF;
  RAISE NOTICE 'Clinician review network catalog checks passed. Verify data with synthetic authorized accounts before deployment.';
END $$;
