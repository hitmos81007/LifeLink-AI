-- New patient workflow rows are fictional scenarios. It stores no scene location
-- or free-text patient details and derives the owner from the authenticated user.
ALTER TABLE public.patient_requests
  ADD COLUMN IF NOT EXISTS data_origin VARCHAR(20) NOT NULL DEFAULT 'unknown';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patient_requests_data_origin_check'
      AND conrelid = 'public.patient_requests'::regclass
  ) THEN
    ALTER TABLE public.patient_requests
      ADD CONSTRAINT patient_requests_data_origin_check
      CHECK (data_origin IN ('unknown', 'synthetic'));
  END IF;
END;
$$;

DROP POLICY IF EXISTS "Patients can insert their own requests" ON public.patient_requests;
DROP POLICY IF EXISTS "Patients can update their own requests" ON public.patient_requests;
REVOKE INSERT, UPDATE ON public.patient_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_synthetic_patient_request(
  p_emergency_type TEXT,
  p_required_blood_group TEXT,
  p_needs_blood BOOLEAN,
  p_needs_icu BOOLEAN,
  p_needs_general_bed BOOLEAN,
  p_needs_oxygen BOOLEAN,
  p_needs_ambulance BOOLEAN,
  p_reported_severity TEXT
) RETURNS public.patient_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_request public.patient_requests;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.role::text <> 'patient' OR v_user.status IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'An active patient account is required to save a prototype scenario';
  END IF;
  IF p_emergency_type IS NULL OR p_emergency_type NOT IN ('Road Accident', 'Cardiac Arrest', 'Stroke', 'Trauma', 'Burn', 'Pregnancy', 'Poisoning', 'Other') THEN
    RAISE EXCEPTION 'Unsupported synthetic scenario type';
  END IF;
  IF p_reported_severity IS NULL OR p_reported_severity NOT IN ('Low', 'Medium', 'High', 'Critical') THEN
    RAISE EXCEPTION 'Unsupported synthetic scenario severity';
  END IF;
  IF p_needs_blood IS NULL OR p_needs_icu IS NULL OR p_needs_general_bed IS NULL
     OR p_needs_oxygen IS NULL OR p_needs_ambulance IS NULL THEN
    RAISE EXCEPTION 'All synthetic scenario resource flags must be provided';
  END IF;
  IF p_needs_blood AND (p_required_blood_group IS NULL OR p_required_blood_group NOT IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')) THEN
    RAISE EXCEPTION 'Select a valid blood group for this synthetic scenario';
  END IF;

  INSERT INTO public.patient_requests (
    patient_id, emergency_type, required_blood_group, needs_blood,
    needs_icu, needs_general_bed, needs_oxygen, needs_ambulance,
    reported_severity, severity, latitude, longitude, status, notes,
    data_origin, created_at, updated_at
  ) VALUES (
    v_user.user_id, p_emergency_type::public.emergency_type,
    CASE WHEN p_needs_blood THEN p_required_blood_group::public.blood_group ELSE NULL END,
    p_needs_blood, p_needs_icu, p_needs_general_bed,
    p_needs_oxygen, p_needs_ambulance,
    p_reported_severity, p_reported_severity::public.severity_level, NULL, NULL,
    'Pending', NULL, 'synthetic', now(), now()
  ) RETURNING * INTO v_request;
  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION public.create_synthetic_patient_request(TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_synthetic_patient_request(TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_synthetic_patient_request(TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT) TO authenticated;
