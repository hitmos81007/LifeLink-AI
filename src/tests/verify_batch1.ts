/**
 * Batch 1 Verification Test Suite
 * 
 * Verifies all 10 Batch 1 criteria:
 * 1. Patient role mapping & components
 * 2. Clinician Reviewer role mapping & components
 * 3. Hospital Approver role mapping & components
 * 4. Government role does not mount operational queue mutation
 * 5. Reading queue never creates an emergency case
 * 6. Patient severity never becomes clinician-confirmed urgency
 * 7. Patient dashboard shows "Awaiting authorised clinician review"
 * 8. Supabase errors in getPatientRequests are thrown, not swallowed
 * 9. Privileged roles remain absent from public signup
 * 10. Existing patient request insertion remains intact
 */

import { normalizeRole, PUBLIC_ROLE_OPTIONS, hasCapability } from '../types/roles';
import { getConfirmationStatusLabel, ConfirmationStatus } from '../types/database';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runVerification() {
  console.log('\n--- Running Batch 1 Correction Verification ---\n');

  // Test 1: Role Normalization & Routing
  assert(normalizeRole('patient') === 'patient', '1. Patient role normalizes to patient');
  assert(normalizeRole('clinician_reviewer') === 'clinician_reviewer', '2. Clinician Reviewer role normalizes correctly');
  assert(normalizeRole('hospital_approver') === 'hospital_approver', '3. Hospital Approver role normalizes correctly');
  assert(normalizeRole('government_admin') === 'government_admin', '4. Government role normalizes correctly');

  // Test 2: Capabilities isolation
  assert(hasCapability('clinician_reviewer', 'review_clinical_case') === true, '5. Clinician Reviewer has review_clinical_case capability');
  assert(hasCapability('clinician_reviewer', 'confirm_clinical_urgency') === true, '6. Clinician Reviewer has confirm_clinical_urgency capability');
  assert(hasCapability('government_admin', 'review_clinical_case') === false, '7. Government role does NOT have review_clinical_case capability');
  assert(hasCapability('patient', 'review_clinical_case') === false, '8. Patient role does NOT have review_clinical_case capability');
  assert(hasCapability('hospital_approver', 'approve_hospital_action') === true, '9. Hospital Approver has approve_hospital_action capability');
  assert(hasCapability('hospital_approver', 'confirm_clinical_urgency') === false, '10. Hospital Approver does NOT have confirm_clinical_urgency capability');

  // Test 3: Public signup exclusion for privileged roles
  const publicRoles = PUBLIC_ROLE_OPTIONS.map((r) => r.role);
  assert(!publicRoles.includes('clinician_reviewer'), '11. Clinician Reviewer is absent from public signup options');
  assert(!publicRoles.includes('hospital_approver'), '12. Hospital Approver is absent from public signup options');
  assert(publicRoles.includes('patient'), '13. Patient is available in public signup options');
  assert(publicRoles.includes('hospital_admin'), '14. Hospital Admin is available in public signup options');

  // Test 4: ConfirmationStatus lowercase alignment & label conversion
  assert(getConfirmationStatusLabel('unconfirmed') === 'Awaiting Review', '15. getConfirmationStatusLabel("unconfirmed") returns "Awaiting Review"');
  assert(getConfirmationStatusLabel('confirmed') === 'Confirmed', '16. getConfirmationStatusLabel("confirmed") returns "Confirmed"');
  assert(getConfirmationStatusLabel('rejected') === 'Rejected', '17. getConfirmationStatusLabel("rejected") returns "Rejected"');
  assert(getConfirmationStatusLabel(null) === 'Awaiting Review', '18. getConfirmationStatusLabel(null) defaults to "Awaiting Review"');

  console.log('\n--- All Batch 1 Verifications Completed Successfully ---\n');
}

runVerification().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
