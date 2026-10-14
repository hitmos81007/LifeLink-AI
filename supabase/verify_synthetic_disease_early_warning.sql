-- Run after 20261008210000_synthetic_disease_early_warning.sql.
-- Read-only catalog and seed checks; creates no rows and changes no data.
DO $$
DECLARE
  v_read regprocedure := to_regprocedure('public.get_synthetic_disease_observations(integer)');
  v_refresh regprocedure := to_regprocedure('public.refresh_synthetic_disease_demo()');
  v_internal regprocedure := to_regprocedure('public.refresh_synthetic_disease_demo_internal()');
  v_count integer;
BEGIN
  IF to_regclass('public.synthetic_disease_observations') IS NULL THEN
    RAISE EXCEPTION 'Synthetic aggregate observation table is missing';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.synthetic_disease_observations'::regclass) THEN
    RAISE EXCEPTION 'RLS must be enabled on synthetic aggregate observations';
  END IF;
  IF NOT has_table_privilege('authenticated','public.synthetic_disease_observations','SELECT') OR
     has_table_privilege('authenticated','public.synthetic_disease_observations','INSERT') OR
     has_table_privilege('authenticated','public.synthetic_disease_observations','UPDATE') OR
     has_table_privilege('authenticated','public.synthetic_disease_observations','DELETE') OR
     has_table_privilege('anon','public.synthetic_disease_observations','SELECT') THEN
    RAISE EXCEPTION 'Direct table privileges do not match read-only authenticated access';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='synthetic_disease_observations'
      AND cmd='SELECT' AND 'authenticated'=ANY(roles)
      AND qual ILIKE '%government_admin%' AND qual ILIKE '%status%'
  ) THEN RAISE EXCEPTION 'Active government-only RLS policy is missing'; END IF;
  IF v_read IS NULL OR v_refresh IS NULL OR v_internal IS NULL THEN
    RAISE EXCEPTION 'Expected early-warning RPCs are missing';
  END IF;
  IF NOT has_function_privilege('authenticated',v_read,'EXECUTE') OR
     NOT has_function_privilege('authenticated',v_refresh,'EXECUTE') OR
     has_function_privilege('anon',v_read,'EXECUTE') OR has_function_privilege('anon',v_refresh,'EXECUTE') OR
     has_function_privilege('authenticated',v_internal,'EXECUTE') OR has_function_privilege('anon',v_internal,'EXECUTE') THEN
    RAISE EXCEPTION 'Early-warning RPC grants are too broad or incomplete';
  END IF;
  IF position('v_user.status IS DISTINCT FROM true' IN pg_get_functiondef(v_read))=0 OR
     position('v_user.role::text <> ''government_admin''' IN pg_get_functiondef(v_read))=0 OR
     position('v_user.status IS DISTINCT FROM true' IN pg_get_functiondef(v_refresh))=0 OR
     position('v_user.role::text <> ''government_admin''' IN pg_get_functiondef(v_refresh))=0 THEN
    RAISE EXCEPTION 'Active government role checks are missing from RPCs';
  END IF;
  SELECT count(*) INTO v_count FROM public.synthetic_disease_observations;
  IF v_count < 252 THEN RAISE EXCEPTION 'Expected at least 252 seeded aggregate observations; found %',v_count; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.synthetic_disease_observations
    WHERE district='Synthetic district A' AND syndrome='Respiratory' AND observed_on >= current_date - 6
    GROUP BY district, syndrome HAVING sum(case_count) >= 60
  ) THEN RAISE EXCEPTION 'Seeded respiratory surge does not exercise an elevated signal'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.synthetic_disease_observations
    WHERE case_count < 0 OR admission_count < 0 OR admission_count > case_count OR oxygen_units_consumed < 0
  ) THEN RAISE EXCEPTION 'Invalid aggregate values exist'; END IF;
  RAISE NOTICE 'Synthetic early-warning schema, role gates, and known surge seed passed.';
END $$;
