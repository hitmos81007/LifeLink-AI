-- Run after 20261008280000_active_scoped_ambulance_fleet_access.sql.
-- Read-only catalog and privilege checks.
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['ambulance_providers', 'ambulances'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.'||v_table)) THEN
      RAISE EXCEPTION 'RLS is disabled on public.%', v_table;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=v_table AND 'authenticated'=ANY(roles)
        AND (qual ILIKE '%u.status IS TRUE%' OR with_check ILIKE '%u.status IS TRUE%')
    ) THEN
      RAISE EXCEPTION 'No active-account policy was found on public.%', v_table;
    END IF;
    IF has_table_privilege('authenticated','public.'||v_table,'DELETE') OR
       has_table_privilege('anon','public.'||v_table,'DELETE') THEN
      RAISE EXCEPTION 'Direct DELETE remains available on public.%', v_table;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='ambulances' AND cmd='UPDATE'
      AND with_check ILIKE '%ambulance_provider_id%'
      AND with_check ILIKE '%p.status = ''Active''%'
      AND with_check ILIKE '%u.status IS TRUE%'
  ) THEN
    RAISE EXCEPTION 'Ambulance updates are not scoped to active linked providers and accounts';
  END IF;
  RAISE NOTICE 'Active, provider-scoped fleet access and delete restrictions passed.';
END;
$$;
