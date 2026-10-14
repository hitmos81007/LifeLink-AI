-- Read-only checks after migrations 20261008320000, 20261008330000 and
-- 20261009107000 have been reconciled and applied.
DO $$
DECLARE v_fn regprocedure := 'public.update_general_bed_inventory(uuid,integer,integer,integer,timestamp with time zone,text)'::regprocedure;
BEGIN
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_fn) THEN
    RAISE EXCEPTION 'General-bed update RPC must be SECURITY DEFINER';
  END IF;
  IF NOT has_function_privilege('authenticated',v_fn,'EXECUTE')
     OR has_function_privilege('anon',v_fn,'EXECUTE') THEN
    RAISE EXCEPTION 'General-bed update RPC grants are not restricted';
  END IF;
  IF has_table_privilege('authenticated','public.general_bed_inventory','INSERT')
     OR has_table_privilege('authenticated','public.general_bed_inventory','UPDATE')
     OR has_table_privilege('authenticated','public.general_bed_inventory','DELETE')
     OR has_table_privilege('authenticated','public.general_bed_inventory','TRUNCATE')
     OR has_column_privilege('authenticated','public.general_bed_inventory','minimum_beds','INSERT')
     OR has_column_privilege('authenticated','public.general_bed_inventory','minimum_beds','UPDATE') THEN
    RAISE EXCEPTION 'Authenticated users retain direct general-bed write privileges';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='general_bed_inventory'
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
  ) THEN
    RAISE EXCEPTION 'Direct-write RLS policies remain on general-bed inventory';
  END IF;
  IF NOT has_table_privilege('authenticated','public.general_bed_inventory','SELECT') THEN
    RAISE EXCEPTION 'Authenticated scoped inventory reads must remain available';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='audit_logs'
      AND column_name='record_id' AND data_type='uuid'
  ) THEN
    RAISE EXCEPTION 'Audit log record_id must be UUID-compatible with inventory row identifiers';
  END IF;
  RAISE NOTICE 'General-bed changes are transactional, audited, version checked and restricted to the assigned active hospital administrator.';
END;
$$;
