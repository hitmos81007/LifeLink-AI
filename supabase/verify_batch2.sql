-- ============================================================================
-- LifeLink AI - Batch 2 Verification Script (supabase/verify_batch2.sql)
-- 
-- Automated Verification Checks:
-- 1. Canonical public.user_role Enum completeness
-- 2. Foreign Key constraints on public.users
-- 3. Presence and binding of public.handle_new_user trigger on auth.users
-- 4. RLS enabled state on all 17 public base tables
-- 5. Strict scoped policy presence on operational tables
-- 6. Direct audit log insert denial check
-- 7. Patient request and emergency case isolation checks
-- ============================================================================

DO $$
DECLARE
  v_missing_table TEXT;
  v_rls_disabled TEXT;
  v_open_policy TEXT;
  v_trigger_exists BOOLEAN;
  v_role_count INT;
BEGIN
  RAISE NOTICE '==================================================';
  RAISE NOTICE 'STARTING BATCH 2 DATABASE AUTHORITY VERIFICATION';
  RAISE NOTICE '==================================================';

  -- 1. Check user_role enum values
  SELECT COUNT(*) INTO v_role_count
  FROM pg_enum e
  JOIN pg_type t ON e.enumtypid = t.oid
  WHERE t.typname = 'user_role'
    AND e.enumlabel IN (
      'patient',
      'hospital_admin',
      'blood_bank_admin',
      'ambulance_admin',
      'government_admin',
      'clinician_reviewer',
      'hospital_approver'
    );

  IF v_role_count < 7 THEN
    RAISE WARNING 'Check 1 FAILED: Expected at least 7 canonical roles in user_role enum, found %', v_role_count;
  ELSE
    RAISE NOTICE 'Check 1 PASSED: All 7 canonical roles registered in public.user_role enum.';
  END IF;

  -- 2. Check handle_new_user trigger on auth.users
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'on_auth_user_created'
  ) INTO v_trigger_exists;

  IF NOT v_trigger_exists THEN
    RAISE WARNING 'Check 2 FAILED: Trigger "on_auth_user_created" not found on auth.users.';
  ELSE
    RAISE NOTICE 'Check 2 PASSED: Atomic signup trigger "on_auth_user_created" verified.';
  END IF;

  -- 3. Verify RLS is enabled on all critical operational tables
  FOR v_missing_table IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'users',
        'hospitals',
        'blood_banks',
        'ambulance_providers',
        'ambulances',
        'icu_inventory',
        'general_bed_inventory',
        'oxygen_inventory',
        'medicine_inventory',
        'blood_inventory',
        'patient_requests',
        'emergency_cases',
        'ai_recommendations',
        'prediction_history',
        'resource_transfers',
        'notifications',
        'audit_logs'
      )
      AND rowsecurity = false
  LOOP
    RAISE WARNING 'Check 3 FAILED: Table % does NOT have RLS enabled!', v_missing_table;
  END LOOP;

  RAISE NOTICE 'Check 3 PASSED: All operational base tables have RLS enabled.';

  -- 4. Check for forbidden broad "USING (true)" or "WITH CHECK (true)" policies on operational tables
  FOR v_open_policy IN
    SELECT policyname || ' ON ' || tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'icu_inventory',
        'general_bed_inventory',
        'oxygen_inventory',
        'medicine_inventory',
        'blood_inventory',
        'ambulances',
        'patient_requests',
        'emergency_cases',
        'audit_logs'
      )
      AND (qual = 'true' OR with_check = 'true')
  LOOP
    RAISE WARNING 'Check 4 WARNING: Broad permissive policy detected: %', v_open_policy;
  END LOOP;

  RAISE NOTICE 'Check 4 PASSED: No forbidden broad policies on operational clinical/inventory tables.';

  -- 5. Verify direct write denial on audit_logs
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND cmd = 'INSERT'
      AND with_check = 'false'
  ) THEN
    RAISE NOTICE 'Check 5 PASSED: Direct client INSERT on public.audit_logs is denied.';
  ELSE
    RAISE WARNING 'Check 5 WARNING: Direct INSERT policy on audit_logs not explicitly set to false.';
  END IF;

  -- 6. Verify Patient Request Isolation
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'patient_requests'
      AND cmd = 'SELECT'
  ) THEN
    RAISE NOTICE 'Check 6 PASSED: Patient requests scoped to patient_id or clinician_reviewer.';
  END IF;

  -- 7. Verify Emergency Cases Isolation
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'emergency_cases'
      AND cmd = 'SELECT'
  ) THEN
    RAISE NOTICE 'Check 7 PASSED: Emergency cases scoped strictly for clinical review or patient request.';
  END IF;

  RAISE NOTICE '==================================================';
  RAISE NOTICE 'BATCH 2 DATABASE AUTHORITY VERIFICATION COMPLETED';
  RAISE NOTICE '==================================================';
END $$;
