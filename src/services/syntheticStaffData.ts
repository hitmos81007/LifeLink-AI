import { HospitalStaffRecord, StaffDiscipline } from './hospitalOperationsService';

export interface StaffScenarioWork {
  assignedUnit: string;
  shiftHours: string;
  roleTitle: string;
  primaryWork: string;
  secondaryWork: string;
  workloadStatus: 'Normal' | 'High' | 'Overtime' | 'Reassigned' | 'Critical';
  criticalDeviceOrSupply: string;
}

export type OperationalScenarioKey = 
  | 'baseline_24h'
  | 'mass_casualty_surge'
  | 'oxygen_crisis'
  | 'workforce_deficit'
  | 'icu_ventilator_saturation';

export interface OperationalScenarioConfig {
  key: OperationalScenarioKey;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  description: string;
  telemetry: {
    oxygen: {
      cylindersAvailable: number;
      cylindersTotal: number;
      liquidOxygenLevelPct: number;
      flowRateLpm: number;
      reserveHours: number;
      status: 'optimal' | 'warning' | 'critical';
    };
    icuBeds: {
      available: number;
      total: number;
      occupied: number;
      protectedReserve: number;
      status: 'optimal' | 'warning' | 'critical';
    };
    generalBeds: {
      available: number;
      total: number;
      occupied: number;
      protectedReserve: number;
      status: 'optimal' | 'warning' | 'critical';
    };
    operatingRooms: {
      total: number;
      emergencyActive: number;
      electiveActive: number;
      turnaround: number;
      reserveFree: number;
      status: 'optimal' | 'warning' | 'critical';
    };
    suppliesAndDevices: {
      emergencyKits: number;
      ventilatorsFree: number;
      ventilatorsInUse: number;
      ivFluidBags: number;
      vasopressorVials: number;
      status: 'optimal' | 'warning' | 'critical';
    };
  };
  operationalPriorities: string[];
}

export interface SyntheticStaffProfile extends HospitalStaffRecord {
  staffCode: string;
  defaultPassword: string;
  experienceYears: number;
  avatarSeed: string;
  scenarios: Record<OperationalScenarioKey, StaffScenarioWork>;
}

// Generate the 50 synthetic staff definitions with vh16001 - vh16050
const STAFF_NAMES = [
  'Dr. Rajesh Kumar', 'Dr. Priya Sharma', 'Dr. Ananya Iyer', 'Dr. Karthik Sundaram', 'Nurse Anitha R',
  'Nurse Suresh Babu', 'Dr. Vikramaditya Reddy', 'Nurse Kavitha M', 'Dr. Meenakshi Raman', 'Dr. Arjun Nair',
  'Nurse Deepa S', 'Technician Harish Verma', 'Dr. Sanjay Deshmukh', 'Nurse Lakshmi Narayanan', 'Dr. Pooja Kulkarni',
  'Nurse Gokul Prasad', 'Dr. Ritu Choudhury', 'Technician Manoj Kumar', 'Pharmacist Divya Menon', 'Dr. Balaji Govindan',
  'Nurse Preethi Pillai', 'Nurse Vigneshwaran S', 'Dr. Sneha Chatterjee', 'Dr. Alok Banerjee', 'Nurse Manjula B',
  'Technician Prakash Rao', 'Dr. Swaminathan V', 'Nurse Hemalatha K', 'Dr. Siddharth Sen', 'Nurse Naveen Raj',
  'Pharmacist Arvind Swamy', 'Dr. Neha Agarwal', 'Nurse Gayathri V', 'Dr. Mahesh Joshi', 'Technician Dinesh S',
  'Dr. Tanvi Bhatt', 'Nurse Pavithra S', 'Nurse Saravanan M', 'Dr. Rohini Varma', 'Technician Senthil Nathan',
  'Nurse Geetha Balan', 'Dr. Farooq Abdullah', 'Support Ravi Shankar', 'Support Murugan K', 'Nurse Revathi S',
  'Technician Ashok Pandey', 'Dr. Madhavan Kutty', 'Nurse Shalini Nair', 'Pharmacist Jayashree M', 'Support Velu P'
];

