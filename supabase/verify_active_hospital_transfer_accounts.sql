-- Run after 20261007150000_require_active_hospital_transfer_accounts.sql.
-- Read-only function/privilege checks; creates no users or transfer records.
DO $$
DECLARE
  v_request regprocedure := to_regprocedure('public.request_resource_transfer(uuid,text,text,integer,text,uuid)');
  v_transition regprocedure := to_regprocedure('public.transition_resource_transfer(uuid,text,integer,text)');
  v_request_internal regprocedure := to_regprocedure('public.request_resource_transfer_internal(uuid,text,text,integer,text,uuid)');
  v_transition_internal regprocedure := to_regprocedure('public.transition_resource_transfer_internal(uuid,text,integer,text)');
  v_definition text;
BEGIN
  IF v_request IS NULL OR v_transition IS NULL OR v_request_internal IS NULL OR v_transition_internal IS NULL THEN
    RAISE EXCEPTION 'Public active-account wrappers or internal transfer functions are missing';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_request)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_transition) THEN
    RAISE EXCEPTION 'Both public transfer wrappers must use SECURITY DEFINER code';
  END IF;
  IF NOT has_function_privilege('authenticated',v_request,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_transition,'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated users must be able to call both public transfer wrappers';
  END IF;
  IF has_function_privilege('anon',v_request,'EXECUTE')
     OR has_function_privilege('anon',v_transition,'EXECUTE')
     OR has_function_privilege('authenticated',v_request_internal,'EXECUTE')
     OR has_function_privilege('authenticated',v_transition_internal,'EXECUTE')
     OR has_function_privilege('anon',v_request_internal,'EXECUTE')
     OR has_function_privilege('anon',v_transition_internal,'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous access or direct API-role access to internal transfer functions is present';
  END IF;
  v_definition := pg_get_functiondef(v_request);
  IF position('hospital_admin' IN v_definition)=0 OR
     position('v_user.status IS DISTINCT FROM true' IN v_definition)=0 OR
     position('request_resource_transfer_internal' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Transfer request wrapper must require an active hospital administrator';
  END IF;
  v_definition := pg_get_functiondef(v_transition);
  IF position('hospital_admin' IN v_definition)=0 OR
     position('hospital_approver' IN v_definition)=0 OR
     position('v_user.status IS DISTINCT FROM true' IN v_definition)=0 OR
     position('transition_resource_transfer_internal' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Transfer transition wrapper must require an active hospital account';
  END IF;
  RAISE NOTICE 'Active hospital transfer account catalog checks passed.';
END $$;
