-- Retire dashboard views from the legacy prototype. These views expose raw
-- cross-organisation fields and currently bypass table RLS by running as their
-- owner. The application uses scoped tables and purpose-built RPCs instead.
DO $$
DECLARE
  v_object RECORD;
BEGIN
  FOR v_object IN
    SELECT c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relkind IN ('v','m')
      AND c.relname IN (
        'ai_recommendation_view',
        'ambulance_dashboard_view',
        'blood_availability_view',
        'blood_bank_dashboard_view',
        'emergency_monitoring_view',
        'government_dashboard_view',
        'hospital_dashboard_view',
        'hospital_resource_summary_view',
        'medicine_inventory_view',
        'notification_view',
        'oxygen_inventory_view',
        'prediction_dashboard_view',
        'resource_transfer_view',
        'mv_blood_dashboard',
        'mv_hospital_dashboard'
      )
  LOOP
    IF v_object.relkind='v' THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker=true)',v_object.relname);
    END IF;
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      v_object.relname
    );
  END LOOP;
END;
$$;