const DISCIPLINES: StaffDiscipline[] = [
  'Surgeon', 'Anesthesiologist', 'Physician', 'Surgeon', 'Nurse',
  'Nurse', 'Surgeon', 'Nurse', 'Physician', 'Anesthesiologist',
  'Nurse', 'Technician', 'Surgeon', 'Nurse', 'Physician',
  'Nurse', 'Anesthesiologist', 'Technician', 'Pharmacist', 'Physician',
  'Nurse', 'Nurse', 'Surgeon', 'Physician', 'Nurse',
  'Technician', 'Anesthesiologist', 'Nurse', 'Surgeon', 'Nurse',
  'Pharmacist', 'Physician', 'Nurse', 'Surgeon', 'Technician',
  'Physician', 'Nurse', 'Nurse', 'Anesthesiologist', 'Respiratory Therapist',
  'Nurse', 'Physician', 'Support', 'Support', 'Nurse',
  'Respiratory Therapist', 'Surgeon', 'Nurse', 'Pharmacist', 'Support'
];

const DEPARTMENTS = [
  'Trauma Surgery', 'Anesthesiology', 'Critical Care (ICU)', 'Orthopedic Surgery', 'Emergency Ward',
  'ICU Care', 'General Surgery', 'Post-Op Recovery (PACU)', 'Internal Medicine', 'Cardiothoracic Anesthesia',
  'Emergency Care', 'Biomedical & Radiology', 'Neurosurgery', 'Pediatric ICU', 'General Medicine',
  'Operating Room Scrub', 'Neuro-Anesthesia', 'Sterilization & CSSD', 'Hospital Pharmacy', 'Pulmonology',
  'Step-Down Ward', 'Surgical Ward', 'Plastic & Reconstructive', 'Infectious Diseases', 'Day Care Ward',
  'Medical Gas & Plant', 'Obstetric Anesthesia', 'ICU Care', 'Cardiovascular Surgery', 'Emergency Ward',
  'Clinical Pharmacy', 'Nephrology & Dialysis', 'Triage Station', 'Surgical Oncology', 'Laboratory Diagnostics',
  'Endocrinology', 'Neonatal ICU', 'Orthopedic Ward', 'Pain Management', 'Respiratory Care',
  'Dialysis Ward', 'Gastroenterology', 'Logistics & Transport', 'Patient Sanitation', 'Pre-Op Holding',
  'Ventilator & Gas Unit', 'Pediatric Surgery', 'Cardiac Step-Down', 'Emergency Pharmacy', 'Waste & Biohazard'
];

