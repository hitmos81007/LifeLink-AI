-- Run after 20261007180000_require_active_accounts_for_analytics_and_mci.sql is applied.
-- Read-only catalog/privilege verification; creates no rows and changes no data.
DO $$
DECLARE
  v_table text;
  v_create regprocedure := to_regprocedure('public.create_incident_plan(text,text,integer,jsonb,jsonb,timestamp with time zone,timestamp with time zone,numeric,numeric)');
  v_review regprocedure := to_regprocedure('public.review_incident_plan(uuid,text,text,jsonb)');
BEGIN
  FOREACH v_table IN ARRAY ARRAY['incidents','incident_versions','incident_resource_plans','plan_reviews'] LOOP
    IF to_regclass('public.'||v_table) IS NULL THEN RAISE EXCEPTION 'Missing incident planning table: %',v_table; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.'||v_table)) THEN RAISE EXCEPTION 'RLS is disabled on %',v_table; END IF;
    IF NOT has_table_privilege('authenticated','public.'||v_table,'SELECT') THEN RAISE EXCEPTION 'Authenticated SELECT is missing on %',v_table; END IF;
    IF has_table_privilege('authenticated','public.'||v_table,'INSERT') OR
       has_table_privilege('authenticated','public.'||v_table,'UPDATE') OR
       has_table_privilege('authenticated','public.'||v_table,'DELETE') THEN RAISE EXCEPTION 'Direct writes must be denied on %',v_table; END IF;
    IF has_table_privilege('anon','public.'||v_table,'SELECT') THEN RAISE EXCEPTION 'Anonymous SELECT must be denied on %',v_table; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=v_table AND cmd='SELECT'
        AND 'authenticated'=ANY(roles)
        AND qual ILIKE '%government_admin%' AND qual ILIKE '%clinician_reviewer%' AND qual ILIKE '%status%'
    ) THEN RAISE EXCEPTION 'Coordinator/reviewer SELECT policy is missing or incomplete on %',v_table; END IF;
  END LOOP;
  IF v_create IS NULL OR v_review IS NULL THEN RAISE EXCEPTION 'Expected incident RPC functions are missing'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_create) OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_review) THEN
    RAISE EXCEPTION 'Incident RPCs must enforce authorization inside SECURITY DEFINER functions';
  END IF;
  IF NOT has_function_privilege('authenticated',v_create,'EXECUTE') OR NOT has_function_privilege('authenticated',v_review,'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated execution grants are missing';
  END IF;
  IF has_function_privilege('anon',v_create,'EXECUTE') OR has_function_privilege('anon',v_review,'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous execution must be denied';
  END IF;
  IF position('government_admin' IN pg_get_functiondef(v_create))=0 OR
     position('clinician_reviewer' IN pg_get_functiondef(v_review))=0 OR
     position('v_user.status IS DISTINCT FROM true' IN pg_get_functiondef(v_create))=0 OR
     position('v_user.status IS DISTINCT FROM true' IN pg_get_functiondef(v_review))=0 THEN
    RAISE EXCEPTION 'Active coordinator/reviewer checks are missing from incident RPC definitions';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.incident_versions'::regclass AND contype='u' AND conname='incident_versions_incident_id_version_number_key') THEN
    RAISE EXCEPTION 'Per-incident version uniqueness is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.plan_reviews'::regclass AND contype='u' AND conname='plan_reviews_incident_version_id_key') THEN
    RAISE EXCEPTION 'One-review-per-version constraint is missing';
  END IF;
  RAISE NOTICE 'Incident planning catalog and privilege checks passed. Run role-scoped RPC scenarios before enabling this workflow for users.';
END $$;
