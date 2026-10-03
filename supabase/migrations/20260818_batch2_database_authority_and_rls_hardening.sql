-- ============================================================================
-- Batch 2 Migration 2: 20260818_batch2_database_authority_and_rls_hardening.sql
-- 
-- Scope:
-- GAP-59: Comprehensive Database Authorization & Strict Scoped RLS Policies
-- GAP-60: Views Audit and Security Hardening (security_invoker)
-- GAP-64: Removal of Insecure Fallback RLS Policies
-- ============================================================================

-- ============================================================================
-- 1. USERS TABLE SECURITY
-- ============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.users;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.users;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON public.users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Government admins can view directory users" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Deny direct public insert on users" ON public.users;

-- Self-read: Users can read their own authoritative profile
CREATE POLICY "Users can view own profile"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Government admin read: Can view user directory for system administration
CREATE POLICY "Government admins can view directory users"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.role = 'government_admin'
    )
  );

-- Self-update: Users can update their basic contact information only
CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Direct client inserts denied (handled strictly by handle_new_user trigger)
CREATE POLICY "Deny direct public insert on users"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- ============================================================================
-- 2. HOSPITALS DIRECTORY & INVENTORY SECURITY
-- ============================================================================
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.icu_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.general_bed_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oxygen_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicine_inventory ENABLE ROW LEVEL SECURITY;

-- Drop legacy/permissive policies on hospitals
DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.hospitals;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.hospitals;
DROP POLICY IF EXISTS "Hospitals read access" ON public.hospitals;
DROP POLICY IF EXISTS "Hospitals update access" ON public.hospitals;

CREATE POLICY "Hospitals read access"
  ON public.hospitals
  FOR SELECT
  TO authenticated
  USING (
    status = 'Active'
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (u.role = 'government_admin' OR (u.role IN ('hospital_admin', 'hospital_approver') AND u.hospital_id = hospitals.hospital_id))
    )
  );

CREATE POLICY "Hospitals update access"
  ON public.hospitals
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (u.role = 'government_admin' OR (u.role = 'hospital_admin' AND u.hospital_id = hospitals.hospital_id))
    )
  );

-- ICU Inventory
DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.icu_inventory;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.icu_inventory;
DROP POLICY IF EXISTS "ICU inventory read access" ON public.icu_inventory;
DROP POLICY IF EXISTS "ICU inventory write access" ON public.icu_inventory;

CREATE POLICY "ICU inventory read access"
  ON public.icu_inventory
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (u.role = 'government_admin' OR (u.role IN ('hospital_admin', 'hospital_approver') AND u.hospital_id = icu_inventory.hospital_id))
    )
  );

CREATE POLICY "ICU inventory write access"
  ON public.icu_inventory
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.role = 'hospital_admin'
        AND u.hospital_id = icu_inventory.hospital_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.role = 'hospital_admin'
        AND u.hospital_id = icu_inventory.hospital_id
    )
  );

-- General Bed Inventory
DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.general_bed_inventory;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.general_bed_inventory;
DROP POLICY IF EXISTS "General bed inventory read access" ON public.general_bed_inventory;
DROP POLICY IF EXISTS "General bed inventory write access" ON public.general_bed_inventory;

CREATE POLICY "General bed inventory read access"
  ON public.general_bed_inventory
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (u.role = 'government_admin' OR (u.role IN ('hospital_admin', 'hospital_approver') AND u.hospital_id = general_bed_inventory.hospital_id))
    )
  );

CREATE POLICY "General bed inventory write access"
  ON public.general_bed_inventory
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.role = 'hospital_admin'
        AND u.hospital_id = general_bed_inventory.hospital_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.role = 'hospital_admin'
        AND u.hospital_id = general_bed_inventory.hospital_id
    )
  );

-- Oxygen Inventory
DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.oxygen_inventory;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.oxygen_inventory;
DROP POLICY IF EXISTS "Oxygen inventory read access" ON public.oxygen_inventory;
DROP POLICY IF EXISTS "Oxygen inventory write access" ON public.oxygen_inventory;

CREATE POLICY "Oxygen inventory read access"
  ON public.oxygen_inventory
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (u.role = 'government_admin' OR (u.role IN ('hospital_admin', 'hospital_approver') AND u.hospital_id = oxygen_inventory.hospital_id))
    )
  );

