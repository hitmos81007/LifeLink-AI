-- Aggregate-only mass-incident planning with immutable versions and human review.
-- These records support synthetic preparedness scenarios, never dispatch or care.
CREATE TABLE IF NOT EXISTS public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 3 AND 120),
  location_label text NOT NULL DEFAULT 'Synthetic district A' CHECK (location_label IN ('Synthetic district A','Synthetic district B','Synthetic district C')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','cancelled')),
  latitude numeric(9,6),
  longitude numeric(9,6),
  expected_arrival_start timestamptz,
  expected_arrival_end timestamptz,
  current_version_id uuid,
  created_by uuid NOT NULL REFERENCES public.users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR
         (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)),
  CHECK (expected_arrival_start IS NULL OR expected_arrival_end IS NULL OR expected_arrival_start <= expected_arrival_end)
);

CREATE TABLE IF NOT EXISTS public.incident_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  total_affected integer NOT NULL CHECK (total_affected >= 0),
  severity_counts jsonb NOT NULL,
  assumptions jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES public.users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  supersedes_version_id uuid REFERENCES public.incident_versions(id),
  UNIQUE (incident_id, version_number),
  CHECK (jsonb_typeof(severity_counts) = 'object'),
  CHECK (jsonb_typeof(assumptions) = 'object')
);
ALTER TABLE public.incidents DROP CONSTRAINT IF EXISTS incidents_current_version_fk;
ALTER TABLE public.incidents ADD CONSTRAINT incidents_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES public.incident_versions(id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS public.incident_resource_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_version_id uuid NOT NULL REFERENCES public.incident_versions(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('icu_beds','general_beds','oxygen_units','ambulances','blood_preparedness')),
  estimated_min numeric(12,2) NOT NULL CHECK (estimated_min >= 0),
  estimated_expected numeric(12,2) NOT NULL CHECK (estimated_expected >= estimated_min),
  estimated_max numeric(12,2) NOT NULL CHECK (estimated_max >= estimated_expected),
  available_at_calculation numeric(12,2),
  gap numeric(12,2),
  capacity_snapshot_at timestamptz,
  method_version text NOT NULL,
  assumption_details jsonb NOT NULL,
  UNIQUE (incident_version_id, resource_type)
);

CREATE TABLE IF NOT EXISTS public.plan_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_version_id uuid NOT NULL REFERENCES public.incident_versions(id) ON DELETE CASCADE,
  reviewer_id uuid REFERENCES public.users(user_id),
  status text NOT NULL CHECK (status IN ('pending','approved','rejected','superseded')),
  adjustments jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  UNIQUE (incident_version_id),
  CHECK ((status='pending' AND reviewer_id IS NULL AND reviewed_at IS NULL) OR (status IN ('approved','rejected','superseded') AND reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL))
);

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_resource_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS incident_planning_read ON public.incidents;
CREATE POLICY incident_planning_read ON public.incidents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_id=auth.uid() AND u.role::text IN ('government_admin','clinician_reviewer')));
DROP POLICY IF EXISTS incident_versions_read ON public.incident_versions;
CREATE POLICY incident_versions_read ON public.incident_versions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_id=auth.uid() AND u.role::text IN ('government_admin','clinician_reviewer')));
DROP POLICY IF EXISTS incident_plans_read ON public.incident_resource_plans;
CREATE POLICY incident_plans_read ON public.incident_resource_plans FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_id=auth.uid() AND u.role::text IN ('government_admin','clinician_reviewer')));
DROP POLICY IF EXISTS incident_reviews_read ON public.plan_reviews;
CREATE POLICY incident_reviews_read ON public.plan_reviews FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_id=auth.uid() AND u.role::text IN ('government_admin','clinician_reviewer')));
REVOKE ALL ON public.incidents, public.incident_versions, public.incident_resource_plans, public.plan_reviews FROM anon, authenticated;
GRANT SELECT ON public.incidents, public.incident_versions, public.incident_resource_plans, public.plan_reviews TO authenticated;

