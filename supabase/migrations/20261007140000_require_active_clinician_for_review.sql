-- Keep the established transactional review logic, but put an active-account
-- gate in front of both public RPCs. The renamed implementations are private
-- to the database owner and cannot be called by API roles directly.
BEGIN;

ALTER FUNCTION public.approve_emergency_request(UUID, UUID, UUID, UUID, TEXT)
  RENAME TO approve_emergency_request_internal;
ALTER FUNCTION public.reject_emergency_request(UUID, TEXT)
  RENAME TO reject_emergency_request_internal;

REVOKE ALL ON FUNCTION public.approve_emergency_request_internal(UUID, UUID, UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_emergency_request_internal(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.approve_emergency_request(
  p_request_id UUID,
  p_hospital_id UUID,
  p_ambulance_id UUID DEFAULT NULL,
  p_blood_bank_id UUID DEFAULT NULL,
  p_confirmed_urgency TEXT DEFAULT NULL
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
  SELECT * INTO v_case FROM public.approve_emergency_request_internal(
    p_request_id, p_hospital_id, p_ambulance_id, p_blood_bank_id, p_confirmed_urgency
  );
  RETURN v_case;
END;
$$;

CREATE FUNCTION public.reject_emergency_request(
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
  RETURN v_case;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_emergency_request(UUID, UUID, UUID, UUID, TEXT)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_emergency_request(UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_emergency_request(UUID, UUID, UUID, UUID, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_emergency_request(UUID, TEXT)
  TO authenticated;

COMMIT;
