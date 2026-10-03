-- ============================================================================
-- Additive Corrective Migration: 20260818_batch1_emergency_cases_security_repair.sql
-- Batch 1 Emergency Cases Security & Policy Isolation Repair
-- 
-- Scope:
-- 1. Drops the three broad "Allow ... for authenticated users" policies if they exist.
-- 2. Drops the extra "Clinician Reviewers can view emergency cases" policy that granted broad access.
-- 3. Enforces strict least-privilege SELECT policies for emergency_cases:
--    - clinician_reviewer may SELECT cases necessary for clinical review.
--    - a patient may SELECT only a case linked to their own patient_request.
--    - hospital_approver, hospital_admin, and government_admin receive NO unrestricted emergency_cases access in Batch 1.
-- 4. Revokes EXECUTE on legacy mutation functions:
--    - create_or_get_emergency_case
--    - confirm_emergency_case_assignment
--    from PUBLIC, anon, and authenticated.
-- 5. Preserves all existing database rows without dropping tables or creating cases.
-- ============================================================================

-- 1. Ensure RLS is active on emergency_cases
ALTER TABLE public.emergency_cases ENABLE ROW LEVEL SECURITY;

-- 2. Drop broad and legacy policies if they exist
DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.emergency_cases;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.emergency_cases;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON public.emergency_cases;
DROP POLICY IF EXISTS "Clinician Reviewers can view emergency cases" ON public.emergency_cases;
DROP POLICY IF EXISTS "Clinician Reviewers can view cases" ON public.emergency_cases;
DROP POLICY IF EXISTS "Clinician Reviewers can view emergency cases for review" ON public.emergency_cases;
DROP POLICY IF EXISTS "Patients can view linked emergency cases" ON public.emergency_cases;

-- 3. Create strict least-privilege SELECT policies on emergency_cases

-- Policy 1: Clinician Reviewers may SELECT cases necessary for clinical review
CREATE POLICY "Clinician Reviewers can view emergency cases for review"
  ON public.emergency_cases
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.role = 'clinician_reviewer'
    )
  );

-- Policy 2: Patients may SELECT ONLY emergency cases linked to their own patient_request
CREATE POLICY "Patients can view linked emergency cases"
  ON public.emergency_cases
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.patient_requests pr
      WHERE pr.request_id = emergency_cases.request_id
        AND pr.patient_id = auth.uid()
    )
  );

-- 4. Revoke EXECUTE privileges on legacy mutation procedures to enforce Batch 1 safety boundaries
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'create_or_get_emergency_case'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.create_or_get_emergency_case(UUID, UUID, UUID, UUID, VARCHAR, UUID) FROM PUBLIC, anon, authenticated;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'confirm_emergency_case_assignment'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.confirm_emergency_case_assignment(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
