-- Run after 20261008220000_authoritative_workflow_notifications.sql.
-- Read-only catalog and grant verification; creates no rows and changes no data.
DO $$
DECLARE
  v_queue regprocedure := to_regprocedure('public.enqueue_workflow_notifications_internal(uuid[],text,text,uuid,text,text,text,text)');
  v_request regprocedure := to_regprocedure('public.create_synthetic_patient_request(text,text,boolean,boolean,boolean,boolean,boolean,text)');
  v_transfer_request regprocedure := to_regprocedure('public.request_resource_transfer(uuid,text,text,integer,text,uuid,jsonb)');
  v_transfer_step regprocedure := to_regprocedure('public.transition_resource_transfer(uuid,text,integer,text)');
  v_blood regprocedure := to_regprocedure('public.notify_low_blood_stock(text,integer,integer)');
  v_name text;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.notifications'::regclass) THEN
    RAISE EXCEPTION 'Notifications RLS must be enabled';
  END IF;
  IF has_table_privilege('anon','public.notifications','SELECT') OR
     has_table_privilege('anon','public.notifications','INSERT') OR
     has_table_privilege('anon','public.notifications','UPDATE') OR
     has_table_privilege('anon','public.notifications','DELETE') OR
     has_table_privilege('authenticated','public.notifications','INSERT') OR
     has_table_privilege('authenticated','public.notifications','DELETE') OR
     has_table_privilege('authenticated','public.notifications','UPDATE') OR
     has_column_privilege('authenticated','public.notifications','title','UPDATE') OR
     has_column_privilege('authenticated','public.notifications','receiver_id','UPDATE') OR
     NOT has_column_privilege('authenticated','public.notifications','is_read','UPDATE') THEN
    RAISE EXCEPTION 'Notification direct-write privileges are too broad or mark-read is unavailable';
  END IF;
  IF NOT has_column_privilege('authenticated','public.notifications','entity_type','SELECT') OR
     NOT has_column_privilege('authenticated','public.notifications','entity_id','SELECT') OR
     NOT has_column_privilege('authenticated','public.notifications','dedupe_key','SELECT') THEN
    RAISE EXCEPTION 'Notification entity or deduplication columns are missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications'
    AND cmd='SELECT' AND 'authenticated'=ANY(roles) AND qual ILIKE '%receiver_id%' AND qual ILIKE '%auth.uid%') OR
     NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications'
    AND cmd='UPDATE' AND 'authenticated'=ANY(roles) AND qual ILIKE '%receiver_id%' AND qual ILIKE '%auth.uid%') THEN
    RAISE EXCEPTION 'Receiver-only notification read/update policies are missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='notifications' AND indexname='notifications_dedupe_key_uidx') THEN
    RAISE EXCEPTION 'Workflow notification deduplication index is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.notifications'::regclass AND conname='notifications_entity_reference_check') THEN
    RAISE EXCEPTION 'Notification entity reference constraint is missing';
  END IF;

  IF v_queue IS NULL OR v_request IS NULL OR v_transfer_request IS NULL OR v_transfer_step IS NULL THEN
    RAISE EXCEPTION 'A trusted notification workflow function is missing';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_queue) OR
     has_function_privilege('authenticated',v_queue,'EXECUTE') OR has_function_privilege('anon',v_queue,'EXECUTE') THEN
    RAISE EXCEPTION 'Notification enqueue helper must remain private SECURITY DEFINER';
  END IF;
  IF NOT has_function_privilege('authenticated',v_request,'EXECUTE') OR has_function_privilege('anon',v_request,'EXECUTE') OR
     NOT has_function_privilege('authenticated',v_transfer_request,'EXECUTE') OR has_function_privilege('anon',v_transfer_request,'EXECUTE') OR
     NOT has_function_privilege('authenticated',v_transfer_step,'EXECUTE') OR has_function_privilege('anon',v_transfer_step,'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated event RPC grants are incomplete or anonymous execution is allowed';
  END IF;
  IF v_blood IS NOT NULL AND has_function_privilege('authenticated',v_blood,'EXECUTE') THEN
    RAISE EXCEPTION 'Client execution of the legacy low-blood notification RPC must be disabled';
  END IF;
  IF position('clinician_reviewer' IN pg_get_functiondef(v_request))=0 OR
     position('resource_transfer_requested' IN pg_get_functiondef(v_transfer_request))=0 OR
     position('enqueue_workflow_notifications_internal' IN pg_get_functiondef(v_transfer_step))=0 THEN
    RAISE EXCEPTION 'Expected role-targeted notification event paths are missing';
  END IF;

  FOREACH v_name IN ARRAY ARRAY[
    'notify_confirmed_synthetic_case_providers',
    'notify_blood_low_stock_crossing',
    'notify_oxygen_low_stock_crossing',
    'notify_medicine_low_stock_crossing'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname=v_name AND prosecdef IS TRUE) THEN
      RAISE EXCEPTION 'Trusted notification trigger function % is missing or not SECURITY DEFINER',v_name;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='notify_confirmed_synthetic_case_providers' AND NOT tgisinternal) OR
     NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='notify_blood_low_stock_crossing' AND NOT tgisinternal) OR
     NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='notify_oxygen_low_stock_crossing' AND NOT tgisinternal) OR
     NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='notify_medicine_low_stock_crossing' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Provider assignment or blood/oxygen/medicine stock notification trigger is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime' AND NOT puballtables)
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN
    RAISE EXCEPTION 'Notifications are missing from the Supabase Realtime publication';
  END IF;
  RAISE NOTICE 'Trusted workflow notification grants, RLS, dedupe, triggers, and Realtime publication passed.';
END $$;