const SKILL_SETS: string[][] = [
  ['Emergency Laparotomy', 'Damage Control Surgery', 'Vascular Repair'],
  ['Difficult Airway', 'Hemodynamic Monitoring', 'Regional Nerve Blocks'],
  ['Arterial Lines', 'Mechanical Ventilation', 'Sepsis Management'],
  ['External Fixation', 'Joint Reconstruction', 'Polytrauma'],
  ['Rapid Triage', 'ACLS Certified', 'IV Cannulation'],
  ['Central Line Care', 'ECG Interpretation', 'Defibrillator Protocol'],
  ['Minimally Invasive', 'Acute Abdomen', 'Hernia Repair'],
  ['Sedation Monitoring', 'Post-Extubation Care', 'Pain Titration'],
  ['Critical Diagnostic', 'Diabetic Emergencies', 'Hypertensive Crises'],
  ['TEE Monitoring', 'Cardiac Arrest Protocols', 'Epidural Placement'],
  ['Mass Casualty Triage', 'Splinting', 'Emergency Medication'],
  ['CT Scanner Operation', 'Digital X-Ray', 'Radiation Safety'],
  ['Craniotomy', 'Intracranial Pressure Monitoring', 'Spine Trauma'],
  ['Pediatric Life Support', 'Neonatal Ventilation', 'Dosage Precision'],
  ['Multi-Morbidity', 'Geriatric Acute Care', 'Stroke Management'],
  ['Sterile Field Maintenance', 'Instrument Tracking', 'Suture Handling'],
  ['Awake Intubation', 'Neuro-Resuscitation', 'Hypothermia Management'],
  ['Autoclave Sterilization', 'Sterile Pack Auditing', 'CSSD Flow'],
  ['Stat Narcotics Dispensing', 'TPN Compounding', 'Drug Interaction Screening'],
  ['Non-Invasive Ventilation', 'Bronchoscopy Assist', 'Blood Gas Analysis'],
  ['High-Dependency Care', 'Cardiac Telemetry', 'Wound Debridement'],
  ['Post-Surgical Dressing', 'Drain Monitoring', 'Infection Control'],
  ['Microvascular Free Flaps', 'Burn Management', 'Tissue Grafting'],
  ['Isolation Protocols', 'Antimicrobial Stewardship', 'PPE Donning/Doffing'],
  ['Rapid Patient Turnaround', 'Day Care Infusions', 'Discharge Education'],
  ['Liquid Oxygen Plant', 'Manifold Pressure Calibration', 'Pipe Integrity'],
  ['Obstetric Emergencies', 'Spinal Anesthesia', 'Neonatal Resuscitation'],
  ['Prone Positioning', 'Invasive Blood Pressure', 'CRRT Monitoring'],
  ['Aortic Valve Replacement', 'CABG Surgery', 'Cardiopulmonary Bypass'],
  ['Level 1 Trauma Triage', 'Shock Management', 'Code Blue Team'],
  ['Unit-Dose Dispensing', 'Inventory Restock', 'Cold-Chain Biologicals'],
  ['Continuous Renal Replacement', 'Dialyzer Setup', 'Fistula Cannulation'],
  ['Fast-Track Assessment', 'Vitals Screening', 'Disaster Tagging'],
  ['Tumor Resection', 'Lymph Node Dissection', 'Oncologic Hemostasis'],
  ['ABG Lab Testing', 'Stat Electrolytes', 'Blood Cross-Matching'],
  ['Glycemic Control Protocols', 'Endocrine Emergencies', 'Insulin Pumps'],
  ['Surfactant Delivery', 'Incubator Regulation', 'Neonatal Phototherapy'],
  ['Traction Management', 'Compartment Syndrome Watch', 'Cast Application'],
  ['Ultrasound-Guided Blocks', 'Chronic Pain Intravenous Infusion', 'PACU Support'],
  ['Ventilator Waveform Analysis', 'High-Flow Nasal Cannula', 'Oxygen Titration'],
  ['Peritoneal Dialysis', 'Fluid Overload Management', 'Electrolyte Balance'],
  ['Endoscopy Hemostasis', 'Acute GI Bleed', 'Liver Failure Care'],
  ['Stretcher Navigation', 'Oxygen Cylinder Transfer', 'Morgue Protocol'],
  ['Terminal Room Disinfection', 'Chemical Bio-Wipe', 'Sterile Waste Disposal'],
  ['Surgical Checklist Verification', 'Anxiety Mitigation', 'NPO Adherence'],
  ['Pressure Swing Adsorption', 'Oxygen Flowmeter Servicing', 'Cylinder Bank Checks'],
  ['Congenital Malformation Surgery', 'Pediatric Trauma', 'Minimal Access'],
  ['Continuous ECG Watch', 'Arrhythmia Recognition', 'Post-Angioplasty Care'],
  ['Crash Cart Verification', 'Emergency Drug Kit Replenishment', 'Refrigerated Antidotes'],
  ['Hazardous Spills Protocol', 'Linen Sterilization Transport', 'Facility Sanitization']
];

