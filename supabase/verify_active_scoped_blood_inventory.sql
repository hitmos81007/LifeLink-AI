-- Run after 20261007210000_active_scoped_blood_inventory.sql.
DO $$
DECLARE
  v_read_using text;
  v_write_using text;
  v_write_check text;
BEGIN
  SELECT qual INTO v_read_using
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'blood_inventory'
    AND policyname = 'blood_inventory_read_active_scoped';

  SELECT qual, with_check INTO v_write_using, v_write_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'blood_inventory'
    AND policyname = 'blood_inventory_write_active_own_bank';

  IF v_read_using IS NULL OR v_read_using ILIKE '%OR TRUE%' OR v_read_using NOT ILIKE '%status%'
     OR v_write_using IS NULL OR v_write_using ILIKE '%OR TRUE%' OR v_write_using NOT ILIKE '%blood_bank_admin%'
     OR v_write_check IS NULL OR v_write_check ILIKE '%OR TRUE%' OR v_write_check NOT ILIKE '%blood_bank_admin%' THEN
    RAISE EXCEPTION 'Blood inventory RLS policies are missing or too permissive';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'blood_inventory'
      AND policyname IN ('Allow select for authenticated users', 'Allow all for authenticated users')
  ) THEN
    RAISE EXCEPTION 'A legacy broad blood inventory policy is still installed';
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.notify_low_blood_stock(text,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'Blood stock notification RPC is missing';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.notify_low_blood_stock(text,integer,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.notify_low_blood_stock(text,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Blood stock notification RPC grants are incorrect';
  END IF;
END;
$$;

SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'blood_inventory'
ORDER BY policyname;
