-- Run after 20261007180000_require_active_accounts_for_analytics_and_mci.sql is applied.
-- Read-only catalog/privilege checks; this script creates no users or records.
DO $$
DECLARE
  v_rpc regprocedure := to_regprocedure('public.get_synthetic_bed_request_counts(integer)');
  v_internal regprocedure := to_regprocedure('public.get_synthetic_bed_request_counts_internal(integer)');
  v_definition text;
  v_wrapper_definition text;
  v_result text;
BEGIN
  IF v_rpc IS NULL OR v_internal IS NULL THEN RAISE EXCEPTION 'Synthetic bed request aggregate RPC or protected implementation is missing'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_rpc) THEN
    RAISE EXCEPTION 'Aggregate RPC must enforce role scope in SECURITY DEFINER code';
  END IF;
  IF NOT has_function_privilege('authenticated', v_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated execution grant is missing';
  END IF;
  IF has_function_privilege('anon', v_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous users must not execute the aggregate RPC';
  END IF;

  v_result := pg_get_function_result(v_rpc);
  IF position('hospital_id' IN v_result) = 0
     OR position('icu_request_count' IN v_result) = 0
     OR position('general_bed_request_count' IN v_result) = 0
     OR position('patient_id' IN v_result) > 0 THEN
    RAISE EXCEPTION 'RPC must return only hospital-scoped bed request aggregates';
  END IF;

  IF has_function_privilege('authenticated',v_internal,'EXECUTE') OR has_function_privilege('anon',v_internal,'EXECUTE') THEN
    RAISE EXCEPTION 'API roles must not directly execute the internal aggregate implementation';
  END IF;
  v_wrapper_definition := pg_get_functiondef(v_rpc);
  IF position('v_user.status IS DISTINCT FROM true' IN v_wrapper_definition)=0 THEN
    RAISE EXCEPTION 'Aggregate RPC must require an active account';
  END IF;
  v_definition := pg_get_functiondef(v_internal);
  IF position('auth.uid()' IN v_definition) = 0
     OR position('government_admin' IN v_definition) = 0
     OR position('hospital_admin' IN v_definition) = 0
     OR position('data_origin' IN v_definition) = 0
     OR position('confirmation_status' IN v_definition) = 0
     OR position('make_interval' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Role, synthetic-origin, confirmation, or bounded date checks are missing';
  END IF;
  RAISE NOTICE 'Synthetic request aggregate catalog checks passed. Verify with authorized synthetic accounts before deployment.';
END $$;
