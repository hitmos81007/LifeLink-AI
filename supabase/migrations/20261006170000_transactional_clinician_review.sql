-- Clinician review is a single database transaction. The clinician identity is
-- taken from auth.uid(); client-supplied role and identity fields are ignored.
-- Bed rows are reserved and ambulance records assigned. Oxygen and blood stock
-- are checked as candidates only; the request schema has no clinician-entered
-- quantities, so those supplies are deliberately not reserved here.
CREATE UNIQUE INDEX IF NOT EXISTS icu_inventory_one_row_per_hospital_uidx
  ON public.icu_inventory(hospital_id);
CREATE UNIQUE INDEX IF NOT EXISTS general_bed_inventory_one_row_per_hospital_uidx
  ON public.general_bed_inventory(hospital_id);

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
  v_hospital public.hospitals;
  v_case public.emergency_cases;
  v_icu public.icu_inventory;
  v_bed public.general_bed_inventory;
  v_ambulance public.ambulances;
  v_blood_inventory public.blood_inventory;
  v_has_oxygen boolean;
  v_old_case public.emergency_cases;
  v_message TEXT;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.role::text <> 'clinician_reviewer' THEN
    RAISE EXCEPTION 'Clinician reviewer account required';
  END IF;
  IF p_confirmed_urgency IS NULL OR p_confirmed_urgency NOT IN ('Low', 'Medium', 'High', 'Critical') THEN
    RAISE EXCEPTION 'Choose a valid clinician-confirmed urgency';
  END IF;

  SELECT * INTO v_request
    FROM public.patient_requests
    WHERE request_id = p_request_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Patient request not found'; END IF;
  IF v_request.data_origin IS DISTINCT FROM 'synthetic' OR v_request.status NOT IN ('Pending', 'Recommended') THEN
    RAISE EXCEPTION 'Only pending or recommended requests can be reviewed';
  END IF;

  SELECT * INTO v_hospital FROM public.hospitals
    WHERE hospital_id = p_hospital_id AND status = 'Active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected hospital is not active'; END IF;

  IF v_request.needs_icu THEN
    SELECT * INTO v_icu FROM public.icu_inventory
      WHERE hospital_id = p_hospital_id FOR UPDATE;
    IF NOT FOUND OR v_icu.available_icu_beds < 1 THEN
      RAISE EXCEPTION 'Selected hospital has no available ICU bed';
    END IF;
    UPDATE public.icu_inventory
      SET available_icu_beds = available_icu_beds - 1,
          reserved_icu_beds = reserved_icu_beds + 1,
          updated_at = now()
      WHERE icu_inventory_id = v_icu.icu_inventory_id;
  END IF;

  IF v_request.needs_general_bed THEN
    SELECT * INTO v_bed FROM public.general_bed_inventory
      WHERE hospital_id = p_hospital_id FOR UPDATE;
    IF NOT FOUND OR v_bed.available_beds < 1 THEN
      RAISE EXCEPTION 'Selected hospital has no available general bed';
    END IF;
    UPDATE public.general_bed_inventory
      SET available_beds = available_beds - 1,
          reserved_beds = reserved_beds + 1,
          updated_at = now()
      WHERE bed_inventory_id = v_bed.bed_inventory_id;
  END IF;

  IF v_request.needs_oxygen THEN
    PERFORM 1 FROM public.oxygen_inventory
      WHERE hospital_id = p_hospital_id
      ORDER BY oxygen_inventory_id
      FOR UPDATE;
    SELECT EXISTS (
      SELECT 1 FROM public.oxygen_inventory
      WHERE hospital_id = p_hospital_id AND available_capacity > minimum_threshold
    ) INTO v_has_oxygen;
    IF NOT v_has_oxygen THEN
      RAISE EXCEPTION 'Selected hospital has no recorded oxygen capacity above its protected minimum';
    END IF;
  END IF;

  IF v_request.needs_ambulance THEN
    IF p_ambulance_id IS NULL THEN RAISE EXCEPTION 'An ambulance is required for this request'; END IF;
    SELECT * INTO v_ambulance FROM public.ambulances
      WHERE ambulance_id = p_ambulance_id AND status = 'Available'
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Selected ambulance is not available'; END IF;
    UPDATE public.ambulances
      SET status = 'Assigned', assigned_hospital = p_hospital_id, updated_at = now()
      WHERE ambulance_id = p_ambulance_id;
  ELSIF p_ambulance_id IS NOT NULL THEN
    RAISE EXCEPTION 'Do not assign an ambulance to a request that does not need one';
  END IF;

  IF v_request.needs_blood THEN
    IF p_blood_bank_id IS NULL THEN RAISE EXCEPTION 'A blood bank is required for this request'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.blood_banks
      WHERE blood_bank_id = p_blood_bank_id AND status = 'Active') THEN
      RAISE EXCEPTION 'Selected blood bank is not active';
    END IF;
    SELECT * INTO v_blood_inventory FROM public.blood_inventory
      WHERE blood_bank_id = p_blood_bank_id
        AND (v_request.required_blood_group IS NULL OR blood_group = v_request.required_blood_group)
        AND GREATEST(available_units - reserved_units - expired_units, 0) > minimum_threshold
      ORDER BY GREATEST(available_units - reserved_units - expired_units, 0) - minimum_threshold DESC
      LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Selected bank has no recorded stock above its threshold for the requested blood group';
    END IF;
  ELSIF p_blood_bank_id IS NOT NULL THEN
    RAISE EXCEPTION 'Do not assign a blood bank to a request that does not need one';
  END IF;

  SELECT * INTO v_old_case FROM public.emergency_cases
    WHERE request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_old_case.confirmation_status IS DISTINCT FROM 'unconfirmed'
       OR v_old_case.case_status <> 'Open' THEN
      RAISE EXCEPTION 'An emergency case for this request has already been reviewed';
    END IF;
    UPDATE public.emergency_cases SET
      assigned_hospital_id = p_hospital_id,
      assigned_ambulance_id = p_ambulance_id,
      assigned_blood_bank_id = p_blood_bank_id,
      assigned_by = v_user.user_id,
      priority = p_confirmed_urgency::public.severity_level,
      case_status = 'Assigned',
      ai_generated = false,
      clinician_confirmed_urgency = p_confirmed_urgency::public.severity_level,
      confirmed_by = v_user.user_id,
      confirmed_at = now(),
      confirmation_status = 'confirmed',
      notes = NULL,
      updated_at = now()
    WHERE case_id = v_old_case.case_id RETURNING * INTO v_case;
  ELSE
    INSERT INTO public.emergency_cases (
      request_id, assigned_hospital_id, assigned_ambulance_id,
      assigned_blood_bank_id, assigned_by, priority, case_status,
      ai_generated, clinician_confirmed_urgency, confirmed_by,
      confirmed_at, confirmation_status, notes, created_at, updated_at
    ) VALUES (
      p_request_id, p_hospital_id, p_ambulance_id, p_blood_bank_id,
      v_user.user_id, p_confirmed_urgency::public.severity_level, 'Assigned', false,
      p_confirmed_urgency::public.severity_level, v_user.user_id, now(), 'confirmed',
      NULL, now(), now()
    ) RETURNING * INTO v_case;
  END IF;

  UPDATE public.patient_requests SET status = 'Assigned', updated_at = now()
    WHERE request_id = p_request_id;

  v_message := format('Your prototype request was reviewed and matched to %s. This is not an emergency dispatch or confirmation of care.', v_hospital.hospital_name);
  INSERT INTO public.notifications(receiver_id, title, message, priority, is_read, created_at, updated_at)
    VALUES(v_request.patient_id, 'Prototype request reviewed', v_message, 'High', false, now(), now());
  INSERT INTO public.audit_logs(user_id, action, table_name, record_id, old_value, new_value, created_at)
    VALUES(v_user.user_id, 'CLINICIAN_REQUEST_APPROVED', 'emergency_cases', v_case.case_id,
      jsonb_build_object('request_status', v_request.status),
      jsonb_build_object('request_status', 'Assigned', 'urgency', p_confirmed_urgency,
        'hospital_id', p_hospital_id, 'ambulance_id', p_ambulance_id,
        'blood_bank_id', p_blood_bank_id), now());
  RETURN v_case;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_emergency_request(
  p_request_id UUID,
  p_reason TEXT
) RETURNS public.emergency_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_request public.patient_requests;
  v_case public.emergency_cases;
  v_old_case public.emergency_cases;
  v_urgency TEXT;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.role::text <> 'clinician_reviewer' THEN
    RAISE EXCEPTION 'Clinician reviewer account required';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('Duplicate synthetic scenario', 'Invalid synthetic scenario') THEN
    RAISE EXCEPTION 'Choose an allowed synthetic scenario closure reason';
  END IF;

  SELECT * INTO v_request FROM public.patient_requests
    WHERE request_id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Patient request not found'; END IF;
  IF v_request.data_origin IS DISTINCT FROM 'synthetic' OR v_request.status NOT IN ('Pending', 'Recommended') THEN
    RAISE EXCEPTION 'Only pending or recommended requests can be reviewed';
  END IF;
  v_urgency := COALESCE(v_request.reported_severity, v_request.severity, 'Medium');

  SELECT * INTO v_old_case FROM public.emergency_cases
    WHERE request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_old_case.confirmation_status IS DISTINCT FROM 'unconfirmed'
       OR v_old_case.case_status <> 'Open' THEN
      RAISE EXCEPTION 'An emergency case for this request has already been reviewed';
    END IF;
    UPDATE public.emergency_cases SET
      case_status = 'Cancelled', ai_generated = false,
      clinician_confirmed_urgency = v_urgency::public.severity_level, confirmed_by = v_user.user_id,
      confirmed_at = now(), confirmation_status = 'rejected',
      notes = trim(p_reason), updated_at = now()
      WHERE case_id = v_old_case.case_id RETURNING * INTO v_case;
  ELSE
    INSERT INTO public.emergency_cases (
      request_id, assigned_by, priority, case_status, ai_generated,
      clinician_confirmed_urgency, confirmed_by, confirmed_at,
      confirmation_status, notes, created_at, updated_at
    ) VALUES (
      p_request_id, v_user.user_id, v_urgency::public.severity_level, 'Cancelled', false,
      v_urgency::public.severity_level, v_user.user_id, now(), 'rejected', trim(p_reason), now(), now()
    ) RETURNING * INTO v_case;
  END IF;

  UPDATE public.patient_requests SET status = 'Completed', updated_at = now()
    WHERE request_id = p_request_id;
  INSERT INTO public.notifications(receiver_id, title, message, priority, is_read, created_at, updated_at)
    VALUES(v_request.patient_id, 'Prototype request reviewed',
      'Your prototype request was closed after clinician review. This is not a notice from emergency services.',
      'Medium', false, now(), now());
  INSERT INTO public.audit_logs(user_id, action, table_name, record_id, old_value, new_value, created_at)
    VALUES(v_user.user_id, 'CLINICIAN_REQUEST_REJECTED', 'emergency_cases', v_case.case_id,
      jsonb_build_object('request_status', v_request.status),
      jsonb_build_object('request_status', 'Completed', 'reason', trim(p_reason)), now());
  RETURN v_case;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_emergency_request(UUID, UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_emergency_request(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_emergency_request(UUID, UUID, UUID, UUID, TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.reject_emergency_request(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_emergency_request(UUID, UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_emergency_request(UUID, TEXT) TO authenticated;