export const SYNTHETIC_STAFF_LIST: SyntheticStaffProfile[] = Array.from({ length: 50 }, (_, index) => {
  const num = 16001 + index;
  const email = `vh${num}@velhightech.com`;
  const name = STAFF_NAMES[index];
  const discipline = DISCIPLINES[index];
  const department = DEPARTMENTS[index];
  const skills = SKILL_SETS[index];
  const staffCode = `VH-${num}`;
  const defaultPassword = 'Mats@8905';

  const morningShift = '07:00 – 15:30 (Day Rotation)';
  const eveningShift = '15:00 – 23:30 (Evening Rotation)';
  const nightShift = '23:00 – 07:30 (Night Vigil)';
  const shiftHours = index % 3 === 0 ? morningShift : index % 3 === 1 ? eveningShift : nightShift;

  const scenarios: Record<OperationalScenarioKey, StaffScenarioWork> = {
    baseline_24h: {
      assignedUnit: department,
      shiftHours,
      roleTitle: `${discipline} · Regular Roster`,
      primaryWork: `Routine hospital duties in ${department}: standard consultations, planned monitoring, and patient updates.`,
      secondaryWork: `Documentation, hand-off rounds, and checking standard medical inventory.`,
      workloadStatus: 'Normal',
      criticalDeviceOrSupply: skills[0] || 'Standard ward monitor'
    },
    mass_casualty_surge: {
      assignedUnit: index < 15 ? 'Emergency Trauma Theatre (OR-1 & OR-2)' : index < 30 ? 'Acute Resuscitation Bay 1-4' : 'Post-Op Surge PACU',
      shiftHours: '06:00 – 18:30 (12h Crisis Surge Extension)',
      roleTitle: index < 10 ? 'Senior Trauma Surgeon / Anesthesia Lead' : index < 25 ? 'Critical Trauma Resuscitation Specialist' : 'Surge Ward Support',
      primaryWork: index < 15 
        ? 'Conducting continuous damage-control surgeries for arriving multi-vehicle collision trauma victims.' 
        : index < 30 
        ? 'Directing Level-1 rapid triage, massive transfusion protocol (MTP), and chest-tube insertions.' 
        : 'Post-operative rapid recovery stabilization, pain management, and bed turnover for incoming surgical cases.',
      secondaryWork: 'Cross-checking emergency blood bank reserves and surgical pack availability.',
      workloadStatus: index < 25 ? 'Critical' : 'High',
      criticalDeviceOrSupply: 'Rapid Blood Infuser & Crash Cart Kit'
    },
    oxygen_crisis: {
      assignedUnit: index % 4 === 0 ? 'Liquid Oxygen Storage & Pressure Control' : index % 3 === 0 ? 'ICU Ventilator Pods' : 'Step-Down Low-Flow Ward',
      shiftHours,
      roleTitle: discipline === 'Respiratory Therapist' ? 'Lead Oxygen Conservation Officer' : `${discipline} · Oxygen Rationing Team`,
      primaryWork: discipline === 'Respiratory Therapist'
        ? 'Continuous titration of oxygen flow rates, transitioning high-flow cannula patients to venturi masks.'
        : 'Supervising strict target SpO2 (92-96%) monitoring to eliminate gas leaks and reduce piped LOX draw by 40%.',
      secondaryWork: 'Auditing secondary manifold cylinder banks and logging hourly pressure differential readings.',
      workloadStatus: discipline === 'Respiratory Therapist' || discipline === 'Anesthesiologist' ? 'Critical' : 'High',
      criticalDeviceOrSupply: 'High-Efficiency Oxygen Flowmeters & Dual-Stage Regulators'
    },
    workforce_deficit: {
      assignedUnit: department,
      shiftHours: '08:00 – 20:30 (12h Crisis Coverage Rotation)',
      roleTitle: `${discipline} · Cross-Ward Supervisory Role`,
      primaryWork: `Absorbing dual-ward clinical workload due to 30% staff quarantine; prioritizing urgent clinical orders and high-risk patients.`,
      secondaryWork: 'Supervising nursing trainees, verifying telemetry alarm escalations, and expediting clinical rounds.',
      workloadStatus: 'Overtime',
      criticalDeviceOrSupply: 'Multi-Parameter Telemetry Hub'
    },
    icu_ventilator_saturation: {
      assignedUnit: index < 20 ? 'Main ICU (100% Saturated)' : index < 35 ? 'Recovery Annex (Converted Surge ICU)' : 'High-Dependency Step-Down',
      shiftHours: '19:00 – 07:30 (Night Crisis Shift)',
      roleTitle: index < 20 ? 'Intensive Care Primary Responder' : 'Surge ICU Bed Coordinator',
      primaryWork: index < 20 
        ? 'Managing multi-organ failure patients on invasive mechanical ventilation with continuous inotrope infusions.' 
        : 'Converting 10 step-down beds into operational ventilator beds with transport monitors and infusion pumps.',
      secondaryWork: 'Conducting arterial blood gas (ABG) serial testing and ventilator weaning assessments.',
      workloadStatus: index < 30 ? 'Critical' : 'High',
      criticalDeviceOrSupply: 'Hamilton/Puritan Bennett Ventilator & Arterial Line Set'
    }
  };

  return {
    staff_id: `synth-staff-${num}`,
    hospital_id: 'a1000000-0000-4000-8000-000000000001',
    auth_user_id: `auth-synth-${num}`,
    full_name: name,
    email,
    phone: `+91 98401 ${String(num).slice(-4)}`,
    department,
    discipline,
    skills,
    contract_hours_per_week: 40.0,
    employment_status: 'active',
    created_at: new Date(Date.now() - (50 - index) * 3600000 * 24).toISOString(),
    staffCode,
    defaultPassword,
    experienceYears: 4 + (index % 18),
    avatarSeed: `staff_${num}`,
    scenarios
  };
});

