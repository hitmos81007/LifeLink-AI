-- Prototype recommendations are advisory and only created for synthetic scenarios.
ALTER TABLE public.ai_recommendations
  ALTER COLUMN distance_km DROP NOT NULL,
  ALTER COLUMN distance_km DROP DEFAULT,
  ALTER COLUMN eta_minutes DROP NOT NULL,
  ALTER COLUMN eta_minutes DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.get_government_emergency_case_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.role::text = 'government_admin') THEN
    RAISE EXCEPTION 'Government administrator account required';
  END IF;
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.emergency_cases ec
  JOIN public.patient_requests pr ON pr.request_id = ec.request_id
  WHERE ec.confirmation_status = 'confirmed' AND pr.data_origin = 'synthetic';
  RETURN COALESCE(v_count, 0);
END;
$$;

DROP POLICY IF EXISTS "Allow insert ai_recommendations" ON public.ai_recommendations;
DROP POLICY IF EXISTS "Allow update ai_recommendations" ON public.ai_recommendations;
DROP POLICY IF EXISTS "Allow delete ai_recommendations" ON public.ai_recommendations;
REVOKE INSERT, UPDATE, DELETE ON public.ai_recommendations FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Patients can view recommendations for own synthetic requests" ON public.ai_recommendations;
CREATE POLICY "Patients can view recommendations for own synthetic requests"
  ON public.ai_recommendations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.patient_requests pr
    WHERE pr.request_id = ai_recommendations.request_id
      AND pr.patient_id = auth.uid()
      AND pr.data_origin = 'synthetic'
  ));

CREATE OR REPLACE FUNCTION public.save_synthetic_recommendations(
  p_request_id UUID,
  p_recommendations JSONB
) RETURNS SETOF public.ai_recommendations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_request public.patient_requests;
  v_item JSONB;
  v_saved public.ai_recommendations;
  v_hospital_id UUID;
  v_score NUMERIC;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.role::text <> 'clinician_reviewer' THEN
    RAISE EXCEPTION 'Clinician reviewer account required';
  END IF;
  IF jsonb_typeof(p_recommendations) <> 'array'
     OR jsonb_array_length(p_recommendations) < 1
     OR jsonb_array_length(p_recommendations) > 3 THEN
    RAISE EXCEPTION 'Provide between one and three recommendations';
  END IF;

  SELECT * INTO v_request FROM public.patient_requests
    WHERE request_id = p_request_id AND data_origin = 'synthetic'
    FOR UPDATE;
  IF NOT FOUND OR v_request.status NOT IN ('Pending', 'Recommended') THEN
    RAISE EXCEPTION 'Only an open synthetic scenario can receive recommendations';
  END IF;

  DELETE FROM public.ai_recommendations WHERE request_id = p_request_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_recommendations)
  LOOP
    v_hospital_id := NULLIF(v_item->>'hospital_id', '')::UUID;
    v_score := NULLIF(v_item->>'confidence_score', '')::NUMERIC;
    IF v_hospital_id IS NULL OR v_score IS NULL OR v_score < 0 OR v_score > 100
       OR NOT EXISTS (SELECT 1 FROM public.hospitals h
         WHERE h.hospital_id = v_hospital_id AND h.status = 'Active') THEN
      RAISE EXCEPTION 'Recommendation contains an invalid facility or confidence score';
    END IF;
    INSERT INTO public.ai_recommendations (
      request_id, hospital_id, blood_bank_id, ambulance_id, distance_km,
      eta_minutes, confidence_score, recommendation_reason, accepted, created_at, updated_at
    ) VALUES (
      p_request_id, v_hospital_id,
      NULLIF(v_item->>'blood_bank_id', '')::UUID,
      NULLIF(v_item->>'ambulance_id', '')::UUID,
      NULLIF(v_item->>'distance_km', '')::NUMERIC,
      NULLIF(v_item->>'eta_minutes', '')::INTEGER,
      v_score, left(COALESCE(v_item->>'recommendation_reason', ''), 1000), false, now(), now()
    ) RETURNING * INTO v_saved;
    RETURN NEXT v_saved;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.save_synthetic_recommendations(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_synthetic_recommendations(UUID, JSONB) TO authenticated;
