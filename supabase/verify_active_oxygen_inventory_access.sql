-- Run after 20261008310000_active_scoped_oxygen_inventory.sql.
-- Read-only policy and privilege verification.
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.oxygen_inventory'::regclass) THEN
    RAISE EXCEPTION 'RLS is disabled on oxygen_inventory';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='oxygen_inventory'
      AND policyname='oxygen_inventory_read_active_scoped' AND cmd='SELECT'
      AND qual ILIKE '%u.status IS TRUE%'
  ) THEN RAISE EXCEPTION 'Active-account oxygen read policy is missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='oxygen_inventory'
      AND policyname='oxygen_inventory_insert_active_own_hospital' AND cmd='INSERT'
      AND with_check ILIKE '%u.status IS TRUE%'
      AND with_check ILIKE '%hospital_admin%'
      AND with_check ILIKE '%h.status = ''Active''%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='oxygen_inventory'
      AND policyname='oxygen_inventory_update_active_own_hospital' AND cmd='UPDATE'
      AND qual ILIKE '%u.status IS TRUE%'
      AND with_check ILIKE '%u.status IS TRUE%'
      AND with_check ILIKE '%h.status = ''Active''%'
  ) THEN RAISE EXCEPTION 'Active linked hospital oxygen write policies are incomplete'; END IF;
  IF has_column_privilege('authenticated','public.oxygen_inventory','reserved_capacity','UPDATE') THEN
    RAISE EXCEPTION 'Hospital users must not overwrite transfer-held oxygen capacity';
  END IF;
  RAISE NOTICE 'Oxygen inventory access requires active linked accounts; transfer-held capacity remains protected.';
END;
$$;
