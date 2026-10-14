-- Recheck data freshness inside the same transaction that records a clinician
-- assignment. Inventory is locked in the same order as the private allocator.
BEGIN;

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

  IF v_request.needs_icu THEN
    SELECT * INTO v_icu FROM public.icu_inventory
      WHERE hospital_id = p_hospital_id FOR UPDATE;
    IF NOT FOUND OR v_icu.available_icu_beds < 1 THEN
      RAISE EXCEPTION 'Selected hospital has no available ICU bed';
    END IF;
    IF v_icu.updated_at IS NULL OR v_icu.updated_at < now() - interval '15 minutes' OR v_icu.updated_at > now() THEN
      RAISE EXCEPTION 'ICU availability is stale or unknown; refresh inventory before recording an assignment';
    END IF;
  END IF;

  IF v_request.needs_general_bed THEN
    SELECT * INTO v_bed FROM public.general_bed_inventory
      WHERE hospital_id = p_hospital_id FOR UPDATE;
    IF NOT FOUND OR v_bed.available_beds < 1 THEN
      RAISE EXCEPTION 'Selected hospital has no available general bed';
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
  END IF;

  SELECT * INTO v_case FROM public.approve_emergency_request_internal(
    p_request_id, p_hospital_id, p_ambulance_id, p_blood_bank_id, p_confirmed_urgency
  );
  RETURN v_case;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_emergency_request(UUID, UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_emergency_request(UUID, UUID, UUID, UUID, TEXT) TO authenticated;

COMMIT;
