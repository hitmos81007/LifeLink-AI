-- Recompute synthetic advisory candidates, scores, and evidence in Supabase.
-- The browser can request a refresh but cannot submit or alter the ranking score.
ALTER TABLE public.ai_recommendations
  ADD COLUMN IF NOT EXISTS method_version TEXT,
  ADD COLUMN IF NOT EXISTS config_version TEXT,
  ADD COLUMN IF NOT EXISTS score_factors JSONB,
  ADD COLUMN IF NOT EXISTS evidence_snapshot JSONB;

-- Location can be absent in a synthetic scenario. Preserve that uncertainty
-- instead of inventing a zero distance or a fabricated ETA.
ALTER TABLE public.ai_recommendations
  ALTER COLUMN distance_km DROP NOT NULL,
  ALTER COLUMN eta_minutes DROP NOT NULL;

ALTER TABLE public.ai_recommendations
  DROP CONSTRAINT IF EXISTS ai_recommendations_score_factors_object,
  ADD CONSTRAINT ai_recommendations_score_factors_object
    CHECK (score_factors IS NULL OR jsonb_typeof(score_factors) = 'object'),
  DROP CONSTRAINT IF EXISTS ai_recommendations_evidence_snapshot_object,
  ADD CONSTRAINT ai_recommendations_evidence_snapshot_object
    CHECK (evidence_snapshot IS NULL OR jsonb_typeof(evidence_snapshot) = 'object');

