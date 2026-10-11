-- Extend aggregate MCI preparedness estimates with coordinator-configured
-- generic medicine stock units and staffing slots. This does not select a
-- medicine, calculate a dose, or infer a staff-role mix.
BEGIN;

ALTER TABLE public.incident_resource_plans
  DROP CONSTRAINT IF EXISTS incident_resource_plans_resource_type_check;
ALTER TABLE public.incident_resource_plans
  ADD CONSTRAINT incident_resource_plans_resource_type_check
  CHECK (resource_type IN (
    'icu_beds','general_beds','oxygen_units','ambulances','blood_preparedness',
    'medicine_supply_units','staffing_slots'
  ));

CREATE OR REPLACE FUNCTION public.create_incident_plan_internal(
  p_label text,
  p_location_label text,
  p_total_affected integer,
  p_severity_counts jsonb,
  p_ratios jsonb,
  p_expected_arrival_start timestamptz,
  p_expected_arrival_end timestamptz,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_incident uuid;
  v_version uuid;
  v_total integer;
  v_red integer;
  v_yellow integer;
  v_green integer;
  v_black integer;
  v_icu numeric;
  v_general_y numeric;
  v_general_g numeric;
  v_oxygen_r numeric;
  v_oxygen_y numeric;
  v_ambulance_r numeric;
  v_ambulance_y numeric;
  v_blood_min numeric;
  v_blood_max numeric;
  v_medicine_r numeric := 0;
  v_medicine_y numeric := 0;
  v_medicine_g numeric := 0;
  v_staff_r numeric := 0;
  v_staff_y numeric := 0;
  v_staff_g numeric := 0;
  v_ratio_count integer;
  v_method_version text := 'mci-ratio-v1';
  v_rules jsonb;
  v_specs jsonb;
  x record;
  v_core_keys text[] := ARRAY[
    'icu_per_red','general_per_yellow','general_per_green',
    'oxygen_per_red','oxygen_per_yellow','ambulances_per_red',
    'ambulances_per_yellow','blood_min_per_red','blood_max_per_red'
  ];
  v_all_keys text[] := ARRAY[
    'icu_per_red','general_per_yellow','general_per_green',
    'oxygen_per_red','oxygen_per_yellow','ambulances_per_red',
    'ambulances_per_yellow','blood_min_per_red','blood_max_per_red',
    'medicine_supply_per_red','medicine_supply_per_yellow','medicine_supply_per_green',
    'staff_slots_per_red','staff_slots_per_yellow','staff_slots_per_green'
  ];
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = v_uid AND status IS TRUE AND role::text = 'government_admin'
  ) THEN
    RAISE EXCEPTION 'An active district coordinator account is required';
  END IF;

  IF jsonb_typeof(p_severity_counts) <> 'object' OR
     (p_severity_counts - ARRAY['red','yellow','green','black']::text[]) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Severity counts must contain only red, yellow, green, and black aggregate counts';
  END IF;
  IF (p_severity_counts->>'red') !~ '^\d+$' OR
     (p_severity_counts->>'yellow') !~ '^\d+$' OR
     (p_severity_counts->>'green') !~ '^\d+$' OR
     (p_severity_counts->>'black') !~ '^\d+$' THEN
    RAISE EXCEPTION 'All four severity counts are required and must be non-negative integers';
  END IF;
  v_red := (p_severity_counts->>'red')::integer;
  v_yellow := (p_severity_counts->>'yellow')::integer;
  v_green := (p_severity_counts->>'green')::integer;
  v_black := (p_severity_counts->>'black')::integer;
  v_total := v_red + v_yellow + v_green + v_black;
  IF v_total <= 0 OR v_total > 10000 OR p_total_affected <> v_total THEN
    RAISE EXCEPTION 'Affected total must equal severity counts (1 to 10000)';
  END IF;
  IF length(trim(p_label)) NOT BETWEEN 3 AND 120 OR
     p_label ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' OR
     regexp_replace(p_label,'[^0-9]','','g') ~ '[0-9]{10,}' THEN
    RAISE EXCEPTION 'Scenario label is invalid or contains contact details';
  END IF;
  IF p_expected_arrival_start IS NULL OR p_expected_arrival_end IS NULL OR
     p_expected_arrival_start > p_expected_arrival_end THEN
    RAISE EXCEPTION 'Provide a valid expected arrival time window';
  END IF;

  IF p_ratios IS NULL OR jsonb_typeof(p_ratios) <> 'object' OR
     (p_ratios - v_all_keys) <> '{}'::jsonb OR
     NOT (p_ratios ?& v_core_keys) THEN
    RAISE EXCEPTION 'Planning ratios must use the supported configuration fields';
  END IF;
  SELECT count(*) INTO v_ratio_count FROM jsonb_object_keys(p_ratios);
  -- Nine-field requests remain valid for existing clients. New clients send
  -- all six optional fields together, preventing silent partial configuration.
  IF v_ratio_count NOT IN (9,15) OR EXISTS (
    SELECT 1 FROM jsonb_each_text(p_ratios) e
    WHERE CASE WHEN e.value ~ '^\d+(\.\d{1,2})?$'
      THEN e.value::numeric > 20 ELSE true END
  ) THEN
    RAISE EXCEPTION 'Provide all 9 legacy ratios, or all 15 ratios, between 0 and 20';
  END IF;

  v_icu := (p_ratios->>'icu_per_red')::numeric;
  v_general_y := (p_ratios->>'general_per_yellow')::numeric;
  v_general_g := (p_ratios->>'general_per_green')::numeric;
  v_oxygen_r := (p_ratios->>'oxygen_per_red')::numeric;
  v_oxygen_y := (p_ratios->>'oxygen_per_yellow')::numeric;
  v_ambulance_r := (p_ratios->>'ambulances_per_red')::numeric;
  v_ambulance_y := (p_ratios->>'ambulances_per_yellow')::numeric;
  v_blood_min := (p_ratios->>'blood_min_per_red')::numeric;
  v_blood_max := (p_ratios->>'blood_max_per_red')::numeric;
  IF v_ratio_count = 15 THEN
    v_method_version := 'mci-ratio-v2';
    v_medicine_r := (p_ratios->>'medicine_supply_per_red')::numeric;
    v_medicine_y := (p_ratios->>'medicine_supply_per_yellow')::numeric;
    v_medicine_g := (p_ratios->>'medicine_supply_per_green')::numeric;
    v_staff_r := (p_ratios->>'staff_slots_per_red')::numeric;
    v_staff_y := (p_ratios->>'staff_slots_per_yellow')::numeric;
    v_staff_g := (p_ratios->>'staff_slots_per_green')::numeric;
  END IF;
  IF v_blood_min > v_blood_max THEN
    RAISE EXCEPTION 'Blood preparedness maximum must be at least its minimum';
  END IF;
  IF p_location_label NOT IN ('Synthetic district A','Synthetic district B','Synthetic district C') THEN
    RAISE EXCEPTION 'Choose a synthetic district';
  END IF;
  IF (p_latitude IS NULL) <> (p_longitude IS NULL) OR
     (p_latitude IS NOT NULL AND
       (p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180)) THEN
    RAISE EXCEPTION 'Provide a valid coordinate pair or leave both blank';
  END IF;

  v_rules := jsonb_build_object(
    'method_version',v_method_version,
    'ratios',p_ratios,
    'range_policy',CASE WHEN v_ratio_count = 15
      THEN '±20% beds, generic medicine supply and staffing; ±25% oxygen and ambulances; blood uses configured low/high'
      ELSE 'Legacy method: ±20% beds; ±25% oxygen and ambulances; blood uses configured low/high' END,
    'medicine_scope','generic stock units only; no item or dosage selected',
    'staffing_scope','aggregate slots only; no staff-role mix inferred'
  );
  INSERT INTO public.incidents(
    label,location_label,latitude,longitude,expected_arrival_start,
    expected_arrival_end,created_by
  ) VALUES (
    trim(p_label),p_location_label,p_latitude,p_longitude,
    p_expected_arrival_start,p_expected_arrival_end,v_uid
  ) RETURNING id INTO v_incident;
  INSERT INTO public.incident_versions(
    incident_id,version_number,total_affected,severity_counts,assumptions,created_by
  ) VALUES (v_incident,1,v_total,p_severity_counts,v_rules,v_uid)
    RETURNING id INTO v_version;
  UPDATE public.incidents SET current_version_id=v_version WHERE id=v_incident;

  v_specs := jsonb_build_array(
    jsonb_build_object('type','icu_beds','expected',ceil(v_red*v_icu),'low',floor(v_red*v_icu*0.8),'high',ceil(v_red*v_icu*1.2),'formula',v_icu||' configured ICU beds per red count','uncertainty','Illustrative ±20% planning range; verify capacity before action'),
    jsonb_build_object('type','general_beds','expected',ceil(v_yellow*v_general_y+v_green*v_general_g),'low',floor((v_yellow*v_general_y+v_green*v_general_g)*0.8),'high',ceil((v_yellow*v_general_y+v_green*v_general_g)*1.2),'formula',v_general_y||' configured per yellow + '||v_general_g||' configured per green','uncertainty','Illustrative ±20% planning range; verify capacity before action'),
    jsonb_build_object('type','oxygen_units','expected',ceil(v_red*v_oxygen_r+v_yellow*v_oxygen_y),'low',floor((v_red*v_oxygen_r+v_yellow*v_oxygen_y)*0.75),'high',ceil((v_red*v_oxygen_r+v_yellow*v_oxygen_y)*1.25),'formula',v_oxygen_r||' configured per red + '||v_oxygen_y||' configured per yellow','uncertainty','Illustrative ±25% planning range; verify capacity before action'),
    jsonb_build_object('type','ambulances','expected',ceil(v_red*v_ambulance_r+v_yellow*v_ambulance_y),'low',floor((v_red*v_ambulance_r+v_yellow*v_ambulance_y)*0.75),'high',ceil((v_red*v_ambulance_r+v_yellow*v_ambulance_y)*1.25),'formula',v_ambulance_r||' configured per red + '||v_ambulance_y||' configured per yellow','uncertainty','Illustrative ±25% planning range; verify capacity before action'),
    jsonb_build_object('type','blood_preparedness','expected',ceil(v_red*(v_blood_min+v_blood_max)/2),'low',floor(v_red*v_blood_min),'high',ceil(v_red*v_blood_max),'formula','Preparedness range '||v_blood_min||'–'||v_blood_max||' configured stock units per red; not a clinical order','uncertainty','Configured lower and upper preparedness bounds; not a transfusion estimate')
  );
  -- Keep legacy nine-ratio callers on the original five-resource output.
  -- New callers supply all six generic supply/staffing ratios, including zeros.
  IF v_ratio_count = 15 THEN
    v_specs := v_specs || jsonb_build_array(
      jsonb_build_object('type','medicine_supply_units','expected',ceil(v_red*v_medicine_r+v_yellow*v_medicine_y+v_green*v_medicine_g),'low',floor((v_red*v_medicine_r+v_yellow*v_medicine_y+v_green*v_medicine_g)*0.8),'high',ceil((v_red*v_medicine_r+v_yellow*v_medicine_y+v_green*v_medicine_g)*1.2),'formula',v_medicine_r||' configured generic stock units per red + '||v_medicine_y||' per yellow + '||v_medicine_g||' per green','uncertainty','Illustrative ±20% planning range; no medicine item, dosage or treatment is selected'),
      jsonb_build_object('type','staffing_slots','expected',ceil(v_red*v_staff_r+v_yellow*v_staff_y+v_green*v_staff_g),'low',floor((v_red*v_staff_r+v_yellow*v_staff_y+v_green*v_staff_g)*0.8),'high',ceil((v_red*v_staff_r+v_yellow*v_staff_y+v_green*v_staff_g)*1.2),'formula',v_staff_r||' configured staffing slots per red + '||v_staff_y||' per yellow + '||v_staff_g||' per green','uncertainty','Illustrative ±20% planning range; no staff-role mix is inferred')
    );
  END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(v_specs) LOOP
    INSERT INTO public.incident_resource_plans(
      incident_version_id,resource_type,estimated_min,estimated_expected,
      estimated_max,method_version,assumption_details
    ) VALUES (
      v_version,x.value->>'type',(x.value->>'low')::numeric,
      (x.value->>'expected')::numeric,(x.value->>'high')::numeric,
      v_method_version,jsonb_build_object(
        'formula',x.value->>'formula','uncertainty',x.value->>'uncertainty',
        'source','coordinator-configured aggregate severity ratios'
      )
    );
  END LOOP;
  INSERT INTO public.plan_reviews(incident_version_id,status) VALUES(v_version,'pending');
  INSERT INTO public.audit_logs(user_id,action,table_name,record_id,old_value,new_value,created_at)
  VALUES(v_uid,'CREATE_SYNTHETIC_INCIDENT_PLAN','incidents',v_incident,NULL,
    jsonb_build_object('incident_version_id',v_version,'total_affected',v_total,
      'severity_counts',p_severity_counts,'method_version',v_method_version),now());
  RETURN v_incident;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_incident_plan_internal(
  p_version_id uuid,
  p_decision text,
  p_reason text,
  p_adjustments jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_review uuid;
  v_old_version public.incident_versions%ROWTYPE;
  v_new_version uuid;
  v_next_number integer;
  v_incident_id uuid;
  v_expected numeric;
  v_adjustment_count integer;
  v_reviewed_version uuid := p_version_id;
  v_plan record;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id=v_uid AND role::text='clinician_reviewer'
  ) THEN
    RAISE EXCEPTION 'Only a clinician reviewer may review this plan';
  END IF;
  IF p_decision NOT IN ('approved','rejected') OR length(trim(coalesce(p_reason,''))) < 8 THEN
    RAISE EXCEPTION 'Choose approve/reject and provide a review reason (at least 8 characters)';
  END IF;
  IF p_adjustments IS NULL OR jsonb_typeof(p_adjustments) <> 'object' THEN
    RAISE EXCEPTION 'Adjustments must be a JSON object';
  END IF;
  IF p_reason ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' OR
     regexp_replace(p_reason,'[^0-9]','','g') ~ '[0-9]{10,}' THEN
    RAISE EXCEPTION 'Review reason must not contain email addresses or phone numbers';
  END IF;
  IF p_decision='rejected' AND p_adjustments <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Rejected plans cannot include estimate adjustments';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each_text(p_adjustments) e
    WHERE e.key NOT IN (
      'icu_beds','general_beds','oxygen_units','ambulances','blood_preparedness',
      'medicine_supply_units','staffing_slots'
    ) OR CASE WHEN e.value ~ '^\d+(\.\d{1,2})?$'
      THEN e.value::numeric > 1000000 ELSE true END
  ) THEN
    RAISE EXCEPTION 'Adjustments must be non-negative numeric expected values for known resources';
  END IF;

  SELECT * INTO v_old_version FROM public.incident_versions WHERE id=p_version_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.incidents
    WHERE id=v_old_version.incident_id AND current_version_id=p_version_id
  ) THEN
    RAISE EXCEPTION 'Only the current incident version may be reviewed';
  END IF;
  SELECT id INTO v_review FROM public.plan_reviews
  WHERE incident_version_id=p_version_id AND status='pending' FOR UPDATE;
  IF v_review IS NULL THEN RAISE EXCEPTION 'This plan is no longer pending review'; END IF;
  v_incident_id := v_old_version.incident_id;
  SELECT count(*) INTO v_adjustment_count FROM jsonb_object_keys(p_adjustments);

  IF p_decision='approved' AND v_adjustment_count > 0 THEN
    SELECT coalesce(max(version_number),0)+1 INTO v_next_number
    FROM public.incident_versions WHERE incident_id=v_incident_id;
    INSERT INTO public.incident_versions(
      incident_id,version_number,total_affected,severity_counts,assumptions,
      created_by,supersedes_version_id
    ) VALUES (
      v_incident_id,v_next_number,v_old_version.total_affected,
      v_old_version.severity_counts,
      v_old_version.assumptions||jsonb_build_object('review_adjustments',p_adjustments),
      v_uid,p_version_id
    ) RETURNING id INTO v_new_version;
    FOR v_plan IN
      SELECT * FROM public.incident_resource_plans WHERE incident_version_id=p_version_id
    LOOP
      v_expected := coalesce((p_adjustments->>v_plan.resource_type)::numeric,v_plan.estimated_expected);
      INSERT INTO public.incident_resource_plans(
        incident_version_id,resource_type,estimated_min,estimated_expected,
        estimated_max,available_at_calculation,gap,capacity_snapshot_at,
        method_version,assumption_details
      ) VALUES (
        v_new_version,v_plan.resource_type,least(v_plan.estimated_min,v_expected),
        v_expected,greatest(v_plan.estimated_max,v_expected),
        v_plan.available_at_calculation,v_plan.gap,v_plan.capacity_snapshot_at,
        v_plan.method_version,
        v_plan.assumption_details||jsonb_build_object('review_adjusted',p_adjustments ? v_plan.resource_type)
      );
    END LOOP;
    UPDATE public.plan_reviews SET status='superseded',
      reason='Superseded by reviewed version '||v_next_number,
      reviewer_id=v_uid,reviewed_at=v_now WHERE id=v_review;
    INSERT INTO public.plan_reviews(
      incident_version_id,reviewer_id,status,adjustments,reason,created_at,reviewed_at
    ) VALUES(v_new_version,v_uid,'approved',p_adjustments,trim(p_reason),v_now,v_now)
      RETURNING id INTO v_review;
    UPDATE public.incidents SET current_version_id=v_new_version WHERE id=v_incident_id;
    v_reviewed_version := v_new_version;
  ELSE
    UPDATE public.plan_reviews SET status=p_decision,reason=trim(p_reason),
      adjustments=p_adjustments,reviewer_id=v_uid,reviewed_at=v_now WHERE id=v_review;
  END IF;
  INSERT INTO public.audit_logs(user_id,action,table_name,record_id,old_value,new_value,created_at)
  VALUES(v_uid,'REVIEW_INCIDENT_PLAN','plan_reviews',v_review,NULL,
    jsonb_build_object('incident_version_id',v_reviewed_version,'decision',p_decision,
      'reason',trim(p_reason),'adjustments',p_adjustments,
      'superseded_version_id',CASE WHEN v_new_version IS NOT NULL THEN v_old_version.id ELSE NULL END),v_now);
  RETURN v_review;
