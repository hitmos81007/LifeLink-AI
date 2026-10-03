import { UserRole } from '../types/database';

export const ROLE_OPTIONS: { role: UserRole; label: string; description: string; icon: string; bg: string; text: string }[] = [
  {
    role: 'patient',
    label: 'Patient',
    description: 'Emergency SOS, Hospital Bed Finder, Blood Orders & Triage History',
    icon: 'HeartPulse',
    bg: 'bg-rose-50 border-rose-200 text-rose-900',
    text: 'text-rose-600'
  },
  {
    role: 'hospital_admin',
    label: 'Hospital',
    description: 'ICU Capacity Telemetry, ER Triage Queue, Blood Requests & Incoming Ambulances',
    icon: 'Building2',
    bg: 'bg-blue-50 border-blue-200 text-blue-900',
    text: 'text-blue-600'
  },
  {
    role: 'blood_bank_admin',
    label: 'Blood Bank',
    description: 'Live Inventory Matrix (A±, B±, AB±, O±), Urgent Orders & Donor Logs',
    icon: 'Droplets',
    bg: 'bg-red-50 border-red-200 text-red-900',
    text: 'text-red-600'
  },
  {
    role: 'ambulance_admin',
    label: 'Ambulance',
    description: 'Active Dispatches, Patient Vitals Telemetry & Green Corridor Signal Override',
    icon: 'Ambulance',
    bg: 'bg-amber-50 border-amber-200 text-amber-900',
    text: 'text-amber-600'
  },
  {
    role: 'government_admin',
    label: 'Government',
    description: 'Regional Outbreak Analytics, Emergency Resource Map & Inter-Agency Policy',
    icon: 'ShieldCheck',
    bg: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    text: 'text-emerald-600'
  }
];
