-- Read-only verification for 20261012120000_capture_signup_gps_coordinates.sql.
DO $$
DECLARE
  v_validate REGPROCEDURE := to_regprocedure('public.validate_signup_gps_coordinates()');
  v_persist REGPROCEDURE := to_regprocedure('public.persist_signup_gps_coordinates()');
  v_validate_def TEXT;
  v_persist_def TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='signup_latitude'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='signup_longitude'
  ) THEN
    RAISE EXCEPTION 'Signup GPS coordinate columns are missing from public.users';
  END IF;

  IF v_validate IS NULL OR v_persist IS NULL
     OR NOT has_function_privilege('supabase_auth_admin', v_validate, 'EXECUTE')
     OR NOT has_function_privilege('supabase_auth_admin', v_persist, 'EXECUTE') THEN
    RAISE EXCEPTION 'Signup GPS trigger functions or auth trigger execution grants are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='auth.users'::regclass AND tgname='aab_validate_signup_gps_coordinates' AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='auth.users'::regclass AND tgname='zzzzz_persist_signup_gps_coordinates' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Signup GPS validation or persistence trigger is missing';
  END IF;

  SELECT pg_get_functiondef(v_validate) INTO v_validate_def;
  SELECT pg_get_functiondef(v_persist) INTO v_persist_def;
  IF position('GPS coordinates are required' IN v_validate_def)=0
     OR position('NOT BETWEEN -90 AND 90' IN v_validate_def)=0
     OR position('signup_latitude' IN v_persist_def)=0
     OR position('round(v_latitude, 2)' IN v_persist_def)=0 THEN
    RAISE EXCEPTION 'GPS coordinate validation, profile persistence, or patient rounding is incomplete';
  END IF;

  RAISE NOTICE 'PASS: signup requires valid GPS/map coordinates and stores patient coordinates at coarse precision.';
END;
$$;
