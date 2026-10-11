// =====================================================
// LifeLink AI v1.0 - Database Version 1.0 TypeScript Definitions
// Single Source of Truth matching PostgreSQL / Supabase Schema
// =====================================================

export * from './roles';
import { AppRole, UserRole } from './roles';

// -----------------------------------------------------
// ENUMS
// -----------------------------------------------------

export type BloodGroup = 
  | 'A+' 
  | 'A-' 
  | 'B+' 
  | 'B-' 
  | 'AB+' 
  | 'AB-' 
  | 'O+' 
  | 'O-';

export type AmbulanceStatus = 
  | 'Available' 
  | 'Assigned' 
  | 'Maintenance' 
  | 'Offline';

export type SeverityLevel = 
  | 'Low' 
  | 'Medium' 
  | 'High' 
  | 'Critical';

export type RequestStatus = 
  | 'Pending' 
  | 'Recommended' 
  | 'Assigned' 
  | 'Completed';

export type EmergencyCaseStatus = 
  | 'Open' 
  | 'Assigned' 
  | 'In Progress' 
  | 'Completed' 
  | 'Cancelled';

export type TransferStatus = 
  | 'Pending' 
  | 'Approved' 
  | 'In Transit' 
  | 'Completed'
  | 'Rejected';

export type NotificationPriority = 
  | 'Low' 
  | 'Medium' 
  | 'High' 
  | 'Critical';

export type RiskAlertLevel = 'informational' | 'warning' | 'critical';
export type RiskAlertStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed';
export type RiskAlertResourceType = 'Blood' | 'Oxygen' | 'Medicine' | 'ICU Beds' | 'General Beds';

export type TransferResourceType = 
  | 'ICU Beds'
  | 'General Beds'
  | 'Oxygen'
  | 'Medicine'
  | 'Blood';

export type HospitalStatus = 
  | 'Active' 
  | 'Inactive' 
  | 'Maintenance';

export type AccountStatus = 'pending' | 'active' | 'suspended' | 'revoked';

export type HospitalType = 
  | 'Government' 
  | 'Private' 
  | 'Trust' 
  | 'Military';

export type AmbulanceType = 
  | 'BLS' 
  | 'ALS' 
  | 'ICU';

export type OxygenType = 
  | 'Medical Oxygen' 
  | 'Liquid Oxygen' 
  | 'Cylinder';

export type MedicineCategory = 
  | 'Antibiotic' 
  | 'Analgesic' 
  | 'Antipyretic' 
  | 'Emergency' 
  | 'Injection' 
  | 'IV Fluid' 
  | 'Vaccine' 
  | 'Other';

export type EmergencyType = 
  | 'Road Accident' 
  | 'Cardiac Arrest' 
  | 'Stroke' 
  | 'Trauma' 
  | 'Burn' 
  | 'Pregnancy' 
  | 'Poisoning' 
  | 'Other';

export type PredictionModel = 
  | 'LSTM' 
  | 'XGBoost' 
  | 'RandomForest' 
  | 'Prophet'
  | 'SyntheticRequestRate';


// -----------------------------------------------------
// DATABASE TABLES
// -----------------------------------------------------

export interface HospitalTable {
  hospital_id: string; // UUID Primary Key
  hospital_name: string;
  hospital_code: string; // UNIQUE
  address: string;
  district: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  hospital_type: HospitalType;
  trauma_center: boolean;
  status: HospitalStatus;
  verification_status?: AccountStatus;
  created_at: string;
  updated_at: string;
}

export interface BloodBankTable {
  blood_bank_id: string; // UUID Primary Key
  blood_bank_name: string;
  blood_bank_code: string; // UNIQUE
  address: string;
  district: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  status: HospitalStatus;
  verification_status?: AccountStatus;
  created_at: string;
  updated_at: string;
}

export interface AmbulanceProviderTable {
  provider_id: string; // UUID Primary Key
  provider_name: string;
  provider_code: string; // UNIQUE
  district: string;
  state: string;
  phone: string | null;
  email: string | null;
  status: HospitalStatus;
  verification_status?: AccountStatus;
  created_at: string;
  updated_at: string;
}

