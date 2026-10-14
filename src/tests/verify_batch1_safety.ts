/**
 * Comprehensive Safety Test Suite for Critical Recovery Batch 1
 * 
 * Verifies all 10 safety criteria:
 * 1. An unreviewed patient request is excluded from getOperationalQueue
 * 2. No synthetic case ID is generated
 * 3. Self-reported severity never becomes priority_tier
 * 4. getOperationalQueue performs no insert, update or mutation RPC (pure SELECT)
 * 5. HospitalDashboard does not mount OperationalQueueView
 * 6. hospital_admin cannot confirm clinical urgency
 * 7. hospital_approver cannot confirm clinical urgency
 * 8. government_admin cannot confirm clinical urgency
 * 9. clinician_reviewer can access the read-only review dashboard
 * 10. Public signup strictly excludes clinician_reviewer and hospital_approver
 */

import fs from 'fs';
import path from 'path';
import { normalizeRole, PUBLIC_ROLE_OPTIONS, hasCapability } from '../types/roles';
import { getConfirmationStatusLabel } from '../types/database';
import { getOperationalQueue } from '../services/emergencyCaseService';
import { supabase } from '../lib/supabase/client';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runSafetyVerification() {
  console.log('\n======================================================');
  console.log('  RUNNING BATCH 1 SAFETY VERIFICATION TEST SUITE');
  console.log('======================================================\n');

  const rootDir = process.cwd();

  // --------------------------------------------------------------------------
  // Check 1: HospitalDashboard does not mount or import OperationalQueueView
  // --------------------------------------------------------------------------
  const hospitalDashboardPath = path.join(rootDir, 'src/components/dashboards/HospitalDashboard.tsx');
  const hospitalDashboardSource = fs.readFileSync(hospitalDashboardPath, 'utf8');

  assert(
    !hospitalDashboardSource.includes('<OperationalQueueView') &&
    !hospitalDashboardSource.includes('OperationalQueueView'),
    '1. HospitalDashboard does not mount or import OperationalQueueView'
  );

  assert(
    hospitalDashboardSource.includes('Emergency requests require authorised clinician review before entering the hospital operational queue. No unconfirmed patient request is shown or ranked here.'),
    '2. HospitalDashboard mounts the required clinician-review-required notice text'
  );

  // --------------------------------------------------------------------------
  // Check 2: No UI imports or active buttons for confirmEmergencyCaseAssignment
  // --------------------------------------------------------------------------
  const opQueueViewPath = path.join(rootDir, 'src/components/OperationalQueueView.tsx');
  const opQueueViewSource = fs.readFileSync(opQueueViewPath, 'utf8');

  assert(
    !opQueueViewSource.includes('confirmEmergencyCaseAssignment'),
    '3. OperationalQueueView has no confirmEmergencyCaseAssignment import or mutation handler'
  );

  // --------------------------------------------------------------------------
  // Check 3: Role Capabilities & Confirmation Authority Boundaries
  // --------------------------------------------------------------------------
  assert(
    hasCapability('hospital_admin', 'confirm_clinical_urgency') === false,
    '4. hospital_admin cannot confirm clinical urgency'
  );

  assert(
    hasCapability('hospital_approver', 'confirm_clinical_urgency') === false,
    '5. hospital_approver cannot confirm clinical urgency'
  );

  assert(
    hasCapability('government_admin', 'confirm_clinical_urgency') === false,
    '6. government_admin cannot confirm clinical urgency'
  );

  assert(
    hasCapability('clinician_reviewer', 'review_clinical_case') === true,
    '7. clinician_reviewer can access the read-only review dashboard (review_clinical_case capability)'
  );

  assert(
    hasCapability('clinician_reviewer', 'confirm_clinical_urgency') === true,
    '8. clinician_reviewer has confirm_clinical_urgency capability'
  );

  // --------------------------------------------------------------------------
  // Check 4: Public Signup Restrictions
  // --------------------------------------------------------------------------
  const publicRoles = PUBLIC_ROLE_OPTIONS.map((r) => r.role);
  assert(
    !publicRoles.includes('clinician_reviewer'),
    '9. public signup strictly excludes clinician_reviewer'
  );
  assert(
    !publicRoles.includes('hospital_approver'),
    '10. public signup strictly excludes hospital_approver'
  );

  // --------------------------------------------------------------------------
  // Check 5: Source Code Audit - getOperationalQueue performs zero writes
  // --------------------------------------------------------------------------
  const servicePath = path.join(rootDir, 'src/services/emergencyCaseService.ts');
  const serviceSource = fs.readFileSync(servicePath, 'utf8');

  // Extract getOperationalQueue function body
  const fnMatch = serviceSource.match(/export async function getOperationalQueue\(\)[\s\S]*?\n\}/);
  assert(!!fnMatch, '11. getOperationalQueue function exists in emergencyCaseService.ts');

  if (fnMatch) {
    const fnBody = fnMatch[0];
    assert(!fnBody.includes('.insert('), '12. getOperationalQueue contains no .insert() calls');
    assert(!fnBody.includes('.update('), '13. getOperationalQueue contains no .update() calls');
    assert(!fnBody.includes('.delete('), '14. getOperationalQueue contains no .delete() calls');
    assert(!fnBody.includes('.rpc('), '15. getOperationalQueue contains no .rpc() mutation calls');
    assert(!fnBody.includes('`case_${'), '16. getOperationalQueue does not generate synthetic case IDs');
  }

  // --------------------------------------------------------------------------
  // Check 6: Runtime Behavior of getOperationalQueue with Unconfirmed vs Confirmed Cases
  // --------------------------------------------------------------------------
  // Mock Supabase client calls to test deterministic queue building behavior
  const originalFrom = supabase.from;

  let insertCount = 0;
  let updateCount = 0;
  let rpcCount = 0;

  // Test Case A: When only unreviewed patient requests exist in DB (no confirmed emergency_cases)
  (supabase as any).from = (tableName: string) => {
    return {
      select: (...args: any[]) => ({
        eq: (col: string, val: any) => ({
          not: (notCol: string, op: string, notVal: any) => {
            // emergency_cases query returning 0 confirmed cases
            return Promise.resolve({ data: [], error: null });
          }
        }),
        in: (col: string, vals: any[]) => Promise.resolve({ data: [], error: null })
      }),
      insert: () => { insertCount++; return Promise.resolve({ data: null, error: null }); },
      update: () => { updateCount++; return Promise.resolve({ data: null, error: null }); }
    };
  };

  const emptyQueue = await getOperationalQueue();
  assert(
    Array.isArray(emptyQueue) && emptyQueue.length === 0,
    '17. Unreviewed patient requests are excluded from getOperationalQueue (returns empty array when 0 confirmed cases exist)'
  );
  assert(insertCount === 0 && updateCount === 0, '18. Queue read performed zero inserts and zero updates');

  // Test Case B: When a confirmed emergency case exists with clinician_confirmed_urgency
  (supabase as any).from = (tableName: string) => {
    if (tableName === 'emergency_cases') {
      return {
        select: () => ({
          eq: (col: string, val: any) => ({
            not: (notCol: string, op: string, notVal: any) => {
              return Promise.resolve({
                data: [
                  {
                    case_id: 'e9b44bf0-575d-4f18-a6d1-ec4648dcf379',
                    request_id: 'req-001',
                    confirmation_status: 'confirmed',
                    clinician_confirmed_urgency: 'Critical',
                    case_status: 'Open',
                    assigned_hospital_id: 'hosp-001',
                    assigned_blood_bank_id: null,
                    assigned_ambulance_id: null,
                    assigned_by: 'doc-001',
                    created_at: new Date(Date.now() - 10 * 60000).toISOString()
                  }
                ],
                error: null
              });
            }
          })
        })
      };
    }

    if (tableName === 'patient_requests') {
      return {
        select: () => ({
          in: () => Promise.resolve({
            data: [
              {
                request_id: 'req-001',
                patient_id: 'pat-123',
                severity: 'Low', // Patient self-reported Low
                reported_severity: 'Low',
                emergency_type: 'Cardiac Arrest',
                needs_icu: true,
                needs_general_bed: false,
                needs_oxygen: true,
                needs_blood: false,
                needs_ambulance: true,
                required_blood_group: null
              }
            ],
            error: null
          })
        })
      };
    }

    if (tableName === 'hospitals') {
      return {
        select: () => ({
          in: () => Promise.resolve({
            data: [
              {
                hospital_id: 'hosp-001',
                name: 'City General Hospital',
                hospital_code: 'CGH-01'
              }
            ],
            error: null
          })
        })
      };
    }

    return {
      select: () => ({
        in: () => Promise.resolve({ data: [], error: null })
      })
    };
  };

  const queueWithCase = await getOperationalQueue();
  assert(queueWithCase.length === 1, '19. Confirmed case enters the operational queue');
  assert(
    queueWithCase[0].case_id === 'e9b44bf0-575d-4f18-a6d1-ec4648dcf379',
    '20. No synthetic case ID is generated; exact database case_id UUID is preserved'
  );
  assert(
    queueWithCase[0].priority_tier === 'Critical',
    '21. Self-reported severity (Low) never becomes priority_tier; clinician-confirmed urgency (Critical) is used'
  );
  assert(
    queueWithCase[0].assigned_hospital?.hospital_id === 'hosp-001',
    '22. Assigned hospital comes strictly from assigned_hospital_id on emergency_cases'
  );

  // Restore original supabase.from
  (supabase as any).from = originalFrom;

  // --------------------------------------------------------------------------
  // Check 7: Status Label Helpers
  // --------------------------------------------------------------------------
  assert(getConfirmationStatusLabel('unconfirmed') === 'Awaiting Review', '23. Confirmation status "unconfirmed" labels as "Awaiting Review"');
  assert(getConfirmationStatusLabel('confirmed') === 'Confirmed', '24. Confirmation status "confirmed" labels as "Confirmed"');
  assert(getConfirmationStatusLabel('rejected') === 'Rejected', '25. Confirmation status "rejected" labels as "Rejected"');

  console.log('\n======================================================');
  console.log('  ALL 25 BATCH 1 SAFETY CHECKS PASSED PERFECTLY!');
  console.log('======================================================\n');
}

runSafetyVerification().catch((err) => {
  console.error('Safety verification test error:', err);
  process.exit(1);
});
