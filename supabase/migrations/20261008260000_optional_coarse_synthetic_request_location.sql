-- Add an opt-in path for a fictional, coarse map point while preserving the
-- existing eight-argument RPC for already deployed clients.
BEGIN;

-- Request rows, including their optional coarse point, remain RPC-managed.
REVOKE INSERT, UPDATE, DELETE ON public.patient_requests FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_synthetic_patient_request_with_location(
  p_emergency_type TEXT,
  p_required_blood_group TEXT,
  p_needs_blood BOOLEAN,
  p_needs_icu BOOLEAN,
  p_needs_general_bed BOOLEAN,
  p_needs_oxygen BOOLEAN,
  p_needs_ambulance BOOLEAN,
  p_reported_severity TEXT,
  p_latitude NUMERIC DEFAULT NULL,
  p_longitude NUMERIC DEFAULT NULL
) RETURNS public.patient_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.patient_requests;
BEGIN
  IF (p_latitude IS NULL) <> (p_longitude IS NULL) THEN
    RAISE EXCEPTION 'Provide both coordinates for a fictional map point or leave both blank';
  END IF;
  IF p_latitude IS NOT NULL AND (
    p_latitude < -90 OR p_latitude > 90 OR p_longitude < -180 OR p_longitude > 180
  ) THEN
    RAISE EXCEPTION 'Fictional map point is outside valid coordinate bounds';
  END IF;
  IF p_latitude IS NOT NULL AND (
    p_latitude <> round(p_latitude, 2) OR p_longitude <> round(p_longitude, 2)
  ) THEN
    RAISE EXCEPTION 'Synthetic scenario coordinates must be rounded to about one kilometer';
  END IF;

  v_request := public.create_synthetic_patient_request(
    p_emergency_type, p_required_blood_group, p_needs_blood, p_needs_icu,
    p_needs_general_bed, p_needs_oxygen, p_needs_ambulance, p_reported_severity
  );

  IF p_latitude IS NOT NULL THEN
    UPDATE public.patient_requests
      SET latitude = p_latitude, longitude = p_longitude, updated_at = now()
      WHERE request_id = v_request.request_id
      RETURNING * INTO v_request;
  END IF;
  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION public.create_synthetic_patient_request_with_location(
  TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, NUMERIC, NUMERIC
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_synthetic_patient_request_with_location(
  TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, NUMERIC, NUMERIC
) TO authenticated;

COMMIT;