export interface UserTable {
  user_id: string; // UUID Primary Key, references auth.users(id)
  full_name: string;
  email: string; // UNIQUE
  phone: string | null;
  role: UserRole;
  hospital_id: string | null; // FK -> hospitals.hospital_id
  blood_bank_id: string | null; // FK -> blood_banks.blood_bank_id
  ambulance_provider_id: string | null; // FK -> ambulance_providers.provider_id
  status: boolean;
  account_status?: AccountStatus;
  created_at: string;
  updated_at: string;
}

export interface AmbulanceTable {
  ambulance_id: string; // UUID Primary Key
  provider_id: string; // FK -> ambulance_providers.provider_id
  vehicle_number: string; // UNIQUE
  ambulance_type: AmbulanceType;
  driver_name: string;
  driver_phone: string | null;
  current_latitude: number | null;
  current_longitude: number | null;
  status: AmbulanceStatus;
  assigned_hospital: string | null; // FK -> hospitals.hospital_id
  created_at: string;
  updated_at: string;
}

export interface BloodInventoryTable {
  inventory_id: string; // UUID Primary Key
  blood_bank_id: string; // FK -> blood_banks.blood_bank_id
  blood_group: BloodGroup;
  available_units: number;
  reserved_units: number;
  expired_units: number;
  minimum_threshold: number;
  last_restocked: string | null;
  created_at: string;
  updated_at: string;
}

export interface ICUInventoryTable {
  icu_inventory_id: string; // UUID Primary Key
  hospital_id: string; // FK -> hospitals.hospital_id
  total_icu_beds: number;
  occupied_icu_beds: number;
  reserved_icu_beds: number;
  available_icu_beds: number;
  minimum_icu_beds: number;
  created_at: string;
  updated_at: string;
}

export interface GeneralBedInventoryTable {
  bed_inventory_id: string; // UUID Primary Key
  hospital_id: string; // FK -> hospitals.hospital_id
  total_beds: number;
  occupied_beds: number;
  reserved_beds: number;
  available_beds: number;
  minimum_beds: number;
  created_at: string;
  updated_at: string;
}

export interface OxygenInventoryTable {
  oxygen_inventory_id: string; // UUID Primary Key
  hospital_id: string; // FK -> hospitals.hospital_id
  oxygen_type: OxygenType;
  total_capacity: number;
  available_capacity: number;
  reserved_capacity: number;
  minimum_threshold: number;
  unit: string;
  created_at: string;
  updated_at: string;
}

