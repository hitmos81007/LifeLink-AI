-- Read-only catalog assertion for the restricted candidate projection and
-- transactional stale-data guard. Run after the two freshness migrations.
DO $$
DECLARE
  v_network regprocedure := to_regprocedure('public.get_clinician_review_network()');
  v_approval regprocedure := to_regprocedure('public.approve_emergency_request(uuid,uuid,uuid,uuid,text)');
  v_network_definition text;
  v_approval_definition text;
BEGIN
  IF v_network IS NULL OR v_approval IS NULL THEN
    RAISE EXCEPTION 'Clinician freshness RPCs are missing';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_network)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_approval) THEN
    RAISE EXCEPTION 'Clinician freshness RPCs must remain SECURITY DEFINER';
  END IF;
  IF has_function_privilege('anon', v_network, 'EXECUTE')
     OR has_function_privilege('anon', v_approval, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_approval, 'EXECUTE') THEN
    RAISE EXCEPTION 'Clinician freshness RPC grants are incorrect';
  END IF;

  v_network_definition := pg_get_functiondef(v_network);
  IF position('icu_updated_at' IN v_network_definition) = 0
     OR position('beds_updated_at' IN v_network_definition) = 0
     OR position('oxygen_updated_at' IN v_network_definition) = 0
     OR position('blood_updated_at' IN v_network_definition) = 0
     OR position('available_records' IN v_network_definition) = 0
     OR position('interval ''1 hour''' IN v_network_definition) = 0
     OR position('updated_at' IN v_network_definition) = 0
     OR position('driver_phone' IN v_network_definition) > 0
     OR position('driver_name' IN v_network_definition) > 0 THEN
    RAISE EXCEPTION 'Review snapshot freshness fields are incomplete or private fleet fields leaked';
  END IF;

  v_approval_definition := pg_get_functiondef(v_approval);
  IF position('interval ''15 minutes''' IN v_approval_definition) = 0
     OR position('interval ''1 hour''' IN v_approval_definition) = 0
     OR position('approve_emergency_request_internal' IN v_approval_definition) = 0
     OR position('data_origin IS DISTINCT FROM ''synthetic''' IN v_approval_definition) = 0 THEN
    RAISE EXCEPTION 'Transactional approval does not enforce freshness and the synthetic-only review boundary';
  END IF;
  RAISE NOTICE 'Clinician candidate freshness and transactional approval guards are present.';
END $$;
