import { FirestoreCollection } from '../types/architecture';

export const FIRESTORE_COLLECTIONS_DATA: FirestoreCollection[] = [
  {
    id: 'users',
    name: 'users',
    description: 'User accounts across all 5 roles containing custom claims, profile details, and organization mappings.',
    securityScope: 'User reads own document; Admin/Authority reads within jurisdiction.',
    fields: [
      { name: 'uid', type: 'string', required: true, description: 'Firebase Auth UID string', example: 'usr_89210' },
      { name: 'email', type: 'string', required: true, description: 'User account email', example: 'dr.smith@metrohospital.org' },
      { name: 'role', type: 'string', required: true, description: 'User role enum (PATIENT, HOSPITAL_ADMIN, BLOOD_BANK_MGR, AMBULANCE_DISPATCH, GOVT_AUTHORITY)', example: 'HOSPITAL_ADMIN' },
      { name: 'orgId', type: 'string', required: false, description: 'Affiliated hospital or blood bank ID', example: 'hosp_metro_gen' },
      { name: 'fullName', type: 'string', required: true, description: 'Display name', example: 'Dr. Evelyn Smith' },
      { name: 'phoneNumber', type: 'string', required: true, description: 'Emergency contact phone', example: '+1-555-0192' },
      { name: 'createdAt', type: 'timestamp', required: true, description: 'Registration ISO timestamp', example: '2026-07-22T08:30:00Z' },
    ],
    sampleDocument: {
      uid: "usr_89210",
      email: "dr.smith@metrohospital.org",
      role: "HOSPITAL_ADMIN",
      orgId: "hosp_metro_gen",
      fullName: "Dr. Evelyn Smith",
      phoneNumber: "+1-555-0192",
      medicalLicenseNumber: "LIC-99201-CA",
      createdAt: "2026-07-22T08:30:00Z"
    },
    indexes: [
      { fields: ['role', 'orgId'], queryType: 'ASC', purpose: 'Filter active hospital staff by organization' }
    ]
  },
  {
    id: 'emergencies',
    name: 'emergencies',
    description: 'Active and archived medical emergency dispatch cases, triage evaluations, assigned vehicles, and hospital admission status.',
    securityScope: 'Patients view self; Paramedics & Hospital Admins view assigned incidents; Govt Authority views all in jurisdiction.',
    fields: [
      { name: 'id', type: 'string', required: true, description: 'Emergency UUID key', example: 'emg_77301' },
      { name: 'patientUid', type: 'string', required: true, description: 'Patient Firebase UID', example: 'usr_patient_44' },
      { name: 'symptoms', type: 'string', required: true, description: 'Reported emergency description', example: 'Severe chest pain radiating to left arm' },
      { name: 'triageLevel', type: 'string', required: true, description: 'AI Triage Level (RED, YELLOW, GREEN, BLACK)', example: 'RED' },
      { name: 'priorityScore', type: 'number', required: true, description: 'Clinical priority score (1-100)', example: 94 },
      { name: 'assignedAmbulanceId', type: 'string', required: false, description: 'Dispatched vehicle ID', example: 'amb_als_02' },
      { name: 'assignedHospitalId', type: 'string', required: false, description: 'Target destination hospital ID', example: 'hosp_metro_gen' },
      { name: 'location', type: 'map', required: true, description: 'GeoPoint coordinates {lat, lng, geohash, address}', example: { lat: 37.7749, lng: -122.4194, address: "742 Evergreen Terr" } },
      { name: 'status', type: 'string', required: true, description: 'Status (TRIAGED, DISPATCHED, EN_ROUTE, ARRIVED, ADMITTED)', example: 'EN_ROUTE' },
    ],
    sampleDocument: {
      id: "emg_77301",
      patientUid: "usr_patient_44",
      symptoms: "Severe acute respiratory distress with hypoxia",
      triageLevel: "RED",
      priorityScore: 94,
      primaryCondition: "Acute Hypoxemic Respiratory Failure",
      recommendedAmbulanceType: "ALS",
      assignedAmbulanceId: "amb_als_02",
      assignedHospitalId: "hosp_metro_gen",
      location: {
        lat: 37.7749,
        lng: -122.4194,
        geohash: "9q9hv0",
        address: "742 Evergreen Terrace, San Francisco, CA"
      },
      status: "EN_ROUTE",
      createdAt: "2026-07-22T12:00:00Z"
    },
    indexes: [
      { fields: ['status', 'triageLevel', 'createdAt'], queryType: 'COMPOUND', purpose: 'Urgent queue sorting for dispatchers' },
      { fields: ['location.geohash', 'status'], queryType: 'GEOHASH', purpose: 'Sub-second spatial dispatch lookup' }
    ]
  },
  {
    id: 'hospitals',
    name: 'hospitals',
    description: 'Hospital infrastructure, ICU bed counts, ER room availability, trauma rating, and live divert status.',
    securityScope: 'Public read for availability; Hospital Admin update own doc; Govt Authority update divert overrides.',
    fields: [
      { name: 'id', type: 'string', required: true, description: 'Hospital unique ID', example: 'hosp_metro_gen' },
      { name: 'name', type: 'string', required: true, description: 'Facility official name', example: 'Metro General Trauma Center' },
      { name: 'traumaLevel', type: 'number', required: true, description: 'Trauma level designation (1, 2, 3)', example: 1 },
      { name: 'icuBedsAvailable', type: 'number', required: true, description: 'Current unassigned ICU beds', example: 4 },
      { name: 'erCapacityPct', type: 'number', required: true, description: 'Emergency room occupancy percentage', example: 82 },
      { name: 'status', type: 'string', required: true, description: 'Status (OPEN, DIVERT_NEAR_CAPACITY, CLOSED)', example: 'OPEN' },
      { name: 'helipadAvailable', type: 'boolean', required: true, description: 'Air ambulance helipad readiness', example: true },
    ],
    sampleDocument: {
      id: "hosp_metro_gen",
      name: "Metro General Trauma Center",
      traumaLevel: 1,
      icuBedsAvailable: 4,
      totalIcuBeds: 30,
      erCapacityPct: 82,
      status: "OPEN",
      helipadAvailable: true,
      onDutySpecialists: ["Cardiothoracic", "Neurosurgeon", "Trauma Surgeon"],
      updatedAt: "2026-07-22T12:04:12Z"
    },
    indexes: [
      { fields: ['status', 'icuBedsAvailable'], queryType: 'COMPOUND', purpose: 'Auto-allocation routing engine' }
    ]
  },
  {
    id: 'blood_inventories',
    name: 'blood_inventories',
    description: 'Real-time stock levels of blood units by ABO/Rh group, cold-chain sensor status, and expiration logs across blood banks.',
    securityScope: 'Public read for hospital orders; Blood Bank Manager edit own depot; Authority read for strategic reserves.',
    fields: [
      { name: 'id', type: 'string', required: true, description: 'Inventory document ID', example: 'inv_bb01_oneg' },
      { name: 'bloodBankId', type: 'string', required: true, description: 'Depot unique ID', example: 'bb_central_reserve' },
      { name: 'bloodBankName', type: 'string', required: true, description: 'Depot display name', example: 'Central Blood Reserve Depot' },
      { name: 'bloodType', type: 'string', required: true, description: 'ABO and Rh factor (e.g. O-, A+, B-, AB+)', example: 'O-' },
      { name: 'unitsAvailable', type: 'number', required: true, description: 'Total viable units available', example: 18 },
      { name: 'temperatureCelsius', type: 'number', required: true, description: 'Live cold chain temperature sensor (2-6°C target)', example: 3.8 },
      { name: 'expirationAlert', type: 'boolean', required: true, description: 'Flag for units expiring in <72h', example: false }
    ],
    sampleDocument: {
      id: "inv_bb01_oneg",
      bloodBankId: "bb_central_reserve",
      bloodBankName: "Central Blood Reserve Depot",
      bloodType: "O-",
      unitsAvailable: 18,
      reservedUnits: 4,
      temperatureCelsius: 3.8,
      storageUnitId: "FRIDGE_BAY_04",
      expirationAlert: false,
      updatedAt: "2026-07-22T12:02:00Z"
    },
    indexes: [
      { fields: ['bloodType', 'unitsAvailable'], queryType: 'COMPOUND', purpose: 'Sub-second blood cross-matching' }
    ]
  }
];

