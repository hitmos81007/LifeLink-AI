-- Capture the amount and timing of each synthetic operational need. This
-- creates no patient identity fields and does not assign clinical urgency.
BEGIN;

ALTER TABLE public.patient_requests
  ADD COLUMN IF NOT EXISTS requested_icu_beds integer,
  ADD COLUMN IF NOT EXISTS requested_general_beds integer,
  ADD COLUMN IF NOT EXISTS requested_oxygen_units integer,
  ADD COLUMN IF NOT EXISTS requested_blood_units integer,
  ADD COLUMN IF NOT EXISTS requested_ambulances integer,
  ADD COLUMN IF NOT EXISTS needed_by timestamptz;

ALTER TABLE public.patient_requests
  DROP CONSTRAINT IF EXISTS patient_requests_synthetic_need_quantities_check;
ALTER TABLE public.patient_requests ADD CONSTRAINT patient_requests_synthetic_need_quantities_check
  CHECK (
    needed_by IS NULL OR (
      data_origin = 'synthetic'
      AND requested_icu_beds IS NOT NULL AND requested_icu_beds >= 0
      AND requested_general_beds IS NOT NULL AND requested_general_beds >= 0
      AND requested_oxygen_units IS NOT NULL AND requested_oxygen_units >= 0
      AND requested_blood_units IS NOT NULL AND requested_blood_units >= 0
      AND requested_ambulances IS NOT NULL AND requested_ambulances >= 0
      AND (needs_icu OR needs_general_bed OR needs_oxygen OR needs_blood OR needs_ambulance)
      AND needs_icu = (requested_icu_beds > 0)
      AND needs_general_bed = (requested_general_beds > 0)
      AND needs_oxygen = (requested_oxygen_units > 0)
      AND needs_blood = (requested_blood_units > 0)
      AND needs_ambulance = (requested_ambulances > 0)
    )
  ) NOT VALID;

