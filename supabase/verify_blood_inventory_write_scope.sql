-- Run after 20261008290000_restrict_blood_inventory_delete.sql.
-- Read-only policy and privilege checks.
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.blood_inventory'::regclass) THEN
    RAISE EXCEPTION 'RLS is disabled on blood_inventory';
  END IF;
  IF has_table_privilege('authenticated','public.blood_inventory','DELETE') OR
     has_table_privilege('anon','public.blood_inventory','DELETE') OR EXISTS (
       SELECT 1 FROM information_schema.table_privileges
       WHERE table_schema='public' AND table_name='blood_inventory'
         AND grantee='PUBLIC' AND privilege_type='DELETE'
     ) THEN
    RAISE EXCEPTION 'Direct deletion remains available on blood_inventory';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='blood_inventory' AND cmd IN ('ALL','DELETE')
  ) THEN
    RAISE EXCEPTION 'A broad or delete policy remains on blood_inventory';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='blood_inventory' AND cmd='INSERT'
      AND with_check ILIKE '%u.status IS TRUE%'
      AND with_check ILIKE '%blood_bank_admin%'
      AND with_check ILIKE '%blood_bank_id%'
      AND with_check ILIKE '%Active%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='blood_inventory' AND cmd='UPDATE'
      AND qual ILIKE '%u.status IS TRUE%'
      AND with_check ILIKE '%u.status IS TRUE%'
      AND qual ILIKE '%blood_bank_admin%'
      AND with_check ILIKE '%blood_bank_admin%'
  ) THEN
    RAISE EXCEPTION 'Active same-bank blood inventory write policies are incomplete';
  END IF;
  RAISE NOTICE 'Blood inventory is writable only by active linked bank admins and cannot be deleted.';
END;
$$;
