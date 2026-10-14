-- Allow an active hospital administrator to correct only their own facility's
-- coordinates through an audited, version-checked database operation.
BEGIN;

CREATE OR REPLACE FUNCTION public.update_hospital_location(
  p_hospital_id UUID,
  p_latitude NUMERIC,
  p_longitude NUMERIC,
  p_expected_updated_at TIMESTAMPTZ
) RETURNS public.hospitals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_hospital public.hospitals;
  v_old_location JSONB;
BEGIN
  SELECT * INTO v_user
  FROM public.users
  WHERE user_id = auth.uid();

  IF NOT FOUND OR v_user.status IS NOT TRUE OR v_user.account_status IS DISTINCT FROM 'active'
     OR v_user.role::TEXT <> 'hospital_admin' OR v_user.hospital_id IS NULL THEN
    RAISE EXCEPTION 'Active hospital administrator account required';
  END IF;
  IF p_hospital_id IS NULL OR v_user.hospital_id <> p_hospital_id THEN
    RAISE EXCEPTION 'A hospital administrator may update only the assigned hospital location';
  END IF;
  IF (p_latitude IS NULL) <> (p_longitude IS NULL) THEN
    RAISE EXCEPTION 'Enter both latitude and longitude, or leave both blank';
  END IF;
  IF p_latitude IS NOT NULL AND
     (p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180) THEN
    RAISE EXCEPTION 'Coordinates are outside valid geographic bounds';
  END IF;

  SELECT * INTO v_hospital
  FROM public.hospitals
  WHERE hospital_id = p_hospital_id
    AND status = 'Active'
    AND verification_status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assigned hospital is not active';
  END IF;
  IF p_expected_updated_at IS NULL OR v_hospital.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Hospital profile changed; refresh and retry' USING ERRCODE = '40001';
  END IF;

  v_old_location := jsonb_build_object(
    'latitude', v_hospital.latitude,
    'longitude', v_hospital.longitude
  );
  UPDATE public.hospitals
  SET latitude = p_latitude,
      longitude = p_longitude,
      updated_at = now()
  WHERE hospital_id = p_hospital_id
  RETURNING * INTO v_hospital;

  INSERT INTO public.audit_logs(user_id, action, table_name, record_id, old_value, new_value, created_at)
  VALUES (
    v_user.user_id,
    'HOSPITAL_LOCATION_UPDATED',
    'hospitals',
    v_hospital.hospital_id,
    v_old_location,
    jsonb_build_object('latitude', v_hospital.latitude, 'longitude', v_hospital.longitude),
    now()
  );

  RETURN v_hospital;
END;
$$;

-- The legacy row-level UPDATE policy alone is not an audit boundary. Prevent
-- direct PostgREST writes so location changes must use the checked RPC above.
REVOKE UPDATE ON TABLE public.hospitals FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (latitude, longitude) ON TABLE public.hospitals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_hospital_location(UUID, NUMERIC, NUMERIC, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_hospital_location(UUID, NUMERIC, NUMERIC, TIMESTAMPTZ) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
