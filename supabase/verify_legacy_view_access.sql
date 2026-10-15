-- Read-only verifier for 20261009106000_harden_legacy_views.sql.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relkind IN ('v','m')
      AND c.relname IN (
        'ai_recommendation_view','ambulance_dashboard_view','blood_availability_view',
        'blood_bank_dashboard_view','emergency_monitoring_view','government_dashboard_view',
        'hospital_dashboard_view','hospital_resource_summary_view','medicine_inventory_view',
        'notification_view','oxygen_inventory_view','prediction_dashboard_view',
        'resource_transfer_view','mv_blood_dashboard','mv_hospital_dashboard'
      )
      AND (
        has_table_privilege('anon',format('public.%I',c.relname),'SELECT')
        OR has_table_privilege('authenticated',format('public.%I',c.relname),'SELECT')
      )
  ) THEN
    RAISE EXCEPTION 'A legacy dashboard view still grants SELECT to an application role';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relkind='v'
      AND c.relname IN (
        'ai_recommendation_view','ambulance_dashboard_view','blood_availability_view',
        'blood_bank_dashboard_view','emergency_monitoring_view','government_dashboard_view',
        'hospital_dashboard_view','hospital_resource_summary_view','medicine_inventory_view',
        'notification_view','oxygen_inventory_view','prediction_dashboard_view','resource_transfer_view'
      )
      AND NOT COALESCE(c.reloptions @> ARRAY['security_invoker=true'],false)
  ) THEN
    RAISE EXCEPTION 'A legacy view does not use invoker permissions';
  END IF;

  RAISE NOTICE 'PASS: legacy views are not selectable by anon/authenticated and standard views use invoker permissions';
END;
$$;

SELECT c.relname AS object_name,
       CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' END AS object_type,
       c.reloptions,
       has_table_privilege('anon',format('public.%I',c.relname),'SELECT') AS anon_select,
       has_table_privilege('authenticated',format('public.%I',c.relname),'SELECT') AS authenticated_select
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relkind IN ('v','m')
  AND c.relname IN (
    'ai_recommendation_view','ambulance_dashboard_view','blood_availability_view',
    'blood_bank_dashboard_view','emergency_monitoring_view','government_dashboard_view',
    'hospital_dashboard_view','hospital_resource_summary_view','medicine_inventory_view',
    'notification_view','oxygen_inventory_view','prediction_dashboard_view',
    'resource_transfer_view','mv_blood_dashboard','mv_hospital_dashboard'
  )
ORDER BY c.relname;
