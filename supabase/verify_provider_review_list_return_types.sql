-- Read-only verifier for the provider-review RPC return-type correction.
DO $$
DECLARE
  v_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_definition
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'list_provider_accounts_for_review'
    AND p.pronargs = 0;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Missing public.list_provider_accounts_for_review()';
  END IF;

  IF position('u.account_status::text' IN v_definition) = 0
     OR position('u.full_name::text' IN v_definition) = 0
     OR position('u.email::text' IN v_definition) = 0
     OR position('coalesce(h.hospital_name, b.blood_bank_name, a.provider_name)::text' IN lower(v_definition)) = 0
     OR position('coalesce(h.district, b.district, a.district)::text' IN lower(v_definition)) = 0
     OR position('coalesce(h.state, b.state, a.state)::text' IN lower(v_definition)) = 0 THEN
    RAISE EXCEPTION 'Provider-review RPC is missing explicit casts for declared TEXT outputs';
  END IF;

  RAISE NOTICE 'Provider-review RPC output casts are present.';
END $$;