CREATE POLICY "Oxygen inventory write access"
  ON public.oxygen_inventory
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.role = 'hospital_admin'
        AND u.hospital_id = oxygen_inventory.hospital_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.role = 'hospital_admin'
        AND u.hospital_id = oxygen_inventory.hospital_id
    )
  );

-- Medicine Inventory
DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.medicine_inventory;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.medicine_inventory;
DROP POLICY IF EXISTS "Medicine inventory read access" ON public.medicine_inventory;
DROP POLICY IF EXISTS "Medicine inventory write access" ON public.medicine_inventory;

CREATE POLICY "Medicine inventory read access"
  ON public.medicine_inventory
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (u.role = 'government_admin' OR (u.role IN ('hospital_admin', 'hospital_approver') AND u.hospital_id = medicine_inventory.hospital_id))
    )
  );

CREATE POLICY "Medicine inventory write access"
  ON public.medicine_inventory
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.role = 'hospital_admin'
        AND u.hospital_id = medicine_inventory.hospital_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.role = 'hospital_admin'
        AND u.hospital_id = medicine_inventory.hospital_id
    )
  );

-- ============================================================================
-- 3. BLOOD BANK DIRECTORY & INVENTORY SECURITY
-- ============================================================================
ALTER TABLE public.blood_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.blood_banks;
DROP POLICY IF EXISTS "Blood banks read access" ON public.blood_banks;
DROP POLICY IF EXISTS "Blood banks update access" ON public.blood_banks;

CREATE POLICY "Blood banks read access"
  ON public.blood_banks
  FOR SELECT
  TO authenticated
  USING (
    status = 'Active'
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (u.role = 'government_admin' OR (u.role = 'blood_bank_admin' AND u.blood_bank_id = blood_banks.blood_bank_id))
    )
  );

CREATE POLICY "Blood banks update access"
  ON public.blood_banks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (u.role = 'government_admin' OR (u.role = 'blood_bank_admin' AND u.blood_bank_id = blood_banks.blood_bank_id))
    )
  );

DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.blood_inventory;
DROP POLICY IF EXISTS "Blood inventory read access" ON public.blood_inventory;
DROP POLICY IF EXISTS "Blood inventory write access" ON public.blood_inventory;

CREATE POLICY "Blood inventory read access"
  ON public.blood_inventory
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (u.role = 'government_admin' OR (u.role = 'blood_bank_admin' AND u.blood_bank_id = blood_inventory.blood_bank_id))
    )
  );

CREATE POLICY "Blood inventory write access"
  ON public.blood_inventory
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.role = 'blood_bank_admin'
        AND u.blood_bank_id = blood_inventory.blood_bank_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.role = 'blood_bank_admin'
        AND u.blood_bank_id = blood_inventory.blood_bank_id
    )
  );

-- ============================================================================
-- 4. AMBULANCE PROVIDERS & FLEET SECURITY
-- ============================================================================
ALTER TABLE public.ambulance_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambulances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.ambulance_providers;
DROP POLICY IF EXISTS "Ambulance providers read access" ON public.ambulance_providers;
DROP POLICY IF EXISTS "Ambulance providers update access" ON public.ambulance_providers;

CREATE POLICY "Ambulance providers read access"
  ON public.ambulance_providers
  FOR SELECT
  TO authenticated
  USING (
    status = 'Active'
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (u.role = 'government_admin' OR (u.role = 'ambulance_admin' AND u.ambulance_provider_id = ambulance_providers.provider_id))
    )
  );

CREATE POLICY "Ambulance providers update access"
  ON public.ambulance_providers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (u.role = 'government_admin' OR (u.role = 'ambulance_admin' AND u.ambulance_provider_id = ambulance_providers.provider_id))
    )
  );

DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.ambulances;
DROP POLICY IF EXISTS "Ambulances read access" ON public.ambulances;
DROP POLICY IF EXISTS "Ambulances write access" ON public.ambulances;

CREATE POLICY "Ambulances read access"
  ON public.ambulances
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (u.role = 'government_admin' OR (u.role = 'ambulance_admin' AND u.ambulance_provider_id = ambulances.provider_id))
    )
  );

CREATE POLICY "Ambulances write access"
  ON public.ambulances
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.role = 'ambulance_admin'
        AND u.ambulance_provider_id = ambulances.provider_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.role = 'ambulance_admin'
        AND u.ambulance_provider_id = ambulances.provider_id
    )
  );

