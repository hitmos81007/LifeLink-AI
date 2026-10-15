-- Run after 20261007140000_require_active_clinician_for_review.sql.
-- Read-only function/privilege checks; creates no users or records.
DO $$
DECLARE
  v_approve regprocedure := to_regprocedure('public.approve_emergency_request(uuid,uuid,uuid,uuid,text)');
  v_reject regprocedure := to_regprocedure('public.reject_emergency_request(uuid,text)');
  v_approve_internal regprocedure := to_regprocedure('public.approve_emergency_request_internal(uuid,uuid,uuid,uuid,text)');
  v_reject_internal regprocedure := to_regprocedure('public.reject_emergency_request_internal(uuid,text)');
  v_definition text;
BEGIN
  IF v_approve IS NULL OR v_reject IS NULL OR v_approve_internal IS NULL OR v_reject_internal IS NULL THEN
    RAISE EXCEPTION 'Public active-review wrappers or internal review functions are missing';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_approve)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_reject) THEN
    RAISE EXCEPTION 'Both public review wrappers must enforce authorization in SECURITY DEFINER code';
  END IF;
  IF NOT has_function_privilege('authenticated',v_approve,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_reject,'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role must be able to call both public review wrappers';
  END IF;
  IF has_function_privilege('anon',v_approve,'EXECUTE')
     OR has_function_privilege('anon',v_reject,'EXECUTE')
     OR has_function_privilege('authenticated',v_approve_internal,'EXECUTE')
     OR has_function_privilege('authenticated',v_reject_internal,'EXECUTE')
     OR has_function_privilege('anon',v_approve_internal,'EXECUTE')
     OR has_function_privilege('anon',v_reject_internal,'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous access or direct API-role access to internal review functions is present';
  END IF;
  v_definition := pg_get_functiondef(v_approve);
  IF position('clinician_reviewer' IN v_definition)=0 OR
     position('v_user.status IS DISTINCT FROM true' IN v_definition)=0 OR
     position('approve_emergency_request_internal' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Approval wrapper must require an active reviewer and delegate to the protected implementation';
  END IF;
  v_definition := pg_get_functiondef(v_reject);
  IF position('clinician_reviewer' IN v_definition)=0 OR
     position('v_user.status IS DISTINCT FROM true' IN v_definition)=0 OR
     position('reject_emergency_request_internal' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Rejection wrapper must require an active reviewer and delegate to the protected implementation';
  END IF;
  RAISE NOTICE 'Active clinician review wrapper catalog checks passed.';
END $$;
