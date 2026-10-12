-- Read-only catalog verification for 20261012100000_capture_signup_location.sql.
DO $$
DECLARE
  v_validate REGPROCEDURE := to_regprocedure('public.validate_signup_location_label()');
  v_persist REGPROCEDURE := to_regprocedure('public.persist_signup_location_label()');
  v_validate_def TEXT;
  v_persist_def TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users'
      AND column_name='signup_location_label' AND data_type='text'
  ) THEN
    RAISE EXCEPTION 'users.signup_location_label is missing';
  END IF;

  IF v_validate IS NULL OR v_persist IS NULL THEN
    RAISE EXCEPTION 'Signup location trigger functions are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='auth.users'::regclass AND tgname='bbb_validate_signup_location_label' AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='auth.users'::regclass AND tgname='zzzz_persist_signup_location_label' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Signup location validation or persistence trigger is missing';
  END IF;

  SELECT pg_get_functiondef(v_validate) INTO v_validate_def;
  SELECT pg_get_functiondef(v_persist) INTO v_persist_def;
  IF position('length(v_location) NOT BETWEEN 2 AND 120' IN v_validate_def)=0
     OR position('location_label' IN v_validate_def)=0
     OR position('signup_location_label' IN v_persist_def)=0
     OR position('NEW.id' IN v_persist_def)=0 THEN
    RAISE EXCEPTION 'Signup location validation or persistence logic is incomplete';
  END IF;

  RAISE NOTICE 'PASS: public signup validates and persists a coarse location label on the user profile.';
END;
$$;
