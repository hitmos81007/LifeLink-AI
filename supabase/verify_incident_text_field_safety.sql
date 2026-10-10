-- Run after 20261008190000_allowlist_incident_text_fields.sql.
DO $$
DECLARE
  v_create TEXT;
  v_review TEXT;
  v_create_body TEXT;
  v_review_body TEXT;
BEGIN
  SELECT pg_get_functiondef('public.create_incident_plan(text,text,integer,jsonb,jsonb,timestamp with time zone,timestamp with time zone,numeric,numeric)'::regprocedure)
    INTO v_create;
  SELECT pg_get_functiondef('public.review_incident_plan(uuid,text,text,jsonb)'::regprocedure)
    INTO v_review;
  IF v_create IS NULL OR v_review IS NULL THEN
    RAISE EXCEPTION 'Incident planning RPC wrappers are missing';
  END IF;

  v_create_body := substring(v_create FROM position('AS $$' IN v_create) + 5);
  v_review_body := substring(v_review FROM position('AS $$' IN v_review) + 5);
  IF position('p_label NOT IN' IN v_create_body) = 0
     OR position('Synthetic MCI preparedness exercise' IN v_create_body) = 0
     OR position('Synthetic mass-casualty drill' IN v_create_body) = 0
     OR position('Synthetic regional surge scenario' IN v_create_body) = 0 THEN
    RAISE EXCEPTION 'Incident labels are not restricted to the predefined synthetic choices';
  END IF;
  IF position('p_reason <>' IN v_review_body) = 0
     OR position('Reviewed aggregate counts and planning assumptions.' IN v_review_body) = 0
     OR position('Adjusted estimates after reviewing aggregate counts and planning assumptions.' IN v_review_body) = 0
     OR position('Rejected aggregate scenario; counts or planning assumptions need revision.' IN v_review_body) = 0 THEN
    RAISE EXCEPTION 'Incident review reasons are not restricted to the predefined synthetic choices';
  END IF;
  IF has_function_privilege('anon','public.create_incident_plan(text,text,integer,jsonb,jsonb,timestamp with time zone,timestamp with time zone,numeric,numeric)','EXECUTE')
     OR has_function_privilege('anon','public.review_incident_plan(uuid,text,text,jsonb)','EXECUTE')
     OR has_function_privilege('authenticated','public.create_incident_plan_internal(text,text,integer,jsonb,jsonb,timestamp with time zone,timestamp with time zone,numeric,numeric)','EXECUTE')
     OR has_function_privilege('authenticated','public.review_incident_plan_internal(uuid,text,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Incident RPC privileges do not preserve authenticated private-wrapper boundaries';
  END IF;
END;
$$;
