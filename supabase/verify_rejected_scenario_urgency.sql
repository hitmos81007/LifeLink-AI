-- Run after 20261008270000_keep_rejected_urgency_unconfirmed.sql.
-- Read-only check of rejection semantics and previously stored rejected rows.
DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.reject_emergency_request(uuid,text)'::regprocedure)
    INTO v_definition;
  IF v_definition IS NULL OR
     position('clinician_confirmed_urgency = NULL' IN v_definition) = 0 OR
     position('confirmation_status = ''rejected''' IN v_definition) = 0 OR
     position('v_user.status IS DISTINCT FROM true' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Active-account rejection wrapper does not clear rejected clinician-confirmed urgency';
  END IF;
  IF has_function_privilege('anon','public.reject_emergency_request(uuid,text)','EXECUTE') OR
     NOT has_function_privilege('authenticated','public.reject_emergency_request(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Rejection RPC grants are too broad or incomplete';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.emergency_cases
    WHERE confirmation_status = 'rejected' AND clinician_confirmed_urgency IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A rejected scenario still has a clinician-confirmed urgency value';
  END IF;
  RAISE NOTICE 'Rejected scenarios do not carry clinician-confirmed urgency values.';
END;
$$;
