-- Run after 20261007140000_require_active_clinician_for_review.sql is applied.
-- Read-only catalog/privilege verification; does not create test users or records.
DO $$
DECLARE
  v_approve regprocedure := to_regprocedure('public.approve_emergency_request(uuid,uuid,uuid,uuid,text)');
  v_approve_internal regprocedure := to_regprocedure('public.approve_emergency_request_internal(uuid,uuid,uuid,uuid,text)');
  v_wrapper_definition text;
  v_definition text;
BEGIN
  IF v_approve IS NULL OR v_approve_internal IS NULL THEN RAISE EXCEPTION 'Clinician approval RPC or protected implementation is missing'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_approve) THEN RAISE EXCEPTION 'Approval RPC must enforce authorization in SECURITY DEFINER code'; END IF;
  IF NOT has_function_privilege('authenticated',v_approve,'EXECUTE') THEN RAISE EXCEPTION 'Authenticated clinician RPC execution grant is missing'; END IF;
  IF has_function_privilege('anon',v_approve,'EXECUTE') THEN RAISE EXCEPTION 'Anonymous users must not execute clinician approval'; END IF;
  IF has_function_privilege('authenticated',v_approve_internal,'EXECUTE') OR has_function_privilege('anon',v_approve_internal,'EXECUTE') THEN
    RAISE EXCEPTION 'API roles must not directly execute the internal approval implementation';
  END IF;

  v_wrapper_definition := pg_get_functiondef(v_approve);
  IF position('clinician_reviewer' IN v_wrapper_definition)=0 OR
     position('v_user.status IS DISTINCT FROM true' IN v_wrapper_definition)=0 THEN
    RAISE EXCEPTION 'Approval wrapper must require an active clinician reviewer';
  END IF;

  v_definition := pg_get_functiondef(v_approve_internal);
  IF position('clinician_reviewer' IN v_definition)=0 OR
     position('data_origin' IN v_definition)=0 OR
     position('oxygen_inventory' IN v_definition)=0 OR
     position('blood_inventory' IN v_definition)=0 OR
     position('required_blood_group' IN v_definition)=0 OR
     position('available_capacity > minimum_threshold' IN v_definition)=0 OR
     position('FOR UPDATE' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Role, synthetic-origin, oxygen/blood compatibility, or row-lock checks are missing';
  END IF;
  IF position('UPDATE public.oxygen_inventory' IN v_definition)>0 OR
     position('UPDATE public.blood_inventory' IN v_definition)>0 THEN
    RAISE EXCEPTION 'This workflow has no user-entered supply quantities; oxygen/blood must remain candidate checks, not reservations';
  END IF;
  RAISE NOTICE 'Clinician review function catalog checks passed. Exercise valid/invalid cases with synthetic accounts before deployment.';
END $$;
