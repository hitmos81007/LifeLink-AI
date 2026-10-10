-- Run after 20261008300000_restrict_medicine_inventory_delete.sql.
-- Read-only schema and policy checks; creates no data.
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.medicine_inventory'::regclass) THEN
    RAISE EXCEPTION 'Medicine inventory RLS must remain enabled';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='medicine_inventory' AND policyname='medicine_inventory_read_active_scoped' AND cmd='SELECT' AND qual ILIKE '%status%') THEN
    RAISE EXCEPTION 'Active account and role-scoped medicine read policy is missing';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='medicine_inventory' AND policyname='medicine_inventory_insert_active_own_hospital' AND cmd='INSERT' AND with_check ILIKE '%status%' AND with_check ILIKE '%hospital_admin%') OR
     NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='medicine_inventory' AND policyname='medicine_inventory_update_active_own_hospital' AND cmd='UPDATE' AND qual ILIKE '%status%' AND with_check ILIKE '%status%' AND qual ILIKE '%hospital_admin%' AND with_check ILIKE '%hospital_admin%') THEN
    RAISE EXCEPTION 'Active hospital administrator insert/update policies are missing';
  END IF;
  IF has_table_privilege('authenticated','public.medicine_inventory','DELETE') OR
     has_table_privilege('anon','public.medicine_inventory','DELETE') OR EXISTS (
       SELECT 1 FROM information_schema.table_privileges
       WHERE table_schema='public' AND table_name='medicine_inventory'
         AND grantee='PUBLIC' AND privilege_type='DELETE'
     ) OR EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname='public' AND tablename='medicine_inventory' AND cmd IN ('ALL','DELETE')
     ) THEN
    RAISE EXCEPTION 'Direct or policy-authorized medicine inventory deletion remains available';
  END IF;
  IF has_column_privilege('authenticated','public.medicine_inventory','reserved_stock','UPDATE') THEN
    RAISE EXCEPTION 'Hospital users must not directly overwrite transfer-held medicine stock';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.medicine_inventory'::regclass AND tgname='medicine_transfer_identity_guard' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Medicine transfer identity guard is missing';
  END IF;
  IF position('t.status IN (''Pending'',''Approved'',''In Transit'')' IN pg_get_functiondef('public.guard_medicine_transfer_identity()'::regprocedure))=0 THEN
    RAISE EXCEPTION 'Medicine identity changes must be blocked during open transfers';
  END IF;
  RAISE NOTICE 'Medicine inventory active-account and transfer-reservation policy checks passed.';
END $$;
