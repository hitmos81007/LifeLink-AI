-- Run after 20261014170000_hospital_workforce_and_demand_module.sql.
DO $$
DECLARE v_role_exists BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='user_role' AND e.enumlabel='hospital_staff') INTO v_role_exists;
  IF NOT v_role_exists THEN RAISE EXCEPTION 'hospital_staff role is missing'; END IF;
  IF to_regclass('public.hospital_staff') IS NULL OR to_regclass('public.hospital_staff_invites') IS NULL OR
     to_regclass('public.hospital_staff_shifts') IS NULL OR to_regclass('public.hospital_activity_daily') IS NULL OR
     to_regclass('public.hospital_supply_usage') IS NULL THEN
    RAISE EXCEPTION 'One or more hospital workforce and demand tables are missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.hospital_staff'::regclass AND relrowsecurity) OR
     NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.hospital_staff_invites'::regclass AND relrowsecurity) OR
     NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.hospital_staff_shifts'::regclass AND relrowsecurity) OR
     NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.hospital_activity_daily'::regclass AND relrowsecurity) OR
     NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.hospital_supply_usage'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'Row-level security is missing from an operations table';
  END IF;
  IF to_regprocedure('public.create_hospital_staff_invite(text,text,text,text,text,text[],numeric)') IS NULL OR
     to_regprocedure('public.reissue_hospital_staff_invite(uuid)') IS NULL OR
     to_regprocedure('public.set_hospital_staff_access(uuid,boolean)') IS NULL OR
     to_regprocedure('public.prepare_hospital_staff_signup()') IS NULL OR
     to_regprocedure('public.finalize_hospital_staff_signup()') IS NULL THEN
    RAISE EXCEPTION 'Staff invite or signup trigger functions are missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='aaa_prepare_hospital_staff_signup' AND NOT tgisinternal) OR
     NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='zzz_finalize_hospital_staff_signup' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Invitation-bound staff signup triggers are missing';
  END IF;
END $$;

SELECT t.table_name, c.relrowsecurity AS row_security
FROM information_schema.tables t
JOIN pg_class c ON c.relname=t.table_name
JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname=t.table_schema
WHERE t.table_schema='public' AND t.table_name IN ('hospital_staff','hospital_staff_invites','hospital_staff_shifts','hospital_activity_daily','hospital_supply_usage')
ORDER BY table_name;

SELECT tablename, policyname, cmd, roles FROM pg_policies
WHERE schemaname='public' AND tablename IN ('hospital_staff','hospital_staff_invites','hospital_staff_shifts','hospital_activity_daily','hospital_supply_usage')
ORDER BY tablename, policyname;
