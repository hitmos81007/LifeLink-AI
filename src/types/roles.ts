// =====================================================
// LifeLink AI - Centralized Role & Capability Authority Model
// Critical Recovery Batch 1 (GAP-01, GAP-02, GAP-03, GAP-05, GAP-12)
// =====================================================

export type AppRole =
  | 'patient'
  | 'hospital_admin'
  | 'hospital_staff'
  | 'blood_bank_admin'
  | 'ambulance_admin'
  | 'government_admin'
  | 'platform_admin'
  | 'clinician_reviewer'
  | 'hospital_approver';

export type UserRole = AppRole; // Backward compatibility alias

export type AppCapability =
  | 'submit_patient_request'
  | 'manage_hospital_inventory'
  | 'view_hospital_operations'
  | 'manage_blood_inventory'
  | 'manage_ambulance_fleet'
  | 'view_district_dashboard'
  | 'review_clinical_case'
  | 'confirm_clinical_urgency'
  | 'review_hospital_approval'
  | 'approve_hospital_action'
  | 'manage_system_configuration'
  | 'review_provider_account'
  | 'manage_demo_account_roles';

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
    case 'hospital':
      return 'hospital_admin';
    case 'hospital_staff':
      return 'hospital_staff';

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

    case 'platform_admin':
      return 'platform_admin';

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
  hospital_admin: 'Hospital Administrator',
  hospital_staff: 'Hospital Team Member',
  blood_bank_admin: 'Blood Bank Provider',
  ambulance_admin: 'Ambulance Provider',
  government_admin: 'District Coordinator',
  platform_admin: 'Platform Administrator',
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
  hospital_staff: ['view_hospital_operations'],
  blood_bank_admin: ['manage_blood_inventory'],
  ambulance_admin: ['manage_ambulance_fleet'],
  government_admin: ['view_district_dashboard'],
  platform_admin: ['manage_system_configuration', 'review_provider_account', 'manage_demo_account_roles'],
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
    description: 'Synthetic emergency scenarios, facility recommendations, and clinician-review status',
    icon: 'HeartPulse',
    bg: 'bg-rose-50 border-rose-200 text-rose-900',
    text: 'text-rose-600'
  },
  {
    role: 'hospital_admin',
    label: 'Hospital Administrator',
    description: 'Facility operations, staff, beds, and inventory management',
    icon: 'Building2',
    bg: 'bg-blue-50 border-blue-200 text-blue-900',
    text: 'text-blue-600'
  },
  {
    role: 'hospital_staff',
    label: 'Hospital Team Member',
    description: 'Join using a hospital invitation to view shifts and record supply usage',
    icon: 'Stethoscope',
    bg: 'bg-cyan-50 border-cyan-200 text-cyan-900',
    text: 'text-cyan-600'
  },
  {
    role: 'blood_bank_admin',
    label: 'Blood Bank Provider',
    description: 'Synthetic blood inventory records and authorized stock updates',
    icon: 'Droplets',
    bg: 'bg-red-50 border-red-200 text-red-900',
    text: 'text-red-600'
  },
  {
    role: 'ambulance_admin',
    label: 'Ambulance Provider',
    description: 'Fleet records and status management for authorized provider accounts',
    icon: 'Ambulance',
    bg: 'bg-amber-50 border-amber-200 text-amber-900',
    text: 'text-amber-600'
  },
];

export const normalizeRole = normalizeAppRole;

export const ROLE_OPTIONS = PUBLIC_ROLE_OPTIONS; // Backward compatibility
