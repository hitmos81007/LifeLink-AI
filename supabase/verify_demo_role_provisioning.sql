-- Read-only checks for the synthetic-account registry and restricted role assignment.
-- Run after 20261017190000_synthetic_demo_account_registration_and_hospital_admin_provisioning.sql.
DO $$
DECLARE
  v_candidates TEXT;
  v_register TEXT;
  v_options TEXT;
  v_provision TEXT;
  v_revoke TEXT;
BEGIN
  IF has_function_privilege('anon','public.get_synthetic_demo_registration_candidates()','EXECUTE') OR
     has_function_privilege('anon','public.register_synthetic_demo_account(uuid,text,boolean)','EXECUTE') OR
     has_function_privilege('anon','public.revoke_synthetic_demo_account(uuid,text)','EXECUTE') OR
     has_function_privilege('anon','public.get_demo_role_provisioning_options()','EXECUTE') OR
     has_function_privilege('anon','public.provision_demo_account_role(uuid,text,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous users must not access synthetic account or role provisioning RPCs';
  END IF;
  IF NOT has_function_privilege('authenticated','public.get_synthetic_demo_registration_candidates()','EXECUTE') OR
     NOT has_function_privilege('authenticated','public.register_synthetic_demo_account(uuid,text,boolean)','EXECUTE') OR
     NOT has_function_privilege('authenticated','public.revoke_synthetic_demo_account(uuid,text)','EXECUTE') OR
     NOT has_function_privilege('authenticated','public.get_demo_role_provisioning_options()','EXECUTE') OR
     NOT has_function_privilege('authenticated','public.provision_demo_account_role(uuid,text,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated callers must reach platform-admin-guarded provisioning RPCs';
  END IF;
  IF has_table_privilege('authenticated','public.synthetic_demo_accounts','SELECT') OR
     has_table_privilege('authenticated','public.synthetic_demo_accounts','INSERT') OR
     has_table_privilege('authenticated','public.synthetic_demo_accounts','UPDATE') OR
     has_table_privilege('authenticated','public.synthetic_demo_accounts','DELETE') THEN
    RAISE EXCEPTION 'Synthetic account registry must not be directly accessible to authenticated users';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.synthetic_demo_accounts'::regclass AND relrowsecurity IS TRUE) THEN
    RAISE EXCEPTION 'Synthetic account registry must have RLS enabled';
  END IF;

  SELECT pg_get_functiondef('public.get_synthetic_demo_registration_candidates()'::regprocedure) INTO v_candidates;
  SELECT pg_get_functiondef('public.register_synthetic_demo_account(uuid,text,boolean)'::regprocedure) INTO v_register;
  SELECT pg_get_functiondef('public.get_demo_role_provisioning_options()'::regprocedure) INTO v_options;
  SELECT pg_get_functiondef('public.provision_demo_account_role(uuid,text,uuid,text)'::regprocedure) INTO v_provision;
  SELECT pg_get_functiondef('public.revoke_synthetic_demo_account(uuid,text)'::regprocedure) INTO v_revoke;

  IF v_candidates NOT ILIKE '%platform_admin%' OR v_candidates NOT ILIKE '%email_confirmed_at IS NOT NULL%' OR
     v_candidates NOT ILIKE '%account_status=''active''%' OR v_candidates NOT ILIKE '%synthetic_demo_accounts%' THEN
    RAISE EXCEPTION 'Candidate listing must be admin-only and exclude already registered or inactive accounts';
  END IF;
  IF v_register NOT ILIKE '%platform_admin%' OR v_register NOT ILIKE '%p_confirmed_synthetic%' OR
     v_register NOT ILIKE '%synthetic_demo_account_audit%' OR v_register NOT ILIKE '%email_confirmed_at IS NOT NULL%' THEN
    RAISE EXCEPTION 'Registration must require platform-admin review, explicit synthetic attestation, confirmed email, and audit';
  END IF;
  IF v_options NOT ILIKE '%platform_admin%' OR v_options NOT ILIKE '%synthetic_demo_accounts%' OR
     v_options NOT ILIKE '%email_confirmed_at IS NOT NULL%' OR v_options NOT ILIKE '%LL-DEMO-HOSP-%' THEN
    RAISE EXCEPTION 'Role options must be admin-only and restricted to registered synthetic accounts and demo hospitals';
  END IF;
  IF v_provision NOT ILIKE '%platform_admin%' OR v_provision NOT ILIKE '%hospital_admin%' OR
     v_provision NOT ILIKE '%hospital_approver%' OR v_provision NOT ILIKE '%synthetic_demo_accounts%' OR
     v_provision NOT ILIKE '%LL-DEMO-HOSP-%' OR v_provision NOT ILIKE '%platform_role_provisioning_audit%' OR
     v_provision NOT ILIKE '%lifelink.provider_account_transition%' THEN
    RAISE EXCEPTION 'Assignment must guard admin access, synthetic registration, demo facility scope, and audit provider role changes';
  END IF;
  IF v_revoke NOT ILIKE '%platform_admin%' OR v_revoke NOT ILIKE '%synthetic_demo_account_audit%' OR
     v_revoke NOT ILIKE '%platform_role_provisioning_audit%' OR v_revoke NOT ILIKE '%patient%' THEN
    RAISE EXCEPTION 'Synthetic account revocation must remove assigned privilege and record both audit events';
  END IF;
  IF NOT has_table_privilege('authenticated','public.synthetic_demo_account_audit','SELECT') OR
     NOT EXISTS (
       SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='synthetic_demo_account_audit'
         AND 'authenticated'=ANY(roles) AND qual ILIKE '%platform_admin%'
     ) THEN
    RAISE EXCEPTION 'Synthetic account audit must be readable only through platform-admin RLS';
  END IF;
  IF NOT has_table_privilege('authenticated','public.platform_role_provisioning_audit','SELECT') OR
     NOT EXISTS (
       SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_role_provisioning_audit'
         AND 'authenticated'=ANY(roles) AND qual ILIKE '%platform_admin%'
     ) THEN
    RAISE EXCEPTION 'Role assignment history must remain platform-admin-only';
  END IF;
  RAISE NOTICE 'PASS: synthetic accounts require explicit admin attestation; hospital roles are scoped to demo hospitals and both registries are audited.';
END $$;

SELECT policyname,roles,qual FROM pg_policies
WHERE schemaname='public' AND tablename IN ('synthetic_demo_account_audit','platform_role_provisioning_audit')
ORDER BY tablename,policyname;