CREATE OR REPLACE FUNCTION public.create_incident_plan(
  p_label text, p_location_label text, p_total_affected integer, p_severity_counts jsonb, p_ratios jsonb,
  p_expected_arrival_start timestamptz, p_expected_arrival_end timestamptz,
  p_latitude numeric DEFAULT NULL, p_longitude numeric DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_incident uuid; v_version uuid; v_total integer;
  v_red integer; v_yellow integer; v_green integer; v_black integer;
  v_rules jsonb := '{"method_version":"mci-ratio-v1","rules":{"icu_beds":{"per_red":1,"range_pct":20},"general_beds":{"per_yellow":1,"per_green":0.25,"range_pct":20},"oxygen_units":{"per_red":2,"per_yellow":1,"range_pct":25},"ambulances":{"per_red":0.5,"per_yellow":0.2,"range_pct":25},"blood_preparedness":{"units_per_red_min":1,"units_per_red_max":2,"range_pct":0}}}'::jsonb;
  v_specs jsonb; v_icu numeric; v_general_y numeric; v_general_g numeric;
  v_oxygen_r numeric; v_oxygen_y numeric; v_ambulance_r numeric; v_ambulance_y numeric;
  v_blood_min numeric; v_blood_max numeric;
  x record;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE user_id=v_uid AND role::text='government_admin') THEN
    RAISE EXCEPTION 'Only an authenticated district coordinator may create preparedness plans';
  END IF;
  IF jsonb_typeof(p_severity_counts) <> 'object' OR
     (p_severity_counts - ARRAY['red','yellow','green','black']::text[]) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Severity counts must contain only red, yellow, green, and black aggregate counts';
  END IF;
  IF (p_severity_counts->>'red') !~ '^\d+$' OR (p_severity_counts->>'yellow') !~ '^\d+$' OR
     (p_severity_counts->>'green') !~ '^\d+$' OR (p_severity_counts->>'black') !~ '^\d+$' THEN
    RAISE EXCEPTION 'All four severity counts are required and must be non-negative integers';
  END IF;
  v_red := (p_severity_counts->>'red')::integer; v_yellow := (p_severity_counts->>'yellow')::integer;
  v_green := (p_severity_counts->>'green')::integer; v_black := (p_severity_counts->>'black')::integer;
  v_total := v_red+v_yellow+v_green+v_black;
  IF v_total <= 0 OR v_total > 10000 OR p_total_affected <> v_total THEN RAISE EXCEPTION 'Affected total must equal severity counts (1 to 10000)'; END IF;
  IF length(trim(p_label)) NOT BETWEEN 3 AND 120 THEN RAISE EXCEPTION 'Scenario label must be 3 to 120 characters'; END IF;
  IF p_label ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' OR regexp_replace(p_label,'[^0-9]','','g') ~ '[0-9]{10,}' THEN
    RAISE EXCEPTION 'Scenario label must not contain email addresses or phone numbers';
  END IF;
  IF p_expected_arrival_start IS NULL OR p_expected_arrival_end IS NULL OR p_expected_arrival_start > p_expected_arrival_end THEN
    RAISE EXCEPTION 'Provide a valid expected arrival time window';
  END IF;
  IF p_ratios IS NULL OR jsonb_typeof(p_ratios) <> 'object' OR
     (p_ratios - ARRAY['icu_per_red','general_per_yellow','general_per_green','oxygen_per_red','oxygen_per_yellow','ambulances_per_red','ambulances_per_yellow','blood_min_per_red','blood_max_per_red']::text[]) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Planning ratios must use the supported configuration fields';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each_text(p_ratios) e WHERE e.value !~ '^\d+(\.\d{1,2})?$' OR e.value::numeric > 20) OR
     (p_ratios - ARRAY['icu_per_red','general_per_yellow','general_per_green','oxygen_per_red','oxygen_per_yellow','ambulances_per_red','ambulances_per_yellow','blood_min_per_red','blood_max_per_red']::text[]) <> '{}'::jsonb OR
     (SELECT count(*) FROM jsonb_object_keys(p_ratios)) <> 9 THEN RAISE EXCEPTION 'Provide all 9 valid ratios between 0 and 20'; END IF;
  v_icu := (p_ratios->>'icu_per_red')::numeric; v_general_y := (p_ratios->>'general_per_yellow')::numeric;
  v_general_g := (p_ratios->>'general_per_green')::numeric; v_oxygen_r := (p_ratios->>'oxygen_per_red')::numeric;
  v_oxygen_y := (p_ratios->>'oxygen_per_yellow')::numeric; v_ambulance_r := (p_ratios->>'ambulances_per_red')::numeric;
  v_ambulance_y := (p_ratios->>'ambulances_per_yellow')::numeric; v_blood_min := (p_ratios->>'blood_min_per_red')::numeric;
  v_blood_max := (p_ratios->>'blood_max_per_red')::numeric;
  IF v_blood_min > v_blood_max THEN RAISE EXCEPTION 'Blood preparedness maximum must be at least its minimum'; END IF;
  v_rules := jsonb_build_object('method_version','mci-ratio-v1','ratios',p_ratios,'range_policy','±20% for beds, ±25% for oxygen and ambulances; blood uses configured low/high');
  IF p_location_label NOT IN ('Synthetic district A','Synthetic district B','Synthetic district C') THEN RAISE EXCEPTION 'Choose a synthetic district'; END IF;
  IF (p_latitude IS NULL) <> (p_longitude IS NULL) OR (p_latitude IS NOT NULL AND (p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180)) THEN
    RAISE EXCEPTION 'Provide a valid coordinate pair or leave both blank';
  END IF;
  INSERT INTO incidents(label,location_label,latitude,longitude,expected_arrival_start,expected_arrival_end,created_by)
  VALUES(trim(p_label),p_location_label,p_latitude,p_longitude,p_expected_arrival_start,p_expected_arrival_end,v_uid) RETURNING id INTO v_incident;
  INSERT INTO incident_versions(incident_id,version_number,total_affected,severity_counts,assumptions,created_by)
  VALUES(v_incident,1,v_total,p_severity_counts,v_rules,v_uid) RETURNING id INTO v_version;
  UPDATE incidents SET current_version_id=v_version WHERE id=v_incident;
  v_specs := jsonb_build_array(
    jsonb_build_object('type','icu_beds','expected',ceil(v_red*v_icu),'low',floor(v_red*v_icu*0.8),'high',ceil(v_red*v_icu*1.2),'formula',v_icu||' ICU beds per red-tagged person'),
    jsonb_build_object('type','general_beds','expected',ceil(v_yellow*v_general_y+v_green*v_general_g),'low',floor((v_yellow*v_general_y+v_green*v_general_g)*0.8),'high',ceil((v_yellow*v_general_y+v_green*v_general_g)*1.2),'formula',v_general_y||' per yellow + '||v_general_g||' per green'),
    jsonb_build_object('type','oxygen_units','expected',ceil(v_red*v_oxygen_r+v_yellow*v_oxygen_y),'low',floor((v_red*v_oxygen_r+v_yellow*v_oxygen_y)*0.75),'high',ceil((v_red*v_oxygen_r+v_yellow*v_oxygen_y)*1.25),'formula',v_oxygen_r||' per red + '||v_oxygen_y||' per yellow'),
    jsonb_build_object('type','ambulances','expected',ceil(v_red*v_ambulance_r+v_yellow*v_ambulance_y),'low',floor((v_red*v_ambulance_r+v_yellow*v_ambulance_y)*0.75),'high',ceil((v_red*v_ambulance_r+v_yellow*v_ambulance_y)*1.25),'formula',v_ambulance_r||' per red + '||v_ambulance_y||' per yellow'),
    jsonb_build_object('type','blood_preparedness','expected',ceil(v_red*(v_blood_min+v_blood_max)/2),'low',floor(v_red*v_blood_min),'high',ceil(v_red*v_blood_max),'formula','preparedness range '||v_blood_min||'–'||v_blood_max||' units per red; not a clinical order')
  );
  FOR x IN SELECT value FROM jsonb_array_elements(v_specs) LOOP
    INSERT INTO incident_resource_plans(incident_version_id,resource_type,estimated_min,estimated_expected,estimated_max,method_version,assumption_details)
    VALUES(v_version,x.value->>'type',(x.value->>'low')::numeric,(x.value->>'expected')::numeric,(x.value->>'high')::numeric,'mci-ratio-v1',jsonb_build_object('formula',x.value->>'formula','uncertainty','Illustrative planning range; configurable rules; not a clinical recommendation'));
  END LOOP;
  INSERT INTO plan_reviews(incident_version_id,status) VALUES(v_version,'pending');
  INSERT INTO public.audit_logs(user_id,action,table_name,record_id,old_value,new_value,created_at)
  VALUES(v_uid,'CREATE_SYNTHETIC_INCIDENT_PLAN','incidents',v_incident,NULL,
    jsonb_build_object('incident_version_id',v_version,'total_affected',v_total,'severity_counts',p_severity_counts,'method_version','mci-ratio-v1'),now());
  RETURN v_incident;
