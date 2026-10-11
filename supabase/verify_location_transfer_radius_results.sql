-- Read-only production check for location-radius transfer source discovery.
-- Uses an existing active hospital account; creates no transfer or inventory rows.
BEGIN READ ONLY;

DO $$
DECLARE
  v_candidate RECORD;
  v_receiver_id UUID;
  v_user_id UUID;
  v_resource_type TEXT;
  v_radius NUMERIC := 250;
  v_candidate_count INTEGER;
  v_best_count INTEGER := -1;
  v_expected_count INTEGER;
  v_actual_count INTEGER;
  v_mismatch_count INTEGER;
  v_out_of_range_count INTEGER;
  v_total_results INTEGER := 0;
BEGIN
  FOR v_candidate IN
    SELECT h.hospital_id, u.user_id
    FROM public.hospitals h
    JOIN public.users u ON u.hospital_id = h.hospital_id
    WHERE h.status = 'Active'
      AND h.latitude IS NOT NULL
      AND h.longitude IS NOT NULL
      AND u.role::TEXT = 'hospital_admin'
      AND u.status IS TRUE
    ORDER BY h.hospital_name, u.user_id
  LOOP
    PERFORM set_config('request.jwt.claim.sub', v_candidate.user_id::TEXT, true);
    v_candidate_count := 0;
    FOREACH v_resource_type IN ARRAY ARRAY['ICU Beds', 'General Beds', 'Oxygen', 'Medicine'] LOOP
      SELECT count(*) INTO v_actual_count
      FROM public.find_nearby_transfer_sources(v_resource_type, v_radius);
      v_candidate_count := v_candidate_count + v_actual_count;
    END LOOP;
    IF v_candidate_count > v_best_count THEN
      v_best_count := v_candidate_count;
      v_receiver_id := v_candidate.hospital_id;
      v_user_id := v_candidate.user_id;
    END IF;
  END LOOP;

  IF v_receiver_id IS NULL OR v_user_id IS NULL OR v_best_count <= 0 THEN
    RAISE EXCEPTION 'No active hospital administrator has a located donor within % km for the transferable resources', v_radius;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user_id::TEXT, true);

  FOREACH v_resource_type IN ARRAY ARRAY['ICU Beds', 'General Beds', 'Oxygen', 'Medicine'] LOOP
    SELECT count(*) INTO v_expected_count
    FROM public.find_nearby_transfer_sources(v_resource_type) expected
    WHERE expected.distance_km IS NOT NULL
      AND expected.distance_km <= v_radius;

    SELECT count(*) INTO v_actual_count
    FROM public.find_nearby_transfer_sources(v_resource_type, v_radius);

    SELECT count(*) INTO v_out_of_range_count
    FROM public.find_nearby_transfer_sources(v_resource_type, v_radius) actual
    WHERE actual.distance_km IS NULL OR actual.distance_km > v_radius;

    WITH expected AS (
      SELECT source_hospital_id, resource_type, resource_name, resource_identity,
        transferable_quantity, unit, distance_km
      FROM public.find_nearby_transfer_sources(v_resource_type)
      WHERE distance_km IS NOT NULL AND distance_km <= v_radius
    ), actual AS (
      SELECT source_hospital_id, resource_type, resource_name, resource_identity,
        transferable_quantity, unit, distance_km
      FROM public.find_nearby_transfer_sources(v_resource_type, v_radius)
    )
    SELECT count(*) INTO v_mismatch_count
    FROM (
      (SELECT * FROM expected EXCEPT SELECT * FROM actual)
      UNION ALL
      (SELECT * FROM actual EXCEPT SELECT * FROM expected)
    ) differences;

    IF v_expected_count <> v_actual_count OR v_mismatch_count <> 0 OR v_out_of_range_count <> 0 THEN
      RAISE EXCEPTION 'Radius lookup mismatch for %: expected %, actual %, mismatches %, out-of-range %',
        v_resource_type, v_expected_count, v_actual_count, v_mismatch_count, v_out_of_range_count;
    END IF;

    v_total_results := v_total_results + v_actual_count;
  END LOOP;

  BEGIN
    PERFORM * FROM public.find_nearby_transfer_sources('General Beds', 0);
    RAISE EXCEPTION 'Invalid zero-kilometer radius was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Maximum distance must be between 1 and 500 km, or null for any distance' THEN
      RAISE;
    END IF;
  END;

  IF v_total_results = 0 THEN
    RAISE EXCEPTION 'No located donors were returned for any transferable resource within % km', v_radius;
  END IF;

  RAISE NOTICE 'PASS: all four resource types match the unfiltered source list inside % km; no out-of-radius sources; invalid radius rejected; % sources checked.',
    v_radius, v_total_results;
END;
$$;

COMMIT;
