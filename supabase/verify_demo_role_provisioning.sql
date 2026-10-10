-- Read-only static checks for restricted demo-role provisioning. Run after migration.
DO $$
DECLARE v_options TEXT; v_provision TEXT;
BEGIN
  IF has_function_privilege('anon','public.get_demo_role_provisioning_options()','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous users must not execute role provisioning option RPC';
  END IF;
  IF NOT has_function_privilege('authenticated','public.get_demo_role_provisioning_options()','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated users must reach the admin-guarded options RPC';
  END IF;
  IF has_function_privilege('anon','public.provision_demo_account_role(uuid,text,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous users must not provision roles';
  END IF;
  IF NOT has_function_privilege('authenticated','public.provision_demo_account_role(uuid,text,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated callers must reach the platform-admin-guarded assignment RPC';
  END IF;

  SELECT pg_get_functiondef('public.get_demo_role_provisioning_options()'::regprocedure) INTO v_options;
  SELECT pg_get_functiondef('public.provision_demo_account_role(uuid,text,uuid,text)'::regprocedure) INTO v_provision;
  IF v_options NOT ILIKE '%platform_admin%' OR v_options NOT ILIKE '%email_confirmed_at IS NOT NULL%' OR
     v_options NOT ILIKE '%account_status=''active''%' THEN
    RAISE EXCEPTION 'Options RPC does not enforce active platform admin and confirmed active accounts';
  END IF;
  IF v_provision NOT ILIKE '%platform_admin%' OR v_provision NOT ILIKE '%clinician_reviewer%' OR
     v_provision NOT ILIKE '%government_admin%' OR v_provision NOT ILIKE '%hospital_approver%' OR
     v_provision NOT ILIKE '%email_confirmed_at IS NOT NULL%' OR v_provision NOT ILIKE '%platform_role_provisioning_audit%' OR
     v_provision NOT ILIKE '%lifelink.provider_account_transition%' THEN
    RAISE EXCEPTION 'Assignment RPC is missing authorization, allowlist, confirmation, or audit checks';
  END IF;
  IF NOT has_table_privilege('authenticated','public.platform_role_provisioning_audit','SELECT') THEN
    RAISE EXCEPTION 'Platform-admin audit history SELECT grant is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_role_provisioning_audit'
      AND 'authenticated'=ANY(roles) AND qual ILIKE '%platform_admin%'
  ) THEN
    RAISE EXCEPTION 'Audit history is missing its platform-admin-only row policy';
  END IF;
  RAISE NOTICE 'PASS: protected roles are assigned only through the guarded, confirmed-account and audited workflow';
END $$;

SELECT policyname, roles, qual
FROM pg_policies
WHERE schemaname='public' AND tablename='platform_role_provisioning_audit'
ORDER BY policyname;
