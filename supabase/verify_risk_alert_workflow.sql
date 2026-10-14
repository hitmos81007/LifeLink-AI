-- Run after 20261008330000_persist_resource_risk_alerts.sql.
-- Read-only catalog and privilege checks; no user or inventory rows are created.
DO $$
DECLARE
  v_transition regprocedure := to_regprocedure('public.transition_risk_alert(uuid,text,text)');
  v_refresh regprocedure := to_regprocedure('public.refresh_inventory_risk_alert(uuid,uuid,text,text,uuid,text,numeric,numeric)');
  v_policy_count integer;
  v_trigger_count integer;
  v_definition text;
  v_threshold_grants integer;
BEGIN
  IF to_regclass('public.risk_alerts') IS NULL OR to_regclass('public.alert_events') IS NULL THEN
    RAISE EXCEPTION 'Durable alert or event table is missing';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.risk_alerts'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.alert_events'::regclass) THEN
    RAISE EXCEPTION 'RLS must be enabled on alerts and alert history';
  END IF;
  SELECT count(*) INTO v_policy_count FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('risk_alerts','alert_events') AND cmd='SELECT';
  IF v_policy_count < 2 THEN RAISE EXCEPTION 'Scoped alert read policies are missing'; END IF;
  IF has_table_privilege('authenticated','public.risk_alerts','INSERT')
     OR has_table_privilege('authenticated','public.risk_alerts','UPDATE')
     OR has_table_privilege('authenticated','public.risk_alerts','DELETE')
     OR has_table_privilege('authenticated','public.alert_events','INSERT')
     OR has_table_privilege('authenticated','public.alert_events','UPDATE')
     OR has_table_privilege('authenticated','public.alert_events','DELETE') THEN
    RAISE EXCEPTION 'API roles must not write alert state or history directly';
  END IF;
  IF v_transition IS NULL OR v_refresh IS NULL THEN RAISE EXCEPTION 'Alert workflow functions are missing'; END IF;
  IF NOT has_function_privilege('authenticated',v_transition,'EXECUTE')
     OR has_function_privilege('anon',v_transition,'EXECUTE')
     OR has_function_privilege('authenticated',v_refresh,'EXECUTE')
     OR has_function_privilege('anon',v_refresh,'EXECUTE') THEN
    RAISE EXCEPTION 'Alert workflow function grants are too broad or incomplete';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_transition)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_refresh) THEN
    RAISE EXCEPTION 'Alert state transitions and inventory capture must run through trusted functions';
  END IF;
  SELECT count(*) INTO v_trigger_count FROM pg_trigger
    WHERE NOT tgisinternal AND tgname IN (
      'risk_alert_blood_inventory','risk_alert_oxygen_inventory','risk_alert_medicine_inventory',
      'risk_alert_icu_inventory','risk_alert_general_bed_inventory','risk_alert_synthetic_bed_forecast'
    );
  IF v_trigger_count <> 6 THEN RAISE EXCEPTION 'All five inventory and synthetic forecast alert triggers must exist'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='risk_alerts_active_dedupe_uidx') THEN
    RAISE EXCEPTION 'Active alert deduplication index is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='icu_inventory' AND column_name='minimum_icu_beds')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='general_bed_inventory' AND column_name='minimum_beds') THEN
    RAISE EXCEPTION 'Configurable bed alert thresholds are missing';
  END IF;
  SELECT count(*) INTO v_threshold_grants FROM information_schema.column_privileges
    WHERE grantee='authenticated' AND table_schema='public' AND table_name IN ('icu_inventory','general_bed_inventory')
      AND privilege_type IN ('INSERT','UPDATE')
      AND ((table_name='icu_inventory' AND column_name='minimum_icu_beds') OR (table_name='general_bed_inventory' AND column_name='minimum_beds'));
  IF v_threshold_grants < 4 THEN RAISE EXCEPTION 'Scoped bed threshold insert/update grants are missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='risk_alerts')
     OR NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='alert_events') THEN
    RAISE EXCEPTION 'Realtime alert and event publication is incomplete';
  END IF;

  v_definition := pg_get_functiondef(v_transition);
  IF position('government_admin' IN v_definition)=0
     OR position('hospital_admin' IN v_definition)=0
     OR position('hospital_approver' IN v_definition)=0
     OR position('blood_bank_admin' IN v_definition)=0
     OR position('status IS DISTINCT FROM true' IN v_definition)=0
     OR position('status NOT IN' IN v_definition)=0
     OR position('critical' IN v_definition)=0
     OR position('resolution note is required' IN v_definition)=0
     OR position('patient or contact details' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Alert transition role, state, or note-safety guards are incomplete';
  END IF;
  v_definition := pg_get_functiondef(v_refresh);
  IF position('ON CONFLICT' IN v_definition)=0
     OR position('acknowledged' IN v_definition)=0
     OR position('auto_resolved' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Inventory alert deduplication and recovery behavior are incomplete';
  END IF;
  IF to_regprocedure('public.capture_synthetic_forecast_risk_alert()') IS NULL THEN
    RAISE EXCEPTION 'Synthetic forecast alert trigger function is missing';
  END IF;
  v_definition := pg_get_functiondef('public.capture_synthetic_forecast_risk_alert()'::regprocedure);
  IF position('data_origin' IN v_definition)=0
     OR position('forecast_run_id' IN v_definition)=0
     OR position('forecast_horizon_days' IN v_definition)=0
     OR position('predicted_demand' IN v_definition)=0
     OR position('auto_resolved' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Forecast alerts must be synthetic-only, horizon-aware, and recover when pressure clears';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='risk_alert_synthetic_bed_forecast') THEN
    RAISE EXCEPTION 'Synthetic forecast alert trigger is missing';
  END IF;
  RAISE NOTICE 'Risk alert schema, RLS, deduplication, triggers, and guarded transitions are present. Exercise role and inventory cases in a disposable Supabase project.';
END $$;
