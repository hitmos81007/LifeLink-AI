-- Read-only verifier for provider review status enum casts.
DO $$
DECLARE
  v_definition TEXT;
  v_cast_count INTEGER;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_definition
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'review_provider_account'
    AND p.pronargs = 3;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Missing public.review_provider_account(uuid,text,text)';
  END IF;

  v_cast_count := (
    length(lower(v_definition)) -
    length(replace(lower(v_definition), '::public.hospital_status', ''))
  ) / length('::public.hospital_status');

  IF v_cast_count < 3 THEN
    RAISE EXCEPTION 'Provider review RPC must cast hospital, blood bank, and ambulance status updates to public.hospital_status';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.review_provider_account(uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.review_provider_account(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Provider review RPC execute grants are incorrect';
  END IF;

  RAISE NOTICE 'Provider review status enum casts and execute grants are correct.';
END $$;
