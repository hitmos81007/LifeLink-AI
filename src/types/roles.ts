// =====================================================
// LifeLink AI - Centralized Role & Capability Authority Model
// Critical Recovery Batch 1 (GAP-01, GAP-02, GAP-03, GAP-05, GAP-12)
// =====================================================

export type AppRole =
  | 'patient'
  | 'hospital_admin'
  | 'blood_bank_admin'
  | 'ambulance_admin'
  | 'government_admin'
  | 'clinician_reviewer'
  | 'hospital_approver';

export type UserRole = AppRole; // Backward compatibility alias

export type AppCapability =
  | 'submit_patient_request'
  | 'manage_hospital_inventory'
  | 'manage_blood_inventory'
  | 'manage_ambulance_fleet'
  | 'view_district_dashboard'
  | 'review_clinical_case'
  | 'confirm_clinical_urgency'
  | 'review_hospital_approval'
  | 'approve_hospital_action'
  | 'manage_system_configuration';

/**
 * Normalizes legacy, raw, or alternate casing role strings into strict AppRole.
 * Returns null if the role is unrecognized (enforcing access denied).
 */
export function normalizeAppRole(rawRole: string | null | undefined): AppRole | null {
  if (!rawRole || typeof rawRole !== 'string') {
    return null;
  }

  const normalized = rawRole.trim().toLowerCase();

  switch (normalized) {
    case 'patient':
    case 'citizen':
    case 'usr_patient':
      return 'patient';

    case 'hospital_admin':
    case 'hospital_staff':
    case 'hospital':
      return 'hospital_admin';

    case 'blood_bank_admin':
    case 'blood_bank_mgr':
    case 'blood_bank':
      return 'blood_bank_admin';

    case 'ambulance_admin':
    case 'ambulance_dispatch':
    case 'ambulance':
      return 'ambulance_admin';

    case 'government_admin':
    case 'district_coordinator':
    case 'government':
      return 'government_admin';

    case 'clinician_reviewer':
    case 'clinician':
    case 'medical_reviewer':
      return 'clinician_reviewer';

    case 'hospital_approver':
    case 'approver':
    case 'transfer_approver':
      return 'hospital_approver';

    default:
      return null;
  }
}

/**
 * Canonical user-friendly role display labels.
 * Enforces requirement: Display user-friendly canonical role labels, not raw database enum values.
 */
export const ROLE_DISPLAY_LABELS: Record<AppRole, string> = {
  patient: 'Patient',
  hospital_admin: 'Hospital Staff',
  blood_bank_admin: 'Blood Bank Provider',
  ambulance_admin: 'Ambulance Provider',
  government_admin: 'District Coordinator',
  clinician_reviewer: 'Clinician Reviewer',
  hospital_approver: 'Hospital Approver'
};

export function getRoleDisplayLabel(role: AppRole | string | null | undefined): string {
  const normalized = normalizeAppRole(role);
  if (!normalized) {
    return 'Unknown Role';
  }
  return ROLE_DISPLAY_LABELS[normalized];
}

/**
 * Explicit capabilities assigned to each role.
 * Enforces strict capability separation:
 * - Patient: can submit and view only their requests
 * - Hospital Staff: can manage inventory, CANNOT approve hospital actions or confirm clinical urgency
 * - Hospital Approver: separate from Hospital Staff, handles hospital transfer/action approvals
 * - Clinician Reviewer: sole role allowed to review cases and confirm clinical urgency
 * - Government/District Coordinator: monitors district oversight, CANNOT confirm clinical urgency
 * - Blood Bank & Ambulance: inventory & fleet management, CANNOT confirm clinical urgency
 * - Gemini AI: No clinical authority
 */
export const ROLE_CAPABILITIES: Record<AppRole, readonly AppCapability[]> = {
  patient: ['submit_patient_request'],
  hospital_admin: ['manage_hospital_inventory'],
  blood_bank_admin: ['manage_blood_inventory'],
  ambulance_admin: ['manage_ambulance_fleet'],
  government_admin: ['view_district_dashboard', 'manage_system_configuration'],
  clinician_reviewer: ['review_clinical_case', 'confirm_clinical_urgency'],
  hospital_approver: ['review_hospital_approval', 'approve_hospital_action']
};

/**
 * Checks if a given role possesses the specified operational capability.
 */
export function hasCapability(role: AppRole | string | null | undefined, capability: AppCapability): boolean {
  const normalized = normalizeAppRole(role);
  if (!normalized) {
    return false;
  }
  const capabilities = ROLE_CAPABILITIES[normalized];
  return capabilities ? capabilities.includes(capability) : false;
}

/**
 * Publicly registerable role options for signup.
 * Requirement: Do not expose a public signup option that allows anyone to self-select Clinician Reviewer or Hospital Approver.
 */
export interface RoleOption {
  role: AppRole;
  label: string;
  description: string;
  icon: string;
  bg: string;
  text: string;
}

export const PUBLIC_ROLE_OPTIONS: RoleOption[] = [
  {
    role: 'patient',
    label: 'Patient',
    description: 'Emergency SOS, Hospital Bed Finder, Blood Orders & Triage Tracking',
    icon: 'HeartPulse',
    bg: 'bg-rose-50 border-rose-200 text-rose-900',
    text: 'text-rose-600'
  },
  {
    role: 'hospital_admin',
    label: 'Hospital Staff',
    description: 'ICU & Bed Capacity Telemetry, ER Operations, Oxygen & Medicine Inventory',
    icon: 'Building2',
    bg: 'bg-blue-50 border-blue-200 text-blue-900',
    text: 'text-blue-600'
  },
  {
    role: 'blood_bank_admin',
    label: 'Blood Bank Provider',
    description: 'Live Blood Group Inventory Matrix (A±, B±, AB±, O±) & Restock Management',
    icon: 'Droplets',
    bg: 'bg-red-50 border-red-200 text-red-900',
    text: 'text-red-600'
  },
  {
    role: 'ambulance_admin',
    label: 'Ambulance Provider',
    description: 'Fleet Management, Vehicle Status Updates & Dispatch Readiness',
    icon: 'Ambulance',
    bg: 'bg-amber-50 border-amber-200 text-amber-900',
    text: 'text-amber-600'
  },
  {
    role: 'government_admin',
    label: 'District Coordinator',
    description: 'District Healthcare Analytics, Inter-Facility Capacity Map & Audit Logs',
    icon: 'ShieldCheck',
    bg: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    text: 'text-emerald-600'
  }
];

export const normalizeRole = normalizeAppRole;

export const ROLE_OPTIONS = PUBLIC_ROLE_OPTIONS; // Backward compatibility
