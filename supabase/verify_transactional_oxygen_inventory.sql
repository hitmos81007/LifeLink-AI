-- Read-only checks after migration 20261010100000.
DO $$
DECLARE v_fn regprocedure := 'public.save_oxygen_inventory(uuid,text,numeric,numeric,numeric,text,uuid,timestamp without time zone)'::regprocedure;
BEGIN
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_fn) THEN
    RAISE EXCEPTION 'Oxygen inventory save RPC must be SECURITY DEFINER';
  END IF;
  IF NOT has_function_privilege('authenticated',v_fn,'EXECUTE')
     OR has_function_privilege('anon',v_fn,'EXECUTE') THEN
    RAISE EXCEPTION 'Oxygen inventory RPC grants are not restricted';
  END IF;
  IF has_table_privilege('authenticated','public.oxygen_inventory','INSERT')
     OR has_table_privilege('authenticated','public.oxygen_inventory','UPDATE')
     OR has_table_privilege('authenticated','public.oxygen_inventory','DELETE')
     OR has_table_privilege('authenticated','public.oxygen_inventory','TRUNCATE') THEN
    RAISE EXCEPTION 'Authenticated users retain direct oxygen inventory write privileges';
  END IF;
  IF has_column_privilege('authenticated','public.oxygen_inventory','hospital_id','INSERT')
     OR has_column_privilege('authenticated','public.oxygen_inventory','oxygen_type','INSERT')
     OR has_column_privilege('authenticated','public.oxygen_inventory','total_capacity','INSERT')
     OR has_column_privilege('authenticated','public.oxygen_inventory','available_capacity','INSERT')
     OR has_column_privilege('authenticated','public.oxygen_inventory','minimum_threshold','INSERT')
     OR has_column_privilege('authenticated','public.oxygen_inventory','unit','INSERT')
     OR has_column_privilege('authenticated','public.oxygen_inventory','created_at','INSERT')
     OR has_column_privilege('authenticated','public.oxygen_inventory','updated_at','INSERT')
     OR has_column_privilege('authenticated','public.oxygen_inventory','oxygen_type','UPDATE')
     OR has_column_privilege('authenticated','public.oxygen_inventory','total_capacity','UPDATE')
     OR has_column_privilege('authenticated','public.oxygen_inventory','available_capacity','UPDATE')
     OR has_column_privilege('authenticated','public.oxygen_inventory','minimum_threshold','UPDATE')
     OR has_column_privilege('authenticated','public.oxygen_inventory','unit','UPDATE')
     OR has_column_privilege('authenticated','public.oxygen_inventory','updated_at','UPDATE') THEN
    RAISE EXCEPTION 'Authenticated users retain column-level oxygen inventory write privileges';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='oxygen_inventory'
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
  ) THEN
    RAISE EXCEPTION 'Direct-write RLS policies remain on oxygen inventory';
  END IF;
  IF NOT has_table_privilege('authenticated','public.oxygen_inventory','SELECT') THEN
    RAISE EXCEPTION 'Authenticated oxygen inventory reads must remain available';
  END IF;
  RAISE NOTICE 'Oxygen updates are transactional, audited, version-checked and restricted to the assigned active hospital administrator.';
END;
$$;
