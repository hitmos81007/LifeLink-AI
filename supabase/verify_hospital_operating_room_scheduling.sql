-- Run after 20261014180000_hospital_operating_room_scheduling.sql.
DO $$
BEGIN
  IF to_regclass('public.hospital_operating_rooms') IS NULL OR to_regclass('public.hospital_procedure_cases') IS NULL OR
     to_regclass('public.hospital_or_bookings') IS NULL OR to_regclass('public.hospital_or_booking_staff') IS NULL OR
     to_regclass('public.hospital_or_schedule_events') IS NULL THEN
    RAISE EXCEPTION 'One or more OR scheduling tables are missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY['hospital_operating_rooms','hospital_procedure_cases','hospital_or_bookings','hospital_or_booking_staff','hospital_or_schedule_events']) t
    WHERE NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=t AND c.relrowsecurity)
  ) THEN RAISE EXCEPTION 'RLS must be enabled on every OR scheduling table'; END IF;
  IF to_regprocedure('public.save_hospital_operating_room(uuid,text,text,text[],integer,integer,text,text)') IS NULL OR
     to_regprocedure('public.create_hospital_or_booking(uuid,text,integer,timestamptz,text[],text[],jsonb,text)') IS NULL OR
     to_regprocedure('public.transition_hospital_or_booking(uuid,integer,text,text)') IS NULL THEN
    RAISE EXCEPTION 'One or more trusted OR scheduling RPC functions are missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hospital_or_bookings' AND column_name='started_at') OR
     NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hospital_or_bookings' AND column_name='completed_at') THEN
    RAISE EXCEPTION 'OR booking lifecycle timestamp columns are missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hospital_or_schedule_events' AND column_name='room_id') THEN
    RAISE EXCEPTION 'Room-level audit linkage column is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public'
    AND table_name IN ('hospital_operating_rooms','hospital_procedure_cases','hospital_or_bookings','hospital_or_booking_staff','hospital_or_schedule_events')
    AND grantee='authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')) THEN
    RAISE EXCEPTION 'Authenticated clients must not have direct OR schedule mutation grants';
  END IF;
END $$;

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('hospital_operating_rooms','hospital_or_bookings','hospital_or_schedule_events')
ORDER BY table_name, ordinal_position;

SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('hospital_operating_rooms','hospital_procedure_cases','hospital_or_bookings','hospital_or_booking_staff','hospital_or_schedule_events')
ORDER BY c.relname;

SELECT tablename,policyname,cmd,roles FROM pg_policies WHERE schemaname='public'
  AND tablename IN ('hospital_operating_rooms','hospital_procedure_cases','hospital_or_bookings','hospital_or_booking_staff','hospital_or_schedule_events')
ORDER BY tablename,policyname;

-- Manual negative verification after applying to an isolated demo DB:
-- 1. As hospital A admin, create a room/proposal and confirm; verify one event per mutation.
-- 2. Confirm an overlapping same-room proposal and expect a turnaround conflict.
-- 3. Confirm two different-room proposals sharing a staff member and expect a staff overlap conflict.
-- 4. Use a staff account without a confirmed covering shift and expect confirmation to fail.
-- 5. As another hospital's admin and as a patient, query/write these tables; expect zero rows/no mutation.
