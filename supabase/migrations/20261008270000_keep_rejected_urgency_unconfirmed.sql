-- Rejected synthetic scenarios must never store patient-reported urgency in
-- the field reserved for clinician-confirmed urgency.
BEGIN;

UPDATE public.emergency_cases
SET clinician_confirmed_urgency = NULL
WHERE confirmation_status = 'rejected'
  AND clinician_confirmed_urgency IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reject_emergency_request(
  p_request_id UUID,
  p_reason TEXT
) RETURNS public.emergency_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_case public.emergency_cases;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.role::text <> 'clinician_reviewer' OR v_user.status IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'An active clinician reviewer account is required';
  END IF;

  SELECT * INTO v_case FROM public.reject_emergency_request_internal(p_request_id, p_reason);
  UPDATE public.emergency_cases
  SET clinician_confirmed_urgency = NULL
  WHERE case_id = v_case.case_id
    AND confirmation_status = 'rejected'
  RETURNING * INTO v_case;
  RETURN v_case;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_emergency_request(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_emergency_request(UUID, TEXT) TO authenticated;

COMMIT;
