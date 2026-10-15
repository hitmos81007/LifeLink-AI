-- ============================================================================
-- [DEPRECATED & NEUTRALIZED] Emergency Case & Operational Priority Queue Migration
-- 
-- DEPRECATION NOTICE:
-- The broad RLS policies ("Allow ... for authenticated users") and unauthenticated
-- SECURITY DEFINER mutation functions in this legacy migration have been neutralized
-- for Critical Recovery Batch 1 safety requirements.
--
-- Authoritative schema and RLS policies are managed in:
-- - 20260818_batch1_role_authority_and_severity_separation.sql
-- - 20260818_batch1_emergency_cases_security_repair.sql
-- ============================================================================

-- 1. Create or verify table schema for emergency_cases
CREATE TABLE IF NOT EXISTS public.emergency_cases (
  case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES public.patient_requests(request_id) ON DELETE CASCADE,
  assigned_hospital_id UUID REFERENCES public.hospitals(hospital_id) ON DELETE SET NULL,
  assigned_blood_bank_id UUID REFERENCES public.blood_banks(blood_bank_id) ON DELETE SET NULL,
  assigned_ambulance_id UUID REFERENCES public.ambulances(ambulance_id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
  priority VARCHAR(30) NOT NULL DEFAULT 'Medium',
  case_status VARCHAR(30) NOT NULL DEFAULT 'Open',
  ai_generated BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Ensure UNIQUE constraint on request_id for one case per request_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'emergency_cases_request_id_key'
  ) THEN
    ALTER TABLE public.emergency_cases ADD CONSTRAINT emergency_cases_request_id_key UNIQUE (request_id);
  END IF;
END $$;

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.emergency_cases ENABLE ROW LEVEL SECURITY;

-- Drop legacy open policies if they exist
DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.emergency_cases;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.emergency_cases;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON public.emergency_cases;

-- Safe Restricted RLS Policies:
-- Clinician Reviewers can view cases for review
DROP POLICY IF EXISTS "Clinician Reviewers can view emergency cases for review" ON public.emergency_cases;
CREATE POLICY "Clinician Reviewers can view emergency cases for review"
  ON public.emergency_cases FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.role = 'clinician_reviewer'
    )
  );

-- Patients can view emergency cases linked to their own request
DROP POLICY IF EXISTS "Patients can view linked emergency cases" ON public.emergency_cases;
CREATE POLICY "Patients can view linked emergency cases"
  ON public.emergency_cases FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.patient_requests pr
      WHERE pr.request_id = emergency_cases.request_id
        AND pr.patient_id = auth.uid()
    )
  );

-- 3. Legacy Mutation Stored Procedures - Revoked in Batch 1
-- (Functions are disabled from execution by non-superusers in Batch 1)
REVOKE EXECUTE ON FUNCTION public.create_or_get_emergency_case(UUID, UUID, UUID, UUID, VARCHAR, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_emergency_case_assignment(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
