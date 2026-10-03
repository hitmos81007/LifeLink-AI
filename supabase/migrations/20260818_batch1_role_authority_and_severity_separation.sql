-- ============================================================================
-- Batch 1: Role Authority & Clinical Urgency Separation Migration
-- 
-- Scope:
-- GAP-01: Role model formalization (clinician_reviewer, hospital_approver)
-- GAP-02: Clinician Reviewer authority fields
-- GAP-03: Hospital Approver authority boundary
-- GAP-05: Patient self-service vs emergency-case pseudonymous model
-- GAP-12: Separation of patient-reported severity from clinician-confirmed urgency
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PostgreSQL Enum Extension for public.user_role
-- NOTE: In PostgreSQL, ALTER TYPE ... ADD VALUE statements must be committed
-- before the new enum values can be referenced in data manipulation statements.
-- ----------------------------------------------------------------------------
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'clinician_reviewer';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'hospital_approver';

-- ----------------------------------------------------------------------------
-- 2. Patient Requests: Separate Self-Reported Severity (GAP-05, GAP-12)
-- ----------------------------------------------------------------------------
ALTER TABLE public.patient_requests 
  ADD COLUMN IF NOT EXISTS reported_severity VARCHAR(20) DEFAULT 'Medium';

-- Backfill reported_severity with existing severity if empty
UPDATE public.patient_requests 
  SET reported_severity = severity 
  WHERE reported_severity IS NULL AND severity IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. Emergency Cases: Add Clinical Verification Fields (GAP-02, GAP-12)
-- ----------------------------------------------------------------------------
ALTER TABLE public.emergency_cases 
  ADD COLUMN IF NOT EXISTS clinician_confirmed_urgency VARCHAR(30),
  ADD COLUMN IF NOT EXISTS confirmation_status VARCHAR(40) DEFAULT 'unconfirmed',
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Field constraints to enforce database integrity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_patient_requests_reported_severity'
  ) THEN
    ALTER TABLE public.patient_requests
      ADD CONSTRAINT chk_patient_requests_reported_severity
      CHECK (reported_severity IN ('Critical', 'High', 'Medium', 'Low'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_emergency_cases_confirmation_status'
  ) THEN
    ALTER TABLE public.emergency_cases
      ADD CONSTRAINT chk_emergency_cases_confirmation_status
      CHECK (confirmation_status IN ('unconfirmed', 'confirmed', 'rejected'));
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Government Aggregate Case Count Function (Restricted RPC)
-- Returns macro-level aggregate count without exposing unrestricted row data
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_government_emergency_case_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.emergency_cases
  WHERE confirmation_status = 'confirmed';
  
  RETURN COALESCE(v_count, 0);
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Row-Level Security (RLS) Rules for Batch 1 Authority Model
-- ----------------------------------------------------------------------------
ALTER TABLE public.patient_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_cases ENABLE ROW LEVEL SECURITY;

-- Patients can select their own submitted requests
DROP POLICY IF EXISTS "Patients can view their own requests" ON public.patient_requests;
CREATE POLICY "Patients can view their own requests"
  ON public.patient_requests
  FOR SELECT
  TO authenticated
  USING (
    patient_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.role IN ('clinician_reviewer', 'hospital_admin', 'government_admin')
    )
  );

-- Clinician Reviewers may view emergency cases for clinical review
DROP POLICY IF EXISTS "Clinician Reviewers can view emergency cases" ON public.emergency_cases;
DROP POLICY IF EXISTS "Clinician Reviewers can view emergency cases for review" ON public.emergency_cases;
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

-- Patients can view emergency cases linked strictly to their own request
DROP POLICY IF EXISTS "Patients can view linked emergency cases" ON public.emergency_cases;
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

-- ----------------------------------------------------------------------------
-- 6. Safety and Audit Documentation
-- ----------------------------------------------------------------------------
COMMENT ON COLUMN public.patient_requests.reported_severity IS 
  'Self-reported situational severity from emergency requester. Never treated as authoritative clinical urgency.';

COMMENT ON COLUMN public.emergency_cases.clinician_confirmed_urgency IS 
  'Clinically verified urgency validated exclusively by an authorized Clinician Reviewer.';

COMMENT ON COLUMN public.emergency_cases.confirmation_status IS 
  'Triage confirmation lifecycle: unconfirmed, confirmed, rejected.';