export const OPERATIONAL_SCENARIOS: Record<OperationalScenarioKey, OperationalScenarioConfig> = {
  baseline_24h: {
    key: 'baseline_24h',
    title: 'Standard 24h Baseline Operations',
    subtitle: 'Routine Day/Night Hospital Workflow & Elective Balancing',
    badge: 'Routine Operational Balance',
    badgeColor: 'border-emerald-700 bg-emerald-950/60 text-emerald-200',
    description: 'Standard 24-hour cycle with balanced elective surgical schedule, standard ICU occupancy (70%), fully staffed 3-shift rotation, and steady consumable burn rate.',
    telemetry: {
      oxygen: {
        cylindersAvailable: 42,
        cylindersTotal: 50,
        liquidOxygenLevelPct: 84,
        flowRateLpm: 120,
        reserveHours: 72,
        status: 'optimal'
      },
      icuBeds: {
        available: 6,
        total: 24,
        occupied: 17,
        protectedReserve: 1,
        status: 'optimal'
      },
      generalBeds: {
        available: 66,
        total: 220,
        occupied: 146,
        protectedReserve: 8,
        status: 'optimal'
      },
      operatingRooms: {
        total: 8,
        emergencyActive: 2,
        electiveActive: 4,
        turnaround: 1,
        reserveFree: 1,
        status: 'optimal'
      },
      suppliesAndDevices: {
        emergencyKits: 45,
        ventilatorsFree: 7,
        ventilatorsInUse: 17,
        ivFluidBags: 620,
        vasopressorVials: 140,
        status: 'optimal'
      }
    },
    operationalPriorities: [
      'Maintain standard 720 minutes daily OR operating blocks with 30-min turnaround.',
      'Deliver planned elective surgeries without delaying acute emergency admissions.',
      'Ensure standard 8-hour staff rotations with complete clinical handovers.'
    ]
  },
  mass_casualty_surge: {
    key: 'mass_casualty_surge',
    title: 'Mass Casualty / Severe Trauma Surge',
    subtitle: 'Immediate Level-1 Influx (25+ Polytrauma Arrivals)',
    badge: 'Code Red · Trauma Protocol Active',
    badgeColor: 'border-rose-700 bg-rose-950/80 text-rose-200 animate-pulse',
    description: 'Highway multi-vehicle disaster alert triggered. All elective surgeries halted; all 8 operating rooms prioritized for emergency damage control; all 50 staff redeployed to Trauma Bay, ORs, and PACU.',
    telemetry: {
      oxygen: {
        cylindersAvailable: 28,
        cylindersTotal: 50,
        liquidOxygenLevelPct: 62,
        flowRateLpm: 280,
        reserveHours: 24,
        status: 'warning'
      },
      icuBeds: {
        available: 1,
        total: 24,
        occupied: 22,
        protectedReserve: 1,
        status: 'critical'
      },
      generalBeds: {
        available: 18,
        total: 220,
        occupied: 194,
        protectedReserve: 8,
        status: 'warning'
      },
      operatingRooms: {
        total: 8,
        emergencyActive: 7,
        electiveActive: 0,
        turnaround: 1,
        reserveFree: 0,
        status: 'critical'
      },
      suppliesAndDevices: {
        emergencyKits: 8,
        ventilatorsFree: 1,
        ventilatorsInUse: 23,
        ivFluidBags: 180,
        vasopressorVials: 28,
        status: 'critical'
      }
    },
    operationalPriorities: [
      'Suspend non-urgent elective cases immediately and clear Recovery PACU beds.',
      'Activate Massive Transfusion Protocol (MTP) with connected blood bank inventory.',
      'Transition staff to 12-hour surge shift schedule with dual-surgeon trauma teams.'
    ]
  },
  oxygen_crisis: {
    key: 'oxygen_crisis',
    title: 'Critical Liquid Oxygen (LOX) Supply Rationing',
    subtitle: 'Primary Manifold Pressure Drop & Supply Pipeline Delay',
    badge: 'Oxygen Conservation Protocol',
    badgeColor: 'border-amber-700 bg-amber-950/80 text-amber-200',
    description: 'Bulk cryogenic tanker delivery delayed by road blockade. Primary plant pressure reduced to 4.2 bar. Mandatory oxygen conservation: flow rate limited, respiratory therapists monitoring titration.',
    telemetry: {
      oxygen: {
        cylindersAvailable: 11,
        cylindersTotal: 50,
        liquidOxygenLevelPct: 21,
        flowRateLpm: 95,
        reserveHours: 14,
        status: 'critical'
      },
      icuBeds: {
        available: 5,
        total: 24,
        occupied: 18,
        protectedReserve: 1,
        status: 'warning'
      },
      generalBeds: {
        available: 54,
        total: 220,
        occupied: 158,
        protectedReserve: 8,
        status: 'optimal'
      },
      operatingRooms: {
        total: 8,
        emergencyActive: 3,
        electiveActive: 1,
        turnaround: 1,
        reserveFree: 3,
        status: 'warning'
      },
      suppliesAndDevices: {
        emergencyKits: 38,
        ventilatorsFree: 4,
        ventilatorsInUse: 20,
        ivFluidBags: 540,
        vasopressorVials: 110,
        status: 'optimal'
      }
    },
    operationalPriorities: [
      'Titrate all stable patients down to target SpO2 (92-94%) via closed venturi masks.',
      'Restrict high-flow nasal cannula (HFNC) devices; substitute with BiPAP where indicated.',
      'Connect emergency backup high-pressure manifold banks to ICU and OR wings.'
    ]
  },
  workforce_deficit: {
    key: 'workforce_deficit',
    title: 'Epidemic Workforce Deficit (Staff Quarantine)',
    subtitle: '30% Absenteeism Due to Severe Contagion Exposure',
    badge: 'Code Silver · Staffing Shortfall',
    badgeColor: 'border-yellow-700 bg-yellow-950/80 text-yellow-200',
    description: '15 clinical team members quarantined following pathogen cluster. Remaining staff moved to crisis cross-coverage and 12-hour shifts; surgical schedule scaled to emergency procedures only.',
    telemetry: {
      oxygen: {
        cylindersAvailable: 39,
        cylindersTotal: 50,
        liquidOxygenLevelPct: 78,
        flowRateLpm: 130,
        reserveHours: 64,
        status: 'optimal'
      },
      icuBeds: {
        available: 3,
        total: 24,
        occupied: 20,
        protectedReserve: 1,
        status: 'warning'
      },
      generalBeds: {
        available: 48,
        total: 220,
        occupied: 164,
        protectedReserve: 8,
        status: 'warning'
      },
      operatingRooms: {
        total: 8,
        emergencyActive: 4,
        electiveActive: 1,
        turnaround: 2,
        reserveFree: 1,
        status: 'warning'
      },
      suppliesAndDevices: {
        emergencyKits: 40,
        ventilatorsFree: 5,
        ventilatorsInUse: 19,
        ivFluidBags: 590,
        vasopressorVials: 125,
        status: 'optimal'
      }
    },
    operationalPriorities: [
      'Institute cross-ward supervisory nurse model (1 senior nurse per 12 acute beds).',
      'Deploy physician telehealth rounds for stable general medical inpatients.',
      'Prioritize life-saving emergency surgeries; defer elective orthopedic and cosmetic cases.'
    ]
  },
  icu_ventilator_saturation: {
    key: 'icu_ventilator_saturation',
    title: 'ICU & Ventilator Saturation (Code Black Surge)',
    subtitle: '100% ICU Occupancy with Step-Down Annex Conversion',
    badge: 'Code Black · Critical Bed Saturation',
    badgeColor: 'border-purple-700 bg-purple-950/80 text-purple-200 animate-pulse',
    description: 'Post-viral ARDS surge saturates all 24 ICU beds. Step-down recovery unit is actively converted into an emergency 10-bed ICU extension with portable ventilators and intensivist supervision.',
    telemetry: {
      oxygen: {
        cylindersAvailable: 22,
        cylindersTotal: 50,
        liquidOxygenLevelPct: 54,
        flowRateLpm: 230,
        reserveHours: 32,
        status: 'warning'
      },
      icuBeds: {
        available: 0,
        total: 24,
        occupied: 24,
        protectedReserve: 0,
        status: 'critical'
      },
      generalBeds: {
        available: 32,
        total: 220,
        occupied: 180,
        protectedReserve: 8,
        status: 'warning'
      },
      operatingRooms: {
        total: 8,
        emergencyActive: 4,
        electiveActive: 2,
        turnaround: 1,
        reserveFree: 1,
        status: 'optimal'
      },
      suppliesAndDevices: {
        emergencyKits: 22,
        ventilatorsFree: 0,
        ventilatorsInUse: 24,
        ivFluidBags: 310,
        vasopressorVials: 44,
        status: 'critical'
      }
    },
    operationalPriorities: [
      'Activate 10 surge ICU beds in PACU/Step-Down with transport ventilators.',
      'Deploy rapid-response intensivist weaning rounds to identify extubation candidates.',
      'Coordinate with regional network command center for priority inter-hospital transfer.'
    ]
  }
};
