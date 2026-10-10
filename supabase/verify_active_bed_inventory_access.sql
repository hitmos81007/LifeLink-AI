-- Run after 20261008320000_active_scoped_bed_inventory.sql.
-- Read-only policy and privilege verification.
DO $$
DECLARE v_table text; v_reserved_column text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['icu_inventory','general_bed_inventory'] LOOP
    v_reserved_column := CASE WHEN v_table='icu_inventory' THEN 'reserved_icu_beds' ELSE 'reserved_beds' END;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.'||v_table)) THEN
      RAISE EXCEPTION 'RLS is disabled on %', v_table;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_table
        AND cmd='SELECT' AND qual ILIKE '%u.status IS TRUE%'
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_table
        AND cmd='INSERT' AND with_check ILIKE '%u.status IS TRUE%'
        AND with_check ILIKE '%h.status = ''Active''%'
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_table
        AND cmd='UPDATE' AND qual ILIKE '%u.status IS TRUE%'
        AND with_check ILIKE '%u.status IS TRUE%'
        AND with_check ILIKE '%h.status = ''Active''%'
    ) THEN
      RAISE EXCEPTION 'Active account or facility policy is incomplete on %', v_table;
    END IF;
    IF has_column_privilege('authenticated','public.'||v_table,v_reserved_column,'UPDATE') THEN
      RAISE EXCEPTION 'Hospital users must not overwrite reserved bed counts on %', v_table;
    END IF;
  END LOOP;
  RAISE NOTICE 'Bed inventory reads/writes require active accounts and facilities; reserved counts remain protected.';
END;
$$;