export interface MedicineInventoryTable {
  medicine_inventory_id: string; // UUID Primary Key
  hospital_id: string; // FK -> hospitals.hospital_id
  medicine_name: string;
  category: MedicineCategory;
  dosage: string;
  manufacturer: string | null;
  current_stock: number;
  reserved_stock?: number;
  minimum_stock: number;
  unit: string;
  expiry_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientRequestTable {
  request_id: string; // UUID Primary Key
  patient_id: string; // FK -> users.user_id
  emergency_type: EmergencyType;
  required_blood_group: BloodGroup | null;
  needs_blood: boolean;
  needs_icu: boolean;
  needs_general_bed: boolean;
  needs_oxygen: boolean;
  needs_ambulance: boolean;
  reported_severity?: SeverityLevel; // Patient-reported severity (GAP-12)
  severity: SeverityLevel; // Legacy backward compatibility
  latitude: number | null;
  longitude: number | null;
  status: RequestStatus;
  notes: string | null;
  data_origin?: 'synthetic' | 'unknown';
  created_at: string;
  updated_at: string;
}

export type ConfirmationStatus = 'unconfirmed' | 'confirmed' | 'rejected';

/**
 * Converts internal lowercase confirmation status values to user-facing display labels.
 * Enforces requirement: Display user-friendly labels without storing display strings in the database.
 */
export function getConfirmationStatusLabel(status: ConfirmationStatus | string | null | undefined): string {
  if (!status) return 'Awaiting Review';
  const normalized = String(status).toLowerCase().trim();
  switch (normalized) {
    case 'confirmed':
      return 'Confirmed';
    case 'rejected':
      return 'Rejected';
    case 'unconfirmed':
    case 'awaiting review':
    default:
      return 'Awaiting Review';
  }
}

export interface EmergencyCaseTable {
  case_id: string; // UUID Primary Key
  request_id: string; // FK -> patient_requests.request_id (UNIQUE)
  assigned_hospital_id: string | null; // FK -> hospitals.hospital_id
  assigned_blood_bank_id: string | null; // FK -> blood_banks.blood_bank_id
  assigned_ambulance_id: string | null; // FK -> ambulances.ambulance_id
  assigned_by: string | null; // FK -> users.user_id
  priority: SeverityLevel;
  case_status: EmergencyCaseStatus;
  ai_generated: boolean;
  // Clinician Confirmation Additive Fields (GAP-02, GAP-12)
  clinician_confirmed_urgency?: SeverityLevel | null;
  confirmed_by?: string | null; // FK -> users.user_id (Clinician Reviewer)
  confirmed_at?: string | null;
  confirmation_status?: ConfirmationStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface AIRecommendationTable {
  recommendation_id: string; // UUID Primary Key
  request_id: string; // FK -> patient_requests.request_id
  hospital_id: string; // FK -> hospitals.hospital_id
  blood_bank_id: string | null; // FK -> blood_banks.blood_bank_id
  ambulance_id: string | null; // FK -> ambulances.ambulance_id
  distance_km: number | null;
  eta_minutes: number | null;
  confidence_score: number;
  recommendation_reason: string;
  accepted: boolean;
  created_at: string;
  updated_at: string;
  method_version: string | null;
  config_version: string | null;
  score_factors: Record<string, unknown> | null;
  evidence_snapshot: Record<string, unknown> | null;
}

export interface PredictionHistoryTable {
  prediction_id: string; // UUID Primary Key
  hospital_id: string; // FK -> hospitals.hospital_id
  resource_type: TransferResourceType;
  current_quantity: number;
  predicted_demand: number;
  confidence_score: number | null;
  prediction_model: PredictionModel;
  prediction_date: string;
  created_at: string;
  updated_at: string;
  forecast_run_id: string | null;
  forecast_horizon_days: 1 | 7 | null;
  method_version: string | null;
  input_snapshot: Record<string, unknown> | null;
}

export interface ResourceTransferTable {
  transfer_id: string; // UUID Primary Key
  source_hospital_id: string; // FK -> hospitals.hospital_id
  destination_hospital_id: string; // FK -> hospitals.hospital_id
  resource_type: TransferResourceType;
  resource_name: string | null;
  quantity: number;
  approved_quantity?: number | null;
  requested_by?: string | null;
  idempotency_key?: string | null;
  source_inventory_id?: string | null;
  status: TransferStatus;
  approved_by: string | null; // FK -> users.user_id
  remarks: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface NotificationTable {
  notification_id: string; // UUID Primary Key
  receiver_id: string; // FK -> users.user_id
  title: string;
  message: string;
  priority: NotificationPriority;
  is_read: boolean;
  entity_type?: 'patient_request' | 'emergency_case' | 'resource_transfer' | 'blood_inventory' | 'oxygen_inventory' | 'medicine_inventory' | null;
  entity_id?: string | null;
  dedupe_key?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RiskAlertTable {
  alert_id: string;
  hospital_id: string | null;
  blood_bank_id: string | null;
  facility_name: string;
  resource_type: RiskAlertResourceType;
  resource_id: string;
  resource_name: string;
  risk_level: RiskAlertLevel;
  reason_code: string;
  status: RiskAlertStatus;
  observed_value: number;
  threshold_value: number;
  predicted_value: number | null;
  forecast_horizon_days: 1 | 7 | null;
  reason: string;
  recommended_action: string;
  dedupe_key: string;
  first_detected_at: string;
  last_detected_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertEventTable {
  event_id: string;
  alert_id: string;
  action: 'opened' | 'refreshed' | 'acknowledged' | 'resolved' | 'dismissed' | 'auto_resolved' | 'reopened';
  actor_id: string | null;
  note: string | null;
  occurred_at: string;
}

export interface AuditLogTable {
  log_id: string; // UUID Primary Key
  user_id: string | null; // FK -> users.user_id
  action: string;
  table_name: string;
  record_id: string | null;
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}
