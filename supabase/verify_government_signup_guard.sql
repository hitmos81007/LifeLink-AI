DO $$
DECLARE
  v_trigger_exists BOOLEAN;
  v_function_definition TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth'
      AND c.relname = 'users'
      AND t.tgname = 'guard_government_admin_signup'
      AND (t.tgtype & 2) = 2 -- BEFORE
      AND (t.tgtype & 4) = 4 -- INSERT
      AND (t.tgtype & 1) = 1 -- FOR EACH ROW
      AND NOT t.tgisinternal
  ) INTO v_trigger_exists;
  IF NOT v_trigger_exists THEN
    RAISE EXCEPTION 'Verification failed: government-admin signup trigger is missing';
  END IF;

  SELECT pg_get_functiondef('public.guard_government_admin_signup()'::regprocedure)
    INTO v_function_definition;
  IF position('trusted_role_provisioning' IN v_function_definition) = 0
     OR position('government_admin' IN v_function_definition) = 0 THEN
    RAISE EXCEPTION 'Verification failed: trusted provisioning guard is incomplete';
  END IF;
  RAISE NOTICE 'Verification passed: public government_admin signup is guarded.';
END;
$$;
