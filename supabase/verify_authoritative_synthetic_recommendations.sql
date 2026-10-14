-- Run after 20261008250000_authoritative_synthetic_recommendation_scoring.sql.
-- Read-only catalog/grant verification; does not create rows or change data.
DO $$
DECLARE
  v_generate regprocedure := to_regprocedure('public.generate_synthetic_recommendations(uuid)');
  v_legacy regprocedure := to_regprocedure('public.save_synthetic_recommendations(uuid,jsonb)');
  v_generate_def TEXT;
  v_legacy_def TEXT;
BEGIN
  IF v_generate IS NULL OR v_legacy IS NULL THEN
    RAISE EXCEPTION 'Authoritative synthetic recommendation RPCs are missing';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_generate)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_legacy) THEN
    RAISE EXCEPTION 'Recommendation RPCs must run with trusted database privileges';
  END IF;
  IF NOT has_function_privilege('authenticated',v_generate,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_legacy,'EXECUTE')
     OR has_function_privilege('anon',v_generate,'EXECUTE')
     OR has_function_privilege('anon',v_legacy,'EXECUTE') THEN
    RAISE EXCEPTION 'Recommendation RPC grants are incomplete or anonymous execution is allowed';
  END IF;
  IF has_table_privilege('authenticated','public.ai_recommendations','INSERT')
     OR has_table_privilege('authenticated','public.ai_recommendations','UPDATE')
     OR has_table_privilege('authenticated','public.ai_recommendations','DELETE')
     OR has_table_privilege('anon','public.ai_recommendations','INSERT')
     OR has_table_privilege('anon','public.ai_recommendations','UPDATE')
     OR has_table_privilege('anon','public.ai_recommendations','DELETE') THEN
    RAISE EXCEPTION 'Clients can mutate recommendations outside the authoritative RPC';
  END IF;
  IF NOT has_column_privilege('authenticated','public.ai_recommendations','recommendation_id','SELECT')
     OR NOT has_column_privilege('authenticated','public.ai_recommendations','evidence_snapshot','SELECT')
     OR NOT has_column_privilege('authenticated','public.ai_recommendations','score_factors','SELECT') THEN
    RAISE EXCEPTION 'Authenticated recommendation evidence is not readable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='ai_recommendations' AND column_name='method_version')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='ai_recommendations' AND column_name='config_version') THEN
    RAISE EXCEPTION 'Recommendation method/config version columns are missing';
  END IF;

  SELECT pg_get_functiondef(v_generate) INTO v_generate_def;
  SELECT pg_get_functiondef(v_legacy) INTO v_legacy_def;
  IF position('clinician_reviewer' IN v_generate_def)=0
     OR position('data_origin' IN v_generate_def)=0
     OR position('synthetic' IN v_generate_def)=0
     OR position('Patient-reported severity does not affect ranking' IN v_generate_def)=0
     OR position('no_reservation_or_dispatch' IN v_generate_def)=0
     OR v_generate_def !~* 'distance_km IS NULL[[:space:]]+THEN 25'
     OR position('ORDER BY candidate.distance_km NULLS LAST' IN v_generate_def)=0
     OR position('generate_synthetic_recommendations' IN v_legacy_def)=0
     OR position('p_recommendations' IN substring(v_legacy_def FROM position('BEGIN' IN v_legacy_def)))>0 THEN
    RAISE EXCEPTION 'Recommendation role, synthetic scope, safety boundary, or legacy-input isolation is missing';
  END IF;
  RAISE NOTICE 'Authoritative synthetic recommendation grants, stored evidence, and safety checks passed.';
END;
$$;