END; $$;

CREATE OR REPLACE FUNCTION public.review_incident_plan(p_version_id uuid,p_decision text,p_reason text,p_adjustments jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid(); v_review uuid;
  v_old_version public.incident_versions%ROWTYPE; v_new_version uuid;
  v_next_number integer; v_incident_id uuid; v_expected numeric; v_adjustment_count integer; v_reviewed_version uuid:=p_version_id;
  v_plan record; v_now timestamptz:=now();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE user_id=v_uid AND role::text='clinician_reviewer') THEN RAISE EXCEPTION 'Only a clinician reviewer may review this plan'; END IF;
  IF p_decision NOT IN ('approved','rejected') OR length(trim(coalesce(p_reason,''))) < 8 THEN RAISE EXCEPTION 'Choose approve/reject and provide a review reason (at least 8 characters)'; END IF;
  IF p_adjustments IS NULL OR jsonb_typeof(p_adjustments) <> 'object' THEN RAISE EXCEPTION 'Adjustments must be a JSON object'; END IF;
  IF p_reason ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' OR regexp_replace(p_reason,'[^0-9]','','g') ~ '[0-9]{10,}' THEN RAISE EXCEPTION 'Review reason must not contain email addresses or phone numbers'; END IF;
  IF p_decision='rejected' AND p_adjustments <> '{}'::jsonb THEN RAISE EXCEPTION 'Rejected plans cannot include estimate adjustments'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each_text(p_adjustments) e WHERE e.key NOT IN ('icu_beds','general_beds','oxygen_units','ambulances','blood_preparedness') OR e.value !~ '^\d+(\.\d{1,2})?$' OR e.value::numeric > 1000000) THEN
    RAISE EXCEPTION 'Adjustments must be non-negative numeric expected values for known resources';
  END IF;
  SELECT * INTO v_old_version FROM incident_versions WHERE id=p_version_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM incidents WHERE id=v_old_version.incident_id AND current_version_id=p_version_id) THEN RAISE EXCEPTION 'Only the current incident version may be reviewed'; END IF;
  SELECT id INTO v_review FROM plan_reviews WHERE incident_version_id=p_version_id AND status='pending' FOR UPDATE;
  IF v_review IS NULL THEN RAISE EXCEPTION 'This plan is no longer pending review'; END IF;
  v_incident_id:=v_old_version.incident_id;
  v_adjustment_count:=(SELECT count(*) FROM jsonb_object_keys(p_adjustments));
  IF p_decision='approved' AND v_adjustment_count > 0 THEN
    SELECT coalesce(max(version_number),0)+1 INTO v_next_number FROM incident_versions WHERE incident_id=v_incident_id;
    INSERT INTO incident_versions(incident_id,version_number,total_affected,severity_counts,assumptions,created_by,supersedes_version_id)
    VALUES(v_incident_id,v_next_number,v_old_version.total_affected,v_old_version.severity_counts,
      v_old_version.assumptions||jsonb_build_object('review_adjustments',p_adjustments),v_uid,p_version_id)
    RETURNING id INTO v_new_version;
    FOR v_plan IN SELECT * FROM incident_resource_plans WHERE incident_version_id=p_version_id LOOP
      v_expected:=coalesce((p_adjustments->>v_plan.resource_type)::numeric,v_plan.estimated_expected);
      INSERT INTO incident_resource_plans(incident_version_id,resource_type,estimated_min,estimated_expected,estimated_max,
        available_at_calculation,gap,capacity_snapshot_at,method_version,assumption_details)
      VALUES(v_new_version,v_plan.resource_type,least(v_plan.estimated_min,v_expected),v_expected,greatest(v_plan.estimated_max,v_expected),
        v_plan.available_at_calculation,v_plan.gap,v_plan.capacity_snapshot_at,v_plan.method_version,
        v_plan.assumption_details||jsonb_build_object('review_adjusted',p_adjustments ? v_plan.resource_type));
    END LOOP;
    UPDATE plan_reviews SET status='superseded',reason='Superseded by reviewed version '||v_next_number,reviewer_id=v_uid,reviewed_at=v_now
      WHERE id=v_review;
    INSERT INTO plan_reviews(incident_version_id,reviewer_id,status,adjustments,reason,created_at,reviewed_at)
    VALUES(v_new_version,v_uid,'approved',p_adjustments,trim(p_reason),v_now,v_now) RETURNING id INTO v_review;
    UPDATE incidents SET current_version_id=v_new_version WHERE id=v_incident_id;
    v_reviewed_version:=v_new_version;
  ELSE
    UPDATE plan_reviews SET status=p_decision,reason=trim(p_reason),adjustments=p_adjustments,reviewer_id=v_uid,reviewed_at=v_now
      WHERE id=v_review;
  END IF;
  INSERT INTO public.audit_logs(user_id,action,table_name,record_id,old_value,new_value,created_at)
  VALUES(v_uid,'REVIEW_INCIDENT_PLAN','plan_reviews',v_review,NULL,
    jsonb_build_object('incident_version_id',v_reviewed_version,'decision',p_decision,'reason',trim(p_reason),'adjustments',p_adjustments,'superseded_version_id',CASE WHEN v_new_version IS NOT NULL THEN v_old_version.id ELSE NULL END),v_now);
  RETURN v_review;
END; $$;

REVOKE ALL ON FUNCTION public.create_incident_plan(text,text,integer,jsonb,jsonb,timestamptz,timestamptz,numeric,numeric) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.review_incident_plan(uuid,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_incident_plan(text,text,integer,jsonb,jsonb,timestamptz,timestamptz,numeric,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_incident_plan(uuid,text,text,jsonb) TO authenticated;
