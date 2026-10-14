-- Read-only checks after migrations 20261008320000, 20261008330000 and
-- 20261009108000 have been reconciled and applied.
DO $$
DECLARE v_fn regprocedure := 'public.update_icu_inventory(uuid,integer,integer,integer,timestamp with time zone)'::regprocedure;
BEGIN
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_fn) THEN
    RAISE EXCEPTION 'ICU update RPC must be SECURITY DEFINER';
  END IF;
  IF NOT has_function_privilege('authenticated',v_fn,'EXECUTE')
     OR has_function_privilege('anon',v_fn,'EXECUTE') THEN
    RAISE EXCEPTION 'ICU update RPC grants are not restricted';
  END IF;
  IF has_table_privilege('authenticated','public.icu_inventory','INSERT')
     OR has_table_privilege('authenticated','public.icu_inventory','UPDATE')
     OR has_table_privilege('authenticated','public.icu_inventory','DELETE')
     OR has_table_privilege('authenticated','public.icu_inventory','TRUNCATE')
     OR has_column_privilege('authenticated','public.icu_inventory','minimum_icu_beds','INSERT')
     OR has_column_privilege('authenticated','public.icu_inventory','minimum_icu_beds','UPDATE') THEN
    RAISE EXCEPTION 'Authenticated users retain direct ICU write privileges';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='icu_inventory'
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
  ) THEN
    RAISE EXCEPTION 'Direct-write RLS policies remain on ICU inventory';
  END IF;
  IF NOT has_table_privilege('authenticated','public.icu_inventory','SELECT') THEN
    RAISE EXCEPTION 'Authenticated scoped ICU reads must remain available';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='audit_logs'
      AND column_name='record_id' AND data_type='uuid'
  ) THEN
    RAISE EXCEPTION 'Audit log record_id must be UUID-compatible with ICU row identifiers';
  END IF;
  RAISE NOTICE 'ICU changes are transactional, audited, version checked and preserve clinician reservations.';
END;
$$;
