-- Run after 20261007180000_require_active_accounts_for_analytics_and_mci.sql.
-- Read-only function catalog/privilege checks; creates no rows.
DO $$
DECLARE
  v_gov regprocedure := to_regprocedure('public.get_government_emergency_case_count()');
  v_gov_internal regprocedure := to_regprocedure('public.get_government_emergency_case_count_internal()');
  v_recs regprocedure := to_regprocedure('public.save_synthetic_recommendations(uuid,jsonb)');
  v_recs_internal regprocedure := to_regprocedure('public.save_synthetic_recommendations_internal(uuid,jsonb)');
  v_definition text;
BEGIN
  IF v_gov IS NULL OR v_gov_internal IS NULL OR v_recs IS NULL OR v_recs_internal IS NULL THEN
    RAISE EXCEPTION 'Active-account analytics wrappers or internal functions are missing';
  END IF;
  FOREACH v_definition IN ARRAY ARRAY[pg_get_functiondef(v_gov),pg_get_functiondef(v_recs)] LOOP
    IF position('v_user.status IS DISTINCT FROM true' IN v_definition)=0 OR position('auth.uid()' IN v_definition)=0 THEN
      RAISE EXCEPTION 'Analytics wrapper is missing its active authenticated account check';
    END IF;
  END LOOP;
  IF NOT has_function_privilege('authenticated',v_gov,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_recs,'EXECUTE')
     OR has_function_privilege('anon',v_gov,'EXECUTE')
     OR has_function_privilege('anon',v_recs,'EXECUTE')
     OR has_function_privilege('authenticated',v_gov_internal,'EXECUTE')
     OR has_function_privilege('authenticated',v_recs_internal,'EXECUTE')
     OR has_function_privilege('anon',v_gov_internal,'EXECUTE')
     OR has_function_privilege('anon',v_recs_internal,'EXECUTE') THEN
    RAISE EXCEPTION 'Analytics wrapper grants are invalid or internal implementation functions are exposed';
  END IF;
  RAISE NOTICE 'Active analytics account checks passed.';
END $$;
