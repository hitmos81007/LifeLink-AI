-- Run after 20261008180000_restrict_transfer_remarks_to_fixed_labels.sql.
DO $$
DECLARE
  v_request_definition TEXT;
  v_transition_definition TEXT;
  v_request_body TEXT;
  v_transition_body TEXT;
BEGIN
  SELECT pg_get_functiondef('public.request_resource_transfer(uuid,text,text,integer,text,uuid)'::regprocedure)
    INTO v_request_definition;
  SELECT pg_get_functiondef('public.transition_resource_transfer(uuid,text,integer,text)'::regprocedure)
    INTO v_transition_definition;

  IF v_request_definition IS NULL OR v_transition_definition IS NULL THEN
    RAISE EXCEPTION 'Expected authenticated transfer RPC wrappers are missing';
  END IF;

  v_request_body := substring(v_request_definition FROM position('AS $$' IN v_request_definition) + 5);
  v_transition_body := substring(v_transition_definition FROM position('AS $$' IN v_transition_definition) + 5);

  IF position('p_remarks' IN v_request_body) > 0
     OR position('p_quantity, NULL, p_idempotency_key' IN v_request_body) = 0 THEN
    RAISE EXCEPTION 'Transfer request wrapper can still persist caller supplied remarks';
  END IF;

  IF position('p_remarks' IN v_transition_body) > 0
     OR position('v_safe_remarks' IN v_transition_body) = 0
     OR position('CASE p_new_status' IN v_transition_body) = 0
     OR position('p_transfer_id, p_new_status, p_quantity, v_safe_remarks' IN v_transition_body) = 0 THEN
    RAISE EXCEPTION 'Transfer transition wrapper can still persist caller supplied remarks';
  END IF;

  IF has_function_privilege('anon','public.request_resource_transfer(uuid,text,text,integer,text,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.transition_resource_transfer(uuid,text,integer,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.request_resource_transfer(uuid,text,text,integer,text,uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.transition_resource_transfer(uuid,text,integer,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Transfer RPC grants do not preserve the authenticated-only boundary';
  END IF;
END;
$$;
