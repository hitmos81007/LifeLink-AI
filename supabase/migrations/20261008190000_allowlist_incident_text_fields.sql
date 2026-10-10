-- Aggregate MCI planning metadata must not accept free-text patient details.
-- Keep labels and review reasons useful for audit while restricting them to
-- fixed synthetic workflow choices at the authenticated RPC boundary.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_incident_plan(
  p_label TEXT,
  p_location_label TEXT,
  p_total_affected INTEGER,
  p_severity_counts JSONB,
  p_ratios JSONB,
  p_expected_arrival_start TIMESTAMPTZ,
  p_expected_arrival_end TIMESTAMPTZ,
  p_latitude NUMERIC DEFAULT NULL,
  p_longitude NUMERIC DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_incident_id UUID;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.status IS DISTINCT FROM true OR v_user.role::text <> 'government_admin' THEN
    RAISE EXCEPTION 'An active district coordinator account is required';
  END IF;
  IF p_label NOT IN (
    'Synthetic MCI preparedness exercise',
    'Synthetic mass-casualty drill',
    'Synthetic regional surge scenario'
  ) THEN
    RAISE EXCEPTION 'Choose a predefined synthetic scenario label';
  END IF;

  v_incident_id := public.create_incident_plan_internal(
    p_label, p_location_label, p_total_affected, p_severity_counts, p_ratios,
    p_expected_arrival_start, p_expected_arrival_end, p_latitude, p_longitude
  );
  RETURN v_incident_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_incident_plan(
  p_version_id UUID,
  p_decision TEXT,
  p_reason TEXT,
  p_adjustments JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_review_id UUID;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.status IS DISTINCT FROM true OR v_user.role::text <> 'clinician_reviewer' THEN
    RAISE EXCEPTION 'An active clinician reviewer account is required';
  END IF;
  IF p_decision = 'approved' AND p_adjustments = '{}'::jsonb
     AND p_reason <> 'Reviewed aggregate counts and planning assumptions.' THEN
    RAISE EXCEPTION 'Choose the fixed review reason for an unchanged approved plan';
  ELSIF p_decision = 'approved' AND p_adjustments <> '{}'::jsonb
     AND p_reason <> 'Adjusted estimates after reviewing aggregate counts and planning assumptions.' THEN
    RAISE EXCEPTION 'Choose the fixed review reason for an adjusted approved plan';
  ELSIF p_decision = 'rejected'
     AND p_reason <> 'Rejected aggregate scenario; counts or planning assumptions need revision.' THEN
    RAISE EXCEPTION 'Choose the fixed review reason for a rejected plan';
  ELSIF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Choose approve or reject';
  END IF;

  v_review_id := public.review_incident_plan_internal(
    p_version_id, p_decision, p_reason, p_adjustments
  );
  RETURN v_review_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_incident_plan(TEXT, TEXT, INTEGER, JSONB, JSONB, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, NUMERIC)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_incident_plan(UUID, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_incident_plan(TEXT, TEXT, INTEGER, JSONB, JSONB, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, NUMERIC)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_incident_plan(UUID, TEXT, TEXT, JSONB)
  TO authenticated;

COMMIT;
