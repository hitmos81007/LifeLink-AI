-- Run after 20261014120000_hospital_resource_planning_scenarios.sql in Supabase SQL Editor.
DO $$
BEGIN
  IF to_regclass('public.hospital_resource_planning_scenarios') IS NULL THEN
    RAISE EXCEPTION 'Hospital resource planning table is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.hospital_resource_planning_scenarios'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'Row-level security is not enabled on hospital planning scenarios';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hospital_resource_planning_scenarios' AND policyname = 'hospital_resource_planning_scenarios_read_own_facility' AND cmd = 'SELECT') THEN
    RAISE EXCEPTION 'Hospital-scoped scenario read policy is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hospital_resource_planning_scenarios' AND policyname = 'hospital_resource_planning_scenarios_insert_own_facility' AND cmd = 'INSERT') THEN
    RAISE EXCEPTION 'Hospital-scoped scenario insert policy is missing';
  END IF;
END;
$$;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'hospital_resource_planning_scenarios'
ORDER BY ordinal_position;
SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'hospital_resource_planning_scenarios'
ORDER BY policyname;
