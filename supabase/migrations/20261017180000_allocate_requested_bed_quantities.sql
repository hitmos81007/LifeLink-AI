-- Match clinician facility candidates and transactional bed reservations to the
-- synthetic quantities captured by 20261017150000. Protected minimum inventory
-- remains unavailable for assignment. Legacy requests with no quantity use 1.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_clinician_review_network()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_result JSONB;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.role::text <> 'clinician_reviewer' OR v_user.status IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'An active clinician reviewer account is required';
  END IF;

  SELECT jsonb_build_object(
    'hospitals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'hospital_id', h.hospital_id,
        'hospital_name', h.hospital_name,
        'address', h.address,
        'district', h.district,
        'latitude', h.latitude,
        'longitude', h.longitude,
        'trauma_center', h.trauma_center,
        'status', h.status,
        'available_icu_beds', COALESCE(icu.available_beds, 0),
        'allocatable_icu_beds', GREATEST(COALESCE(icu.available_beds, 0) - COALESCE(icu.minimum_beds, 0), 0),
        'icu_updated_at', icu.updated_at,
        'available_beds', COALESCE(general_beds.available_beds, 0),
        'allocatable_general_beds', GREATEST(COALESCE(general_beds.available_beds, 0) - COALESCE(general_beds.minimum_beds, 0), 0),
        'beds_updated_at', general_beds.updated_at,
        'available_oxygen_records', COALESCE(oxygen.available_records, 0),
        'oxygen_updated_at', oxygen.updated_at
      ) ORDER BY h.hospital_name)
      FROM public.hospitals h
      LEFT JOIN LATERAL (
        SELECT CASE WHEN count(*) = 1 THEN max(i.available_icu_beds) ELSE 0 END AS available_beds,
               CASE WHEN count(*) = 1 THEN max(i.minimum_icu_beds) ELSE 0 END AS minimum_beds,
               CASE WHEN count(*) = 1 THEN max(i.updated_at) END AS updated_at
        FROM public.icu_inventory i WHERE i.hospital_id = h.hospital_id
      ) icu ON true
      LEFT JOIN LATERAL (
        SELECT CASE WHEN count(*) = 1 THEN max(b.available_beds) ELSE 0 END AS available_beds,
               CASE WHEN count(*) = 1 THEN max(b.minimum_beds) ELSE 0 END AS minimum_beds,
               CASE WHEN count(*) = 1 THEN max(b.updated_at) END AS updated_at
        FROM public.general_bed_inventory b WHERE b.hospital_id = h.hospital_id
      ) general_beds ON true
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (
                 WHERE o.available_capacity > o.minimum_threshold
                   AND o.updated_at >= now() - interval '1 hour'
                   AND o.updated_at <= now()
               )::INTEGER AS available_records,
               min(o.updated_at) AS updated_at
        FROM public.oxygen_inventory o
        WHERE o.hospital_id = h.hospital_id
      ) oxygen ON true
      WHERE h.status = 'Active'
    ), '[]'::jsonb),
    'bloodBanks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'blood_bank_id', b.blood_bank_id,
        'blood_bank_name', b.blood_bank_name,
        'address', b.address,
        'district', b.district,
        'latitude', b.latitude,
        'longitude', b.longitude,
        'status', b.status,
        'blood_stock', COALESCE(stock.stock, '{}'::jsonb),
        'blood_thresholds', COALESCE(stock.thresholds, '{}'::jsonb),
        'blood_updated_at', COALESCE(stock.updated_at, '{}'::jsonb)
      ) ORDER BY b.blood_bank_name)
      FROM public.blood_banks b
      LEFT JOIN LATERAL (
        SELECT
          jsonb_object_agg(grouped.blood_group, grouped.available_units) AS stock,
          jsonb_object_agg(grouped.blood_group, grouped.minimum_threshold) AS thresholds,
          jsonb_object_agg(grouped.blood_group, grouped.updated_at) AS updated_at
        FROM (
          SELECT DISTINCT ON (bi.blood_group)
            bi.blood_group::TEXT AS blood_group,
            greatest(bi.available_units - bi.reserved_units - bi.expired_units, 0) AS available_units,
            bi.minimum_threshold,
            bi.updated_at
          FROM public.blood_inventory bi
          WHERE bi.blood_bank_id = b.blood_bank_id
          ORDER BY bi.blood_group,
            (greatest(bi.available_units - bi.reserved_units - bi.expired_units, 0) - bi.minimum_threshold) DESC
        ) grouped
      ) stock ON true
      WHERE b.status = 'Active'
    ), '[]'::jsonb),
    'ambulances', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'ambulance_id', a.ambulance_id,
        'vehicle_number', a.vehicle_number,
        'ambulance_type', a.ambulance_type,
        'status', a.status,
        'current_latitude', a.current_latitude,
        'current_longitude', a.current_longitude,
        'assigned_hospital', a.assigned_hospital,
        'updated_at', a.updated_at
      ) ORDER BY a.vehicle_number)
      FROM public.ambulances a
      JOIN public.ambulance_providers p ON p.provider_id = a.provider_id AND p.status = 'Active'
      WHERE a.status = 'Available'
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_emergency_request(
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
  v_request public.patient_requests;
  v_icu public.icu_inventory;
  v_bed public.general_bed_inventory;
  v_ambulance public.ambulances;
  v_icu_quantity integer;
  v_general_quantity integer;
  v_case public.emergency_cases;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.role::text <> 'clinician_reviewer' OR v_user.status IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'An active clinician reviewer account is required';
  END IF;

  SELECT * INTO v_request FROM public.patient_requests
    WHERE request_id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.data_origin IS DISTINCT FROM 'synthetic'
     OR v_request.status NOT IN ('Pending', 'Recommended') THEN
    RAISE EXCEPTION 'Only pending synthetic requests can be reviewed';
  END IF;
  v_icu_quantity := CASE WHEN v_request.needs_icu THEN COALESCE(v_request.requested_icu_beds, 1) ELSE 0 END;
  v_general_quantity := CASE WHEN v_request.needs_general_bed THEN COALESCE(v_request.requested_general_beds, 1) ELSE 0 END;
  IF (v_request.needs_icu AND v_icu_quantity < 1)
     OR (v_request.needs_general_bed AND v_general_quantity < 1) THEN
    RAISE EXCEPTION 'Requested bed quantities must be positive';
  END IF;

  IF v_request.needs_icu THEN
    SELECT * INTO v_icu FROM public.icu_inventory
      WHERE hospital_id = p_hospital_id FOR UPDATE;
    IF NOT FOUND OR v_icu.available_icu_beds - COALESCE(v_icu.minimum_icu_beds, 0) < v_icu_quantity THEN
      RAISE EXCEPTION 'Selected hospital lacks enough ICU beds above its protected minimum';
    END IF;
    IF v_icu.updated_at IS NULL OR v_icu.updated_at < now() - interval '15 minutes' OR v_icu.updated_at > now() THEN
      RAISE EXCEPTION 'ICU availability is stale or unknown; refresh inventory before recording an assignment';
    END IF;
  END IF;

  IF v_request.needs_general_bed THEN
    SELECT * INTO v_bed FROM public.general_bed_inventory
      WHERE hospital_id = p_hospital_id FOR UPDATE;
    IF NOT FOUND OR v_bed.available_beds - COALESCE(v_bed.minimum_beds, 0) < v_general_quantity THEN
      RAISE EXCEPTION 'Selected hospital lacks enough general beds above its protected minimum';
    END IF;
    IF v_bed.updated_at IS NULL OR v_bed.updated_at < now() - interval '15 minutes' OR v_bed.updated_at > now() THEN
      RAISE EXCEPTION 'General-bed availability is stale or unknown; refresh inventory before recording an assignment';
    END IF;
  END IF;

  IF v_request.needs_oxygen THEN
    PERFORM 1 FROM public.oxygen_inventory
      WHERE hospital_id = p_hospital_id ORDER BY oxygen_inventory_id FOR UPDATE;
    IF NOT EXISTS (
      SELECT 1 FROM public.oxygen_inventory
      WHERE hospital_id = p_hospital_id
        AND available_capacity > minimum_threshold
        AND updated_at >= now() - interval '1 hour'
        AND updated_at <= now()
    ) THEN
      RAISE EXCEPTION 'No fresh oxygen inventory is recorded above the protected minimum';
    END IF;
  END IF;

  IF v_request.needs_ambulance THEN
    IF p_ambulance_id IS NULL THEN RAISE EXCEPTION 'An ambulance is required for this request'; END IF;
    SELECT a.* INTO v_ambulance FROM public.ambulances a
      JOIN public.ambulance_providers p ON p.provider_id = a.provider_id AND p.status = 'Active'
      WHERE a.ambulance_id = p_ambulance_id AND a.status = 'Available'
      FOR UPDATE OF a, p;
    IF NOT FOUND THEN RAISE EXCEPTION 'Selected ambulance is not available through an active provider'; END IF;
    IF v_ambulance.updated_at IS NULL OR v_ambulance.updated_at < now() - interval '15 minutes' OR v_ambulance.updated_at > now() THEN
      RAISE EXCEPTION 'Ambulance availability is stale or unknown; refresh fleet status before recording an assignment';
    END IF;
  END IF;

  IF v_request.needs_blood THEN
    IF p_blood_bank_id IS NULL THEN RAISE EXCEPTION 'A blood bank is required for this request'; END IF;
    PERFORM 1 FROM public.blood_inventory bi
      WHERE bi.blood_bank_id = p_blood_bank_id
        AND (v_request.required_blood_group IS NULL OR bi.blood_group = v_request.required_blood_group)
      ORDER BY bi.blood_group FOR UPDATE;
    IF NOT EXISTS (
      SELECT 1 FROM public.blood_inventory bi
      JOIN public.blood_banks bb ON bb.blood_bank_id = bi.blood_bank_id AND bb.status = 'Active'
      WHERE bi.blood_bank_id = p_blood_bank_id
        AND (v_request.required_blood_group IS NULL OR bi.blood_group = v_request.required_blood_group)
        AND GREATEST(bi.available_units - bi.reserved_units - bi.expired_units, 0) > bi.minimum_threshold
        AND bi.updated_at >= now() - interval '1 hour'
        AND bi.updated_at <= now()
    ) THEN
      RAISE EXCEPTION 'No fresh compatible blood stock is recorded above the protected minimum';
    END IF;
  ELSIF p_blood_bank_id IS NOT NULL THEN
    RAISE EXCEPTION 'Do not assign a blood bank to a request that does not need one';
  END IF;

  -- The private allocator reserves one unit for each selected bed category.
  -- Reserve the remainder here; all changes roll back if any later check fails.
  IF v_icu_quantity > 1 THEN
    UPDATE public.icu_inventory
      SET available_icu_beds = available_icu_beds - (v_icu_quantity - 1),
          reserved_icu_beds = reserved_icu_beds + (v_icu_quantity - 1),
          updated_at = now()
      WHERE icu_inventory_id = v_icu.icu_inventory_id;
  END IF;
  IF v_general_quantity > 1 THEN
    UPDATE public.general_bed_inventory
      SET available_beds = available_beds - (v_general_quantity - 1),
          reserved_beds = reserved_beds + (v_general_quantity - 1),
          updated_at = now()
      WHERE bed_inventory_id = v_bed.bed_inventory_id;
  END IF;

  SELECT * INTO v_case FROM public.approve_emergency_request_internal(
    p_request_id, p_hospital_id, p_ambulance_id, p_blood_bank_id, p_confirmed_urgency
  );
  RETURN v_case;
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinician_review_network() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clinician_review_network() TO authenticated;
REVOKE ALL ON FUNCTION public.approve_emergency_request(UUID, UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_emergency_request(UUID, UUID, UUID, UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