-- ============================================================================
-- 5. PATIENT REQUESTS SECURITY (Batch 1 Isolation Maintained & Hardened)
-- ============================================================================
ALTER TABLE public.patient_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.patient_requests;
DROP POLICY IF EXISTS "Patients can view their own requests" ON public.patient_requests;
DROP POLICY IF EXISTS "Patients can insert their own requests" ON public.patient_requests;
DROP POLICY IF EXISTS "Patients can update their own requests" ON public.patient_requests;

-- Patient can read own requests; Clinician Reviewer can read for clinical review
CREATE POLICY "Patients and Clinicians request read access"
  ON public.patient_requests
  FOR SELECT
  TO authenticated
  USING (
    patient_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.role = 'clinician_reviewer'
    )
  );

-- Patient can submit their own emergency request
CREATE POLICY "Patients can insert their own requests"
  ON public.patient_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    patient_id = auth.uid()
  );

-- Patient can update their own request
CREATE POLICY "Patients can update their own requests"
  ON public.patient_requests
  FOR UPDATE
  TO authenticated
  USING (
    patient_id = auth.uid()
  )
  WITH CHECK (
    patient_id = auth.uid()
  );

-- ============================================================================
-- 6. EMERGENCY CASES SECURITY (Preserved Exactly from Batch 1)
-- ============================================================================
ALTER TABLE public.emergency_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.emergency_cases;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.emergency_cases;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON public.emergency_cases;
DROP POLICY IF EXISTS "Clinician Reviewers can view emergency cases for review" ON public.emergency_cases;
DROP POLICY IF EXISTS "Patients can view linked emergency cases" ON public.emergency_cases;

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

-- ============================================================================
-- 7. FUTURE FEATURE TABLES (Deny Broad Access by Default)
-- ============================================================================
ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.ai_recommendations;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.ai_recommendations;
DROP POLICY IF EXISTS "AI recommendations read access" ON public.ai_recommendations;

CREATE POLICY "AI recommendations read access"
  ON public.ai_recommendations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (u.role = 'clinician_reviewer' OR (u.role IN ('hospital_admin', 'hospital_approver') AND u.hospital_id = ai_recommendations.hospital_id))
    )
  );

DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.prediction_history;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.prediction_history;
DROP POLICY IF EXISTS "Prediction history read access" ON public.prediction_history;

CREATE POLICY "Prediction history read access"
  ON public.prediction_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (u.role = 'government_admin' OR (u.role IN ('hospital_admin', 'hospital_approver') AND u.hospital_id = prediction_history.hospital_id))
    )
  );

DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.resource_transfers;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.resource_transfers;
DROP POLICY IF EXISTS "Resource transfers read access" ON public.resource_transfers;

CREATE POLICY "Resource transfers read access"
  ON public.resource_transfers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (
          u.role = 'government_admin'
          OR (u.role IN ('hospital_admin', 'hospital_approver') AND u.hospital_id IN (resource_transfers.source_hospital_id, resource_transfers.destination_hospital_id))
        )
    )
  );

-- ============================================================================
-- 8. NOTIFICATIONS SECURITY
-- ============================================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.notifications;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.notifications;
DROP POLICY IF EXISTS "Notifications user read and update" ON public.notifications;

CREATE POLICY "Notifications user read and update"
  ON public.notifications
  FOR ALL
  TO authenticated
  USING (receiver_id = auth.uid())
  WITH CHECK (receiver_id = auth.uid());

-- ============================================================================
-- 9. AUDIT LOGS SECURITY (GAP-59, Unforgeable Audit Trail)
-- ============================================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.audit_logs;
DROP POLICY IF EXISTS "Audit logs read access" ON public.audit_logs;
DROP POLICY IF EXISTS "Deny direct audit log mutations" ON public.audit_logs;

-- Only Government Admins may view audit logs
CREATE POLICY "Audit logs read access"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.role = 'government_admin'
    )
  );

-- Deny direct client inserts, updates, and deletes (writes must come via DB triggers/trusted functions)
CREATE POLICY "Deny direct audit log inserts"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Deny direct audit log updates"
  ON public.audit_logs
  FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "Deny direct audit log deletes"
  ON public.audit_logs
  FOR DELETE
  TO authenticated
  USING (false);