export const FIRESTORE_SECURITY_RULES_CODE = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper Functions
    function isSignedIn() {
      return request.auth != null;
    }
    
    function getUserData() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }
    
    function hasRole(role) {
      return isSignedIn() && request.auth.token.role == role;
    }
    
    function belongsToOrg(orgId) {
      return isSignedIn() && request.auth.token.orgId == orgId;
    }

    // Users Collection
    match /users/{userId} {
      allow read: if isSignedIn();
      allow write: if request.auth.uid == userId || hasRole('GOVT_AUTHORITY');
    }

    // Emergencies Collection
    match /emergencies/{emergencyId} {
      allow read: if isSignedIn();
      allow create: if hasRole('PATIENT') || hasRole('AMBULANCE_DISPATCH') || hasRole('HOSPITAL_ADMIN');
      allow update: if hasRole('AMBULANCE_DISPATCH') 
                   || hasRole('HOSPITAL_ADMIN') 
                   || hasRole('GOVT_AUTHORITY');
    }

    // Hospital Capacity Collection
    match /hospitals/{hospitalId} {
      allow read: if isSignedIn();
      allow write: if hasRole('HOSPITAL_ADMIN') && belongsToOrg(hospitalId)
                   || hasRole('GOVT_AUTHORITY');
    }

    // Blood Inventory Collection
    match /blood_inventories/{inventoryId} {
      allow read: if isSignedIn();
      allow write: if hasRole('BLOOD_BANK_MGR') && belongsToOrg(resource.data.bloodBankId)
                   || hasRole('GOVT_AUTHORITY');
    }

    // Audit Logs (Immutable)
    match /audit_logs/{logId} {
      allow read: if hasRole('GOVT_AUTHORITY');
      allow create: if isSignedIn();
      allow update, delete: if false; // Strict Immutability
    }
  }
}`;