END;
$$;

REVOKE ALL ON FUNCTION public.create_incident_plan_internal(TEXT,TEXT,INTEGER,JSONB,JSONB,TIMESTAMPTZ,TIMESTAMPTZ,NUMERIC,NUMERIC)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_incident_plan_internal(UUID,TEXT,TEXT,JSONB)
  FROM PUBLIC, anon, authenticated;

-- Keep the review reason mandatory and meaningful without accepting free text.
-- Legacy reasons remain accepted so already-open preview builds still work.
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
     AND p_reason NOT IN (
       'Reviewed aggregate counts and planning assumptions.',
       'Confirmed unchanged estimates against the submitted scenario assumptions.'
     ) THEN
    RAISE EXCEPTION 'Choose a fixed aggregate-only reason for an unchanged approved plan';
  ELSIF p_decision = 'approved' AND p_adjustments <> '{}'::jsonb
     AND p_reason NOT IN (
       'Adjusted estimates after reviewing aggregate counts and planning assumptions.',
       'Updated estimates to reflect reviewed aggregate planning assumptions.'
     ) THEN
    RAISE EXCEPTION 'Choose a fixed aggregate-only reason for an adjusted approved plan';
  ELSIF p_decision = 'rejected'
     AND p_reason NOT IN (
       'Rejected aggregate scenario; counts or planning assumptions need revision.',
       'Rejected because aggregate counts need correction.',
       'Rejected because planning assumptions need revision.'
     ) THEN
    RAISE EXCEPTION 'Choose a fixed aggregate-only reason for a rejected plan';
  ELSIF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Choose approve or reject';
  END IF;

  v_review_id := public.review_incident_plan_internal(
    p_version_id, p_decision, p_reason, p_adjustments
  );
  RETURN v_review_id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_incident_plan(UUID,TEXT,TEXT,JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_incident_plan(UUID,TEXT,TEXT,JSONB) TO authenticated;

COMMIT;