CREATE OR REPLACE FUNCTION public.generate_synthetic_recommendations(p_request_id UUID)
RETURNS SETOF public.ai_recommendations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_request public.patient_requests;
  v_generated_at TIMESTAMPTZ := clock_timestamp();
  v_blood_bank_id UUID;
  v_blood_bank_name TEXT;
  v_blood_group TEXT;
  v_blood_units INTEGER;
  v_blood_minimum INTEGER;
  v_blood_updated_at TIMESTAMPTZ;
  v_blood_bank_distance_km NUMERIC;
  v_ambulance_id UUID;
  v_ambulance_number TEXT;
  v_ambulance_updated_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_user FROM public.users u WHERE u.user_id = auth.uid();
  IF NOT FOUND OR v_user.status IS NOT TRUE OR v_user.role::text <> 'clinician_reviewer' THEN
    RAISE EXCEPTION 'An active clinician reviewer account is required';
  END IF;

  SELECT * INTO v_request FROM public.patient_requests pr
  WHERE pr.request_id = p_request_id AND pr.data_origin = 'synthetic'
  FOR UPDATE;
  IF NOT FOUND OR v_request.status NOT IN ('Pending', 'Recommended') THEN
    RAISE EXCEPTION 'Only an open synthetic scenario can receive recommendations';
  END IF;

  IF v_request.needs_blood THEN
    SELECT candidate.blood_bank_id, candidate.blood_bank_name, candidate.blood_group,
      candidate.available_units, candidate.minimum_threshold, candidate.updated_at,
      candidate.distance_km
    INTO v_blood_bank_id, v_blood_bank_name, v_blood_group,
      v_blood_units, v_blood_minimum, v_blood_updated_at, v_blood_bank_distance_km
    FROM (
      SELECT bb.blood_bank_id, bb.blood_bank_name::TEXT AS blood_bank_name,
        bi.blood_group::TEXT AS blood_group,
        greatest(bi.available_units - bi.reserved_units - bi.expired_units, 0) AS available_units,
        bi.minimum_threshold, bi.updated_at,
        CASE WHEN v_request.latitude BETWEEN -90 AND 90
            AND v_request.longitude BETWEEN -180 AND 180
            AND bb.latitude BETWEEN -90 AND 90 AND bb.longitude BETWEEN -180 AND 180
          THEN round((2 * 6371 * asin(sqrt(least(1::DOUBLE PRECISION, greatest(0::DOUBLE PRECISION,
            power(sin(radians((bb.latitude - v_request.latitude)::DOUBLE PRECISION) / 2), 2)
            + cos(radians(v_request.latitude::DOUBLE PRECISION))
            * cos(radians(bb.latitude::DOUBLE PRECISION))
            * power(sin(radians((bb.longitude - v_request.longitude)::DOUBLE PRECISION) / 2), 2)
          )))))::NUMERIC, 1)
          ELSE NULL END AS distance_km
      FROM public.blood_banks bb
      JOIN public.blood_inventory bi ON bi.blood_bank_id = bb.blood_bank_id
      WHERE bb.status::text = 'Active'
        AND (v_request.required_blood_group IS NULL OR bi.blood_group = v_request.required_blood_group)
        AND greatest(bi.available_units - bi.reserved_units - bi.expired_units, 0) > bi.minimum_threshold
        AND bi.updated_at >= v_generated_at - INTERVAL '60 minutes'
        AND bi.updated_at <= v_generated_at
    ) candidate
    ORDER BY candidate.distance_km NULLS LAST,
      (candidate.available_units - candidate.minimum_threshold) DESC,
      candidate.blood_bank_name, candidate.blood_group
    LIMIT 1;
  END IF;

  IF v_request.needs_ambulance
     AND v_request.latitude BETWEEN -90 AND 90
     AND v_request.longitude BETWEEN -180 AND 180 THEN
    SELECT a.ambulance_id, a.vehicle_number::TEXT, a.updated_at
    INTO v_ambulance_id, v_ambulance_number, v_ambulance_updated_at
    FROM public.ambulances a
    JOIN public.ambulance_providers ap ON ap.provider_id = a.provider_id AND ap.status::text = 'Active'
    WHERE a.status::text = 'Available'
      AND a.updated_at >= v_generated_at - INTERVAL '15 minutes'
      AND a.updated_at <= v_generated_at
      AND a.current_latitude BETWEEN -90 AND 90
      AND a.current_longitude BETWEEN -180 AND 180
    ORDER BY
      2 * 6371 * asin(sqrt(least(1::DOUBLE PRECISION, greatest(0::DOUBLE PRECISION,
        power(sin(radians((a.current_latitude - v_request.latitude)::DOUBLE PRECISION) / 2), 2)
        + cos(radians(v_request.latitude::DOUBLE PRECISION))
        * cos(radians(a.current_latitude::DOUBLE PRECISION))
        * power(sin(radians((a.current_longitude - v_request.longitude)::DOUBLE PRECISION) / 2), 2)
      )))), a.ambulance_id
    LIMIT 1;
  END IF;

  DELETE FROM public.ai_recommendations WHERE request_id = p_request_id;

  RETURN QUERY
  WITH hospital_snapshot AS (
    SELECT h.hospital_id, h.hospital_name::TEXT AS hospital_name,
      h.latitude, h.longitude,
      icu.available_quantity AS icu_quantity, icu.observed_at AS icu_updated_at,
      beds.available_quantity AS beds_quantity, beds.observed_at AS beds_updated_at,
      oxygen.available_records AS oxygen_records, oxygen.observed_at AS oxygen_updated_at
    FROM public.hospitals h
    LEFT JOIN LATERAL (
      SELECT CASE WHEN count(*) = 1 THEN max(i.available_icu_beds) ELSE 0 END AS available_quantity,
        CASE WHEN count(*) = 1 THEN max(i.updated_at) END AS observed_at
      FROM public.icu_inventory i WHERE i.hospital_id = h.hospital_id
    ) icu ON true
    LEFT JOIN LATERAL (
      SELECT CASE WHEN count(*) = 1 THEN max(b.available_beds) ELSE 0 END AS available_quantity,
        CASE WHEN count(*) = 1 THEN max(b.updated_at) END AS observed_at
      FROM public.general_bed_inventory b WHERE b.hospital_id = h.hospital_id
    ) beds ON true
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE o.available_capacity > o.minimum_threshold
        AND o.updated_at >= v_generated_at - INTERVAL '60 minutes'
        AND o.updated_at <= v_generated_at)::INTEGER AS available_records,
        max(o.updated_at) FILTER (WHERE o.available_capacity > o.minimum_threshold
          AND o.updated_at >= v_generated_at - INTERVAL '60 minutes'
          AND o.updated_at <= v_generated_at) AS observed_at
      FROM public.oxygen_inventory o WHERE o.hospital_id = h.hospital_id
    ) oxygen ON true
    WHERE h.status::text = 'Active'
  ),
  compatible AS (
    SELECT hs.*,
      CASE WHEN v_request.latitude BETWEEN -90 AND 90
          AND v_request.longitude BETWEEN -180 AND 180
          AND hs.latitude BETWEEN -90 AND 90 AND hs.longitude BETWEEN -180 AND 180
        THEN round((2 * 6371 * asin(sqrt(least(1::DOUBLE PRECISION, greatest(0::DOUBLE PRECISION,
          power(sin(radians((hs.latitude - v_request.latitude)::DOUBLE PRECISION) / 2), 2)
          + cos(radians(v_request.latitude::DOUBLE PRECISION))
          * cos(radians(hs.latitude::DOUBLE PRECISION))
          * power(sin(radians((hs.longitude - v_request.longitude)::DOUBLE PRECISION) / 2), 2)
        )))))::NUMERIC, 1)
        ELSE NULL END AS distance_km
    FROM hospital_snapshot hs
    WHERE (NOT v_request.needs_icu OR (hs.icu_quantity > 0
      AND hs.icu_updated_at >= v_generated_at - INTERVAL '15 minutes' AND hs.icu_updated_at <= v_generated_at))
      AND (NOT v_request.needs_general_bed OR (hs.beds_quantity > 0
      AND hs.beds_updated_at >= v_generated_at - INTERVAL '15 minutes' AND hs.beds_updated_at <= v_generated_at))
      AND (NOT v_request.needs_oxygen OR hs.oxygen_records > 0)
  ),
  scored AS (
    SELECT c.*,
      CASE WHEN c.distance_km IS NULL THEN NULL
        ELSE greatest(3, round((c.distance_km / 35) * 60 + 4)::INTEGER) END AS eta_minutes,
      CASE WHEN c.distance_km IS NULL THEN 25::NUMERIC
        ELSE least(25::NUMERIC, c.distance_km * 1.5) END AS distance_penalty,
      CASE WHEN v_request.needs_icu AND c.icu_quantity >= 3 THEN 4::NUMERIC ELSE 0::NUMERIC END AS icu_bonus,
      CASE WHEN v_request.needs_general_bed AND c.beds_quantity >= 10 THEN 3::NUMERIC ELSE 0::NUMERIC END AS beds_bonus,
      CASE WHEN v_request.needs_oxygen AND c.oxygen_records > 0 THEN 3::NUMERIC ELSE 0::NUMERIC END AS oxygen_bonus
    FROM compatible c
  ),
  ranked AS (
    SELECT s.*,
      least(100::NUMERIC, greatest(15::NUMERIC,
        round(92::NUMERIC - s.distance_penalty + s.icu_bonus + s.beds_bonus + s.oxygen_bonus
        )
      )) AS fit_score
    FROM scored s
  ),
  inserted AS (
    INSERT INTO public.ai_recommendations (
      request_id, hospital_id, blood_bank_id, ambulance_id, distance_km, eta_minutes,
      confidence_score, recommendation_reason, accepted, created_at, updated_at,
      method_version, config_version, score_factors, evidence_snapshot
    )
    SELECT p_request_id, r.hospital_id,
      CASE WHEN v_request.needs_blood THEN v_blood_bank_id ELSE NULL END,
      CASE WHEN v_request.needs_ambulance THEN v_ambulance_id ELSE NULL END,
      r.distance_km, r.eta_minutes, r.fit_score::INTEGER,
      left(concat_ws(' ',
        CASE WHEN r.distance_km IS NULL THEN 'Distance and ETA are unavailable for this scenario.'
          ELSE format('Straight-line distance is %s km; illustrative ETA is %s minutes at 35 km/h plus a 4-minute buffer.', r.distance_km, r.eta_minutes) END,
        CASE WHEN v_request.needs_icu THEN format('Recorded ICU beds: %s; updated %s.', r.icu_quantity, r.icu_updated_at) END,
        CASE WHEN v_request.needs_general_bed THEN format('Recorded general beds: %s; updated %s.', r.beds_quantity, r.beds_updated_at) END,
        CASE WHEN v_request.needs_oxygen THEN format('%s oxygen inventory records exceed their protected minimum; updated %s.', r.oxygen_records, r.oxygen_updated_at) END,
        CASE WHEN v_request.needs_blood AND v_blood_bank_id IS NOT NULL THEN format('Blood candidate %s has %s available %s units above its minimum of %s; %s; updated %s; not reserved.', v_blood_bank_name, v_blood_units, v_blood_group, v_blood_minimum, CASE WHEN v_blood_bank_distance_km IS NULL THEN 'distance unavailable' ELSE format('%s km straight-line estimate', v_blood_bank_distance_km) END, v_blood_updated_at) END,
        CASE WHEN v_request.needs_blood AND v_blood_bank_id IS NULL THEN format('Blood group requirement noted (%s); no fresh compatible bank candidate was found.', COALESCE(v_request.required_blood_group::TEXT, 'Any')) END,
        CASE WHEN v_request.needs_ambulance AND v_ambulance_id IS NOT NULL THEN format('Available ambulance record %s is a candidate; no vehicle is assigned or dispatched.', v_ambulance_number) END,
        CASE WHEN v_request.needs_ambulance AND v_ambulance_id IS NULL THEN 'No fresh ambulance candidate with usable coordinates was found; no dispatch occurred.' END,
        'Supabase-generated heuristic fit only; not a probability or clinical judgment. Patient-reported severity does not affect ranking. A clinician must review this result; nothing is reserved, assigned, or dispatched by this recommendation.'
      ), 1000),
      false, v_generated_at, v_generated_at,
      'synthetic_resource_fit_v1', 'synthetic_resource_fit_rules_v1',
      jsonb_build_object(
        'base_score', 92, 'distance_penalty', r.distance_penalty,
        'icu_capacity_bonus', r.icu_bonus, 'general_bed_capacity_bonus', r.beds_bonus,
        'oxygen_record_bonus', r.oxygen_bonus,
        'fit_score', r.fit_score
      ),
      jsonb_build_object(
        'data_origin', 'synthetic', 'generated_at', v_generated_at,
        'request_id', p_request_id, 'hospital_id', r.hospital_id,
        'distance_method', CASE WHEN r.distance_km IS NULL THEN 'unavailable' ELSE 'haversine_straight_line' END,
        'distance_km', r.distance_km,
        'eta_method', '35_km_per_hour_plus_4_minute_buffer', 'eta_minutes', r.eta_minutes,
        'icu_available', r.icu_quantity, 'icu_updated_at', r.icu_updated_at,
        'general_beds_available', r.beds_quantity, 'general_beds_updated_at', r.beds_updated_at,
        'oxygen_fresh_records_above_minimum', r.oxygen_records, 'oxygen_updated_at', r.oxygen_updated_at,
        'blood_bank_id', CASE WHEN v_request.needs_blood THEN v_blood_bank_id END,
        'blood_group', CASE WHEN v_request.needs_blood THEN v_blood_group END,
        'blood_units_above_minimum', CASE WHEN v_request.needs_blood THEN v_blood_units END,
        'blood_bank_distance_km', CASE WHEN v_request.needs_blood THEN v_blood_bank_distance_km END,
        'blood_updated_at', CASE WHEN v_request.needs_blood THEN v_blood_updated_at END,
        'ambulance_id', CASE WHEN v_request.needs_ambulance THEN v_ambulance_id END,
        'ambulance_updated_at', CASE WHEN v_request.needs_ambulance THEN v_ambulance_updated_at END,
        'no_reservation_or_dispatch', true
      )
    FROM ranked r
    ORDER BY r.fit_score DESC, r.hospital_name ASC
    LIMIT 3
    RETURNING *
  )
  SELECT * FROM inserted;
END;
$$;

-- Keep the legacy signature safe for any older client: its JSON is ignored and
-- all candidates and scores are recomputed from current Supabase rows.
CREATE OR REPLACE FUNCTION public.save_synthetic_recommendations(
  p_request_id UUID,
  p_recommendations JSONB
) RETURNS SETOF public.ai_recommendations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.generate_synthetic_recommendations(p_request_id);
END;
$$;

REVOKE ALL ON FUNCTION public.generate_synthetic_recommendations(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_synthetic_recommendations(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_synthetic_recommendations(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_synthetic_recommendations(UUID, JSONB) TO authenticated;

COMMENT ON COLUMN public.ai_recommendations.confidence_score IS
  'Legacy column name; for synthetic_resource_fit_v1 rows this is an uncalibrated heuristic fit score, not a probability.';
