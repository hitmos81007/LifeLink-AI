-- Add active-account checks to remaining privileged analytics and incident
-- planning RPCs without changing their established business logic.
BEGIN;

ALTER FUNCTION public.get_synthetic_bed_request_counts(INTEGER) RENAME TO get_synthetic_bed_request_counts_internal;
ALTER FUNCTION public.get_government_emergency_case_count() RENAME TO get_government_emergency_case_count_internal;
ALTER FUNCTION public.save_synthetic_recommendations(UUID, JSONB) RENAME TO save_synthetic_recommendations_internal;
ALTER FUNCTION public.create_incident_plan(TEXT, TEXT, INTEGER, JSONB, JSONB, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, NUMERIC) RENAME TO create_incident_plan_internal;
ALTER FUNCTION public.review_incident_plan(UUID, TEXT, TEXT, JSONB) RENAME TO review_incident_plan_internal;

REVOKE ALL ON FUNCTION public.get_synthetic_bed_request_counts_internal(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_government_emergency_case_count_internal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_synthetic_recommendations_internal(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_incident_plan_internal(TEXT, TEXT, INTEGER, JSONB, JSONB, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_incident_plan_internal(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_synthetic_bed_request_counts(p_days INTEGER DEFAULT 30)
RETURNS TABLE(hospital_id UUID, icu_request_count BIGINT, general_bed_request_count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user public.users;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.status IS DISTINCT FROM true OR v_user.role::text NOT IN ('government_admin','hospital_admin','hospital_approver','clinician_reviewer') THEN
    RAISE EXCEPTION 'An active facility or clinician account is required';
  END IF;
  RETURN QUERY SELECT * FROM public.get_synthetic_bed_request_counts_internal(p_days);
END;
$$;

CREATE FUNCTION public.get_government_emergency_case_count()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user public.users; v_count INTEGER;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.status IS DISTINCT FROM true OR v_user.role::text<>'government_admin' THEN
    RAISE EXCEPTION 'An active government administrator account is required';
  END IF;
  v_count:=public.get_government_emergency_case_count_internal();
  RETURN COALESCE(v_count,0);
END;
$$;

CREATE FUNCTION public.save_synthetic_recommendations(p_request_id UUID,p_recommendations JSONB)
RETURNS SETOF public.ai_recommendations
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user public.users;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.status IS DISTINCT FROM true OR v_user.role::text<>'clinician_reviewer' THEN
    RAISE EXCEPTION 'An active clinician reviewer account is required';
  END IF;
  RETURN QUERY SELECT * FROM public.save_synthetic_recommendations_internal(p_request_id,p_recommendations);
END;
$$;

CREATE FUNCTION public.create_incident_plan(
  p_label TEXT,p_location_label TEXT,p_total_affected INTEGER,p_severity_counts JSONB,p_ratios JSONB,
  p_expected_arrival_start TIMESTAMPTZ,p_expected_arrival_end TIMESTAMPTZ,
  p_latitude NUMERIC DEFAULT NULL,p_longitude NUMERIC DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user public.users; v_incident_id UUID;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.status IS DISTINCT FROM true OR v_user.role::text<>'government_admin' THEN
    RAISE EXCEPTION 'An active district coordinator account is required';
  END IF;
  v_incident_id:=public.create_incident_plan_internal(
    p_label,p_location_label,p_total_affected,p_severity_counts,p_ratios,
    p_expected_arrival_start,p_expected_arrival_end,p_latitude,p_longitude
  );
  RETURN v_incident_id;
END;
$$;

CREATE FUNCTION public.review_incident_plan(p_version_id UUID,p_decision TEXT,p_reason TEXT,p_adjustments JSONB DEFAULT '{}'::jsonb)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user public.users; v_review_id UUID;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.status IS DISTINCT FROM true OR v_user.role::text<>'clinician_reviewer' THEN
    RAISE EXCEPTION 'An active clinician reviewer account is required';
  END IF;
  v_review_id:=public.review_incident_plan_internal(p_version_id,p_decision,p_reason,p_adjustments);
  RETURN v_review_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_synthetic_bed_request_counts(INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_government_emergency_case_count() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_synthetic_recommendations(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_incident_plan(TEXT, TEXT, INTEGER, JSONB, JSONB, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_incident_plan(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_synthetic_bed_request_counts(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_government_emergency_case_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_synthetic_recommendations(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_incident_plan(TEXT, TEXT, INTEGER, JSONB, JSONB, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_incident_plan(UUID, TEXT, TEXT, JSONB) TO authenticated;

DROP POLICY IF EXISTS incident_planning_read ON public.incidents;
CREATE POLICY incident_planning_read ON public.incidents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_id=auth.uid() AND u.status IS TRUE AND u.role::text IN ('government_admin','clinician_reviewer')));
DROP POLICY IF EXISTS incident_versions_read ON public.incident_versions;
CREATE POLICY incident_versions_read ON public.incident_versions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_id=auth.uid() AND u.status IS TRUE AND u.role::text IN ('government_admin','clinician_reviewer')));
DROP POLICY IF EXISTS incident_plans_read ON public.incident_resource_plans;
CREATE POLICY incident_plans_read ON public.incident_resource_plans FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_id=auth.uid() AND u.status IS TRUE AND u.role::text IN ('government_admin','clinician_reviewer')));
DROP POLICY IF EXISTS incident_reviews_read ON public.plan_reviews;
CREATE POLICY incident_reviews_read ON public.plan_reviews FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_id=auth.uid() AND u.status IS TRUE AND u.role::text IN ('government_admin','clinician_reviewer')));

COMMIT;
