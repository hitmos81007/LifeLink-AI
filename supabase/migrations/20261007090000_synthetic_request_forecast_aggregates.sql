-- Read-only aggregate input for the prototype's bed scenario estimates.
-- Returns no patient identifiers or request-level data.
CREATE OR REPLACE FUNCTION public.get_synthetic_bed_request_counts(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  hospital_id UUID,
  icu_request_count BIGINT,
  general_bed_request_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_days INTEGER := LEAST(GREATEST(COALESCE(p_days, 30), 1), 90);
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.role::text NOT IN (
    'government_admin', 'hospital_admin', 'hospital_approver', 'clinician_reviewer'
  ) THEN
    RAISE EXCEPTION 'Authorized facility or clinician account required';
  END IF;
  IF v_user.role::text IN ('hospital_admin', 'hospital_approver') AND v_user.hospital_id IS NULL THEN
    RAISE EXCEPTION 'Hospital account must be linked to a facility';
  END IF;

  RETURN QUERY
  SELECT ec.assigned_hospital_id,
         COUNT(*) FILTER (WHERE pr.needs_icu),
         COUNT(*) FILTER (WHERE pr.needs_general_bed)
  FROM public.emergency_cases ec
  JOIN public.patient_requests pr ON pr.request_id = ec.request_id
  WHERE ec.assigned_hospital_id IS NOT NULL
    AND ec.confirmation_status = 'confirmed'
    AND pr.data_origin = 'synthetic'
    AND pr.created_at >= now() - make_interval(days => v_days)
    AND (v_user.role::text NOT IN ('hospital_admin', 'hospital_approver')
         OR ec.assigned_hospital_id = v_user.hospital_id)
  GROUP BY ec.assigned_hospital_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_synthetic_bed_request_counts(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_synthetic_bed_request_counts(INTEGER) TO authenticated;
