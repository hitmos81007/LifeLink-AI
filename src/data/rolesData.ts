import { RoleDetail } from '../types/architecture';

export const USER_ROLES_DATA: RoleDetail[] = [
  {
    id: 'PATIENT',
    name: 'Patient / Citizen',
    title: 'Emergency Medical Requestor',
    icon: 'User',
    color: 'emerald',
    description: 'General public requesting immediate medical assistance, tracking assigned ambulance ETAs, and viewing personal emergency record logs.',
    customClaims: {
      role: 'PATIENT',
      patientId: 'usr_pt_9011'
    },
    permissions: [
      { resource: 'emergencies', create: true, read: true, update: false, delete: false, scope: 'Own Incidents Only' },
      { resource: 'hospitals', create: false, read: true, update: false, delete: false, scope: 'Public ER Capacity' },
      { resource: 'blood_inventories', create: false, read: true, update: false, delete: false, scope: 'Read-Only Availability' },
      { resource: 'ambulances', create: false, read: true, update: false, delete: false, scope: 'Assigned Driver Marker Only' },
      { resource: 'audit_logs', create: false, read: false, update: false, delete: false, scope: 'No Access' }
    ],
    keyUIModules: [
      '1-Tap Emergency Symptom Reporter',
      'AI Clinical Triage Summary Card',
      'Live Ambulance ETA & Map Tracking',
      'Personal Medical Profile & Blood Type Card'
    ]
  },
  {
    id: 'HOSPITAL_ADMIN',
    name: 'Hospital Admin & Chief Medical Officer',
    title: 'Hospital Operations Director',
    icon: 'Building2',
    color: 'blue',
    description: 'Manages ICU bed capacity, accepts incoming emergency triage transfers, orders blood units, and coordinates specialist readiness.',
    customClaims: {
      role: 'HOSPITAL_ADMIN',
      orgId: 'hosp_metro_gen',
      traumaLevel: 1
    },
    permissions: [
      { resource: 'emergencies', create: true, read: true, update: true, delete: false, scope: 'Assigned & Incoming Incidents' },
      { resource: 'hospitals', create: false, read: true, update: true, delete: false, scope: 'Own Hospital Doc' },
      { resource: 'blood_inventories', create: false, read: true, update: false, delete: false, scope: 'Cross-Match Request' },
      { resource: 'ambulances', create: false, read: true, update: false, delete: false, scope: 'Incoming Ambulances' },
      { resource: 'audit_logs', create: false, read: false, update: false, delete: false, scope: 'No Access' }
    ],
    keyUIModules: [
      'Live ICU & ER Bed Capacity Matrix',
      'Incoming Critical Triage Radar Alert',
      'Emergency Blood Request Drawer',
      'Trauma Specialist Roster Controller'
    ]
  },
  {
    id: 'BLOOD_BANK_MGR',
    name: 'Blood Bank Inventory Director',
    title: 'Regional Depot Manager',
    icon: 'Droplet',
    color: 'red',
    description: 'Monitors real-time blood stock counts by group, manages cold-chain storage telemetry (2-6°C), and fulfills urgent cross-match requests.',
    customClaims: {
      role: 'BLOOD_BANK_MGR',
      orgId: 'bb_central_reserve',
      depotRegion: 'SF_BAY_NORTH'
    },
    permissions: [
      { resource: 'emergencies', create: false, read: true, update: false, delete: false, scope: 'Blood Request Incidents' },
      { resource: 'hospitals', create: false, read: true, update: false, delete: false, scope: 'View Hospital Demands' },
      { resource: 'blood_inventories', create: true, read: true, update: true, delete: false, scope: 'Own Blood Depot' },
      { resource: 'ambulances', create: false, read: true, update: false, delete: false, scope: 'Transport Drones/Vehicles' },
      { resource: 'audit_logs', create: false, read: false, update: false, delete: false, scope: 'No Access' }
    ],
    keyUIModules: [
      'Blood Stock Barometer by ABO/Rh Factor',
      'IoT Cold-Chain Storage Temperature Gauge',
      'Cross-Match Dispatch Approval Terminal',
      'Expiration Warning & Donor Drive Planner'
    ]
  },
  {
    id: 'AMBULANCE_DISPATCH',
    name: 'Ambulance Driver & Paramedic Dispatcher',
    title: 'Emergency Response Controller',
    icon: 'Ambulance',
    color: 'amber',
    description: 'Receives AI dispatch routes, streams real-time vehicle GPS coordinates, updates patient vitals during transit, and requests traffic light preemption.',
    customClaims: {
      role: 'AMBULANCE_DISPATCH',
      unitId: 'amb_als_02',
      vehicleType: 'ALS'
    },
    permissions: [
      { resource: 'emergencies', create: true, read: true, update: true, delete: false, scope: 'Assigned Incident' },
      { resource: 'hospitals', create: false, read: true, update: false, delete: false, scope: 'Target Hospital ER Status' },
      { resource: 'blood_inventories', create: false, read: true, update: false, delete: false, scope: 'In-Transit Blood Box' },
      { resource: 'ambulances', create: false, read: true, update: true, delete: false, scope: 'Own Vehicle Telematics' },
      { resource: 'audit_logs', create: false, read: false, update: false, delete: false, scope: 'No Access' }
    ],
    keyUIModules: [
      'Traffic Preemption Navigation HUD',
      'Real-Time Patient Vitals Monitor Streamer',
      'One-Tap Hospital Arrival Sign-off',
      'Vehicle Equipment & Defibrillator Checklist'
    ]
  },
  {
    id: 'GOVT_AUTHORITY',
    name: 'Health Authority Inspector & Director',
    title: 'Government Health Officer',
    icon: 'ShieldCheck',
    color: 'purple',
    description: 'Monitors regional response SLAs, oversees disaster preparedness escalations, inspects cold-chain compliance, and views immutable audit logs.',
    customClaims: {
      role: 'GOVT_AUTHORITY',
      jurisdiction: 'CA_REGION_04',
      clearanceLevel: 'SECRETARY'
    },
    permissions: [
      { resource: 'emergencies', create: true, read: true, update: true, delete: true, scope: 'Full Jurisdiction Override' },
      { resource: 'hospitals', create: true, read: true, update: true, delete: false, scope: 'All Regional Hospitals' },
      { resource: 'blood_inventories', create: true, read: true, update: true, delete: false, scope: 'All Blood Depots' },
      { resource: 'ambulances', create: true, read: true, update: true, delete: false, scope: 'All Fleet Ambulances' },
      { resource: 'audit_logs', create: false, read: true, update: false, delete: false, scope: 'Full Regional Audit Log' }
    ],
    keyUIModules: [
      'Regional Emergency Operations Dashboard',
      'SLA Response Time Compliance Analytics',
      'Hospital Mass-Casualty Override Console',
      'Cryptographic Audit Log Inspector'
    ]
  }
];