ALTER TABLE public.patient_requests VALIDATE CONSTRAINT patient_requests_synthetic_need_quantities_check;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.patient_requests'::regclass AND conname='patient_requests_icu_quantity_nonnegative') THEN
    ALTER TABLE public.patient_requests ADD CONSTRAINT patient_requests_icu_quantity_nonnegative CHECK (requested_icu_beds IS NULL OR requested_icu_beds >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.patient_requests'::regclass AND conname='patient_requests_general_bed_quantity_nonnegative') THEN
    ALTER TABLE public.patient_requests ADD CONSTRAINT patient_requests_general_bed_quantity_nonnegative CHECK (requested_general_beds IS NULL OR requested_general_beds >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.patient_requests'::regclass AND conname='patient_requests_oxygen_quantity_nonnegative') THEN
    ALTER TABLE public.patient_requests ADD CONSTRAINT patient_requests_oxygen_quantity_nonnegative CHECK (requested_oxygen_units IS NULL OR requested_oxygen_units >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.patient_requests'::regclass AND conname='patient_requests_blood_quantity_nonnegative') THEN
    ALTER TABLE public.patient_requests ADD CONSTRAINT patient_requests_blood_quantity_nonnegative CHECK (requested_blood_units IS NULL OR requested_blood_units >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.patient_requests'::regclass AND conname='patient_requests_ambulance_quantity_nonnegative') THEN
    ALTER TABLE public.patient_requests ADD CONSTRAINT patient_requests_ambulance_quantity_nonnegative CHECK (requested_ambulances IS NULL OR requested_ambulances >= 0) NOT VALID;
  END IF;
END;
$$;
ALTER TABLE public.patient_requests
  VALIDATE CONSTRAINT patient_requests_icu_quantity_nonnegative,
  VALIDATE CONSTRAINT patient_requests_general_bed_quantity_nonnegative,
  VALIDATE CONSTRAINT patient_requests_oxygen_quantity_nonnegative,
  VALIDATE CONSTRAINT patient_requests_blood_quantity_nonnegative,
  VALIDATE CONSTRAINT patient_requests_ambulance_quantity_nonnegative;

CREATE OR REPLACE FUNCTION public.create_synthetic_patient_request_with_needs(
  p_emergency_type text,
  p_required_blood_group text,
  p_needs_blood boolean,
  p_needs_icu boolean,
  p_needs_general_bed boolean,
  p_needs_oxygen boolean,
  p_needs_ambulance boolean,
  p_reported_severity text,
  p_latitude numeric,
  p_longitude numeric,
  p_requested_icu_beds integer,
  p_requested_general_beds integer,
  p_requested_oxygen_units integer,
  p_requested_blood_units integer,
  p_requested_ambulances integer,
  p_needed_by timestamptz
) RETURNS public.patient_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_request public.patient_requests;
  v_reviewers uuid[];
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.role::text <> 'patient' OR v_user.status IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'An active patient account is required to save a prototype scenario';
  END IF;
  IF p_emergency_type IS NULL OR p_emergency_type NOT IN (
    'Road Accident','Cardiac Arrest','Stroke','Trauma','Burn','Pregnancy','Poisoning','Other'
  ) THEN
    RAISE EXCEPTION 'Unsupported synthetic scenario type';
  END IF;
  IF p_reported_severity IS NULL OR p_reported_severity NOT IN ('Low','Medium','High','Critical') THEN
    RAISE EXCEPTION 'Unsupported synthetic scenario severity';
  END IF;
  IF p_needs_blood IS NULL OR p_needs_icu IS NULL OR p_needs_general_bed IS NULL
     OR p_needs_oxygen IS NULL OR p_needs_ambulance IS NULL THEN
    RAISE EXCEPTION 'All synthetic scenario resource flags must be provided';
  END IF;
  IF NOT (p_needs_icu OR p_needs_general_bed OR p_needs_oxygen OR p_needs_blood OR p_needs_ambulance) THEN
    RAISE EXCEPTION 'Select at least one resource for the synthetic scenario';
  END IF;
  IF p_needs_blood AND (p_required_blood_group IS NULL OR p_required_blood_group NOT IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')) THEN
    RAISE EXCEPTION 'Select a valid blood group for this synthetic scenario';
  END IF;
  IF NOT p_needs_blood AND p_required_blood_group IS NOT NULL THEN
    RAISE EXCEPTION 'Do not include a blood group when blood is not selected';
  END IF;
  IF p_requested_icu_beds IS NULL OR p_requested_general_beds IS NULL
     OR p_requested_oxygen_units IS NULL OR p_requested_blood_units IS NULL
     OR p_requested_ambulances IS NULL
     OR p_requested_icu_beds NOT BETWEEN 0 AND 10000
     OR p_requested_general_beds NOT BETWEEN 0 AND 10000
     OR p_requested_oxygen_units NOT BETWEEN 0 AND 10000
     OR p_requested_blood_units NOT BETWEEN 0 AND 10000
     OR p_requested_ambulances NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'Requested quantities must be whole numbers from 0 to 10,000';
  END IF;
  IF p_needs_icu IS DISTINCT FROM (p_requested_icu_beds > 0)
     OR p_needs_general_bed IS DISTINCT FROM (p_requested_general_beds > 0)
     OR p_needs_oxygen IS DISTINCT FROM (p_requested_oxygen_units > 0)
     OR p_needs_blood IS DISTINCT FROM (p_requested_blood_units > 0)
     OR p_needs_ambulance IS DISTINCT FROM (p_requested_ambulances > 0) THEN
    RAISE EXCEPTION 'Each selected resource needs a positive quantity; unselected resources must have quantity zero';
  END IF;
  IF p_needed_by IS NULL OR p_needed_by <= now() OR p_needed_by > now() + interval '30 days' THEN
    RAISE EXCEPTION 'Needed-by time must be in the future and within the next 30 days';
  END IF;
  IF (p_latitude IS NULL) <> (p_longitude IS NULL) THEN
    RAISE EXCEPTION 'Provide both coordinates for a fictional map point or leave both blank';
  END IF;
  IF p_latitude IS NOT NULL AND (
    p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180
  ) THEN
    RAISE EXCEPTION 'Fictional map point is outside valid coordinate bounds';
  END IF;
  IF p_latitude IS NOT NULL AND (p_latitude <> round(p_latitude,2) OR p_longitude <> round(p_longitude,2)) THEN
    RAISE EXCEPTION 'Synthetic scenario coordinates must be rounded to about one kilometer';
  END IF;

  INSERT INTO public.patient_requests(
    patient_id,emergency_type,required_blood_group,needs_blood,needs_icu,needs_general_bed,
    needs_oxygen,needs_ambulance,requested_icu_beds,requested_general_beds,requested_oxygen_units,
    requested_blood_units,requested_ambulances,needed_by,reported_severity,severity,
    latitude,longitude,status,notes,data_origin,created_at,updated_at
  ) VALUES (
    v_user.user_id,p_emergency_type::public.emergency_type,
    CASE WHEN p_needs_blood THEN p_required_blood_group::public.blood_group ELSE NULL END,
    p_needs_blood,p_needs_icu,p_needs_general_bed,p_needs_oxygen,p_needs_ambulance,
    p_requested_icu_beds,p_requested_general_beds,p_requested_oxygen_units,p_requested_blood_units,
    p_requested_ambulances,p_needed_by,p_reported_severity,p_reported_severity::public.severity_level,
    p_latitude,p_longitude,'Pending',NULL,'synthetic',now(),now()
  ) RETURNING * INTO v_request;

  SELECT array_agg(user_id) INTO v_reviewers FROM public.users
    WHERE status IS TRUE AND role::text='clinician_reviewer';
  PERFORM public.enqueue_workflow_notifications_internal(
    ARRAY[v_user.user_id]::uuid[],'patient_request_saved','patient_request',v_request.request_id,
    'Synthetic scenario saved','Your fictional scenario was saved for prototype review. No emergency service was contacted.','Low'
  );
  PERFORM public.enqueue_workflow_notifications_internal(
    v_reviewers,'patient_request_needs_review','patient_request',v_request.request_id,
    'Synthetic scenario awaiting review','A new fictional emergency scenario is waiting in the clinician review queue. Patient-reported urgency is unverified.','Medium'
  );
  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION public.create_synthetic_patient_request_with_needs(
  text,text,boolean,boolean,boolean,boolean,boolean,text,numeric,numeric,integer,integer,integer,integer,integer,timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_synthetic_patient_request_with_needs(
  text,text,boolean,boolean,boolean,boolean,boolean,text,numeric,numeric,integer,integer,integer,integer,integer,timestamptz
) TO authenticated;

-- Retire old request endpoints that cannot supply the new required contract.
REVOKE ALL ON FUNCTION public.create_synthetic_patient_request(text,text,boolean,boolean,boolean,boolean,boolean,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_synthetic_patient_request_with_location(
  text,text,boolean,boolean,boolean,boolean,boolean,text,numeric,numeric
) FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.patient_requests FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.patient_requests.needed_by IS 'Requested time for a synthetic operational need; it is not a clinical priority or treatment instruction.';
COMMENT ON COLUMN public.patient_requests.requested_blood_units IS 'Synthetic aggregate blood-unit request count; not a transfusion order.';
COMMENT ON COLUMN public.patient_requests.requested_oxygen_units IS 'Synthetic aggregate oxygen resource-unit count; not a treatment dose.';

COMMIT;
