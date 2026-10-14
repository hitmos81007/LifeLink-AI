-- Read-only verification for the provider-account approval migration.
DO $$
DECLARE v_role_exists BOOLEAN; v_rls BOOLEAN; v_policy BOOLEAN; v_trigger BOOLEAN; v_function BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
    JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='user_role' AND e.enumlabel='platform_admin') INTO v_role_exists;
  IF NOT v_role_exists THEN RAISE EXCEPTION 'Missing public.user_role platform_admin value'; END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='account_status')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hospitals' AND column_name='verification_status')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='blood_banks' AND column_name='verification_status')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ambulance_providers' AND column_name='verification_status') THEN
    RAISE EXCEPTION 'Missing account or provider verification status column';
  END IF;

  IF EXISTS (SELECT 1 FROM public.users
    WHERE (account_status='active') IS DISTINCT FROM (status IS TRUE)) THEN
    RAISE EXCEPTION 'User account_status does not agree with the authoritative active flag';
  END IF;

  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid='public.provider_account_reviews'::regclass;
  IF v_rls IS DISTINCT FROM true THEN RAISE EXCEPTION 'provider_account_reviews RLS is not enabled'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='provider_account_reviews' AND column_name='provider_id' AND is_nullable='NO') THEN
    RAISE EXCEPTION 'provider_account_reviews must allow audit events for legacy unlinked provider accounts';
  END IF;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='provider_account_reviews'
    AND policyname='provider_account_reviews_platform_admin_read') INTO v_policy;
  IF NOT v_policy THEN RAISE EXCEPTION 'Missing platform-admin-only provider review history policy'; END IF;
  SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass
    AND tgname='zzz_queue_provider_signup_for_review' AND NOT tgisinternal AND tgenabled='O') INTO v_trigger;
  IF NOT v_trigger THEN RAISE EXCEPTION 'Missing enabled provider signup review trigger'; END IF;
  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='review_provider_account') INTO v_function;
  IF NOT v_function THEN RAISE EXCEPTION 'Missing provider-account review RPC'; END IF;

  RAISE NOTICE 'Provider-account approval schema and entry points are present.';
END $$;
