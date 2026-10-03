import { FeatureItem, DemoUser } from '../types/landing';

export const FEATURE_CARDS_DATA: FeatureItem[] = [
  {
    id: 'blood-intelligence',
    title: 'Blood Intelligence',
    category: 'Hematology Supply Chain',
    shortDescription: 'Real-time blood bank inventory tracking, automated ABO/Rh cross-matching, and intra-hospital shortage dispatch.',
    fullDescription: 'LifeLink AI unifies regional blood banks and hospital blood fridges into a synchronized grid. The AI automatically predicts emergency transfusion demands based on trauma incoming rates, executes instant ABO/Rh compatibility analysis, and orchestrates cold-chain courier dispatches.',
    iconName: 'Droplet',
    accentColor: 'rose',
    metrics: [
      { label: 'Cross-Match Speed', value: '< 2.4 sec' },
      { label: 'Wastage Reduction', value: '42%' },
      { label: 'Connected Banks', value: '180+' }
    ],
    keyCapabilities: [
      'Automated ABO & Rh D-type compatibility engine',
      'Real-time blood fridge temperature & shelf-life monitoring',
      'Proactive rare blood group donor push notifications (O-, AB-)',
      'Intra-facility emergency transfer routing'
    ],
    sampleOutput: {
      status: 'MATCH FOUND',
      detail: '4 Units O- Negative Blood reserved at Central Red Cross Depot. Dispatching cold-box express rider.',
      time: 'ETA 11 mins'
    }
  },
  {
    id: 'icu-availability',
    title: 'ICU Availability',
    category: 'Critical Bed Management',
    shortDescription: 'Live telemetry bed sync, ventilator tracking, predictive occupancy forecasting, and zero-delay patient admissions.',
    fullDescription: 'Eliminate phone-tag during critical transfers. ICU Availability connects hospital EHRs and bedside sensors to broadcast live occupied, reserved, and available ventilator & isolation beds. Predictive AI anticipates discharge readiness to maximize capacity.',
    iconName: 'Bed',
    accentColor: 'blue',
    metrics: [
      { label: 'Bed Sync Frequency', value: '1000ms' },
      { label: 'Transfer Delay Saved', value: '38 mins' },
      { label: 'Ventilator Tracking', value: '100% Live' }
    ],
    keyCapabilities: [
      'Real-time ICU, CCU, and Trauma bay status dashboard',
      'Ventilator & dialysis machine allocation matrix',
      'AI patient severity score integration (SOFA / APACHE II)',
      'Direct paramedic-to-ICU bed reservation pre-arrival'
    ],
    sampleOutput: {
      status: 'BED RESERVED',
      detail: 'ICU Bay #04 (Ventilator Active) assigned for incoming STEMI patient from Paramedic Unit 12.',
      time: 'Ready in 3 mins'
    }
  },
  {
    id: 'ambulance-coordination',
    title: 'Ambulance Coordination',
    category: 'Emergency Dispatch & Routing',
    shortDescription: 'Smart ALS/BLS vehicle dispatch, Green Corridor signal preemption, and real-time paramedic telemetry feed.',
    fullDescription: 'Transforming emergency response times with intelligent vehicle routing. LifeLink AI syncs with city traffic management systems to clear green-wave light sequences for approaching ambulances while continuously streaming patient vitals directly to the trauma team.',
    iconName: 'Ambulance',
    accentColor: 'emerald',
    metrics: [
      { label: 'Avg Arrival Time', value: '4.8 mins' },
      { label: 'Traffic Light Preemption', value: '98.4%' },
      { label: 'Live Vitals Stream', value: 'Sub-second' }
    ],
    keyCapabilities: [
      'Automatic nearest-unit dispatch based on GPS & skill tier',
      'Dynamic Green-Wave traffic signal override integration',
      'Paramedic 12-Lead ECG & vital signs live streaming to ER',
      'Aero-medical helicopter rendezvous optimization'
    ],
    sampleOutput: {
      status: 'GREEN CORRIDOR ACTIVE',
      detail: 'Traffic Lights on Expressway 9 overridden to Green. Speed advantage: +34 km/h over traffic.',
      time: 'ER ETA 4 mins'
    }
  },
  {
    id: 'medicine-intelligence',
    title: 'Medicine Intelligence',
    category: 'Pharmaceutical Logistics',
    shortDescription: 'Antidote & rare drug locator, automated expiry alerts, regional inventory pooling, and emergency delivery.',
    fullDescription: 'Never run out of lifesaving pharmaceuticals. Medicine Intelligence maintains an active registry of rare antivenoms, thrombolytics, specialized biologics, and pediatric emergency drugs across all municipal pharmacies and medical centers.',
    iconName: 'Pill',
    accentColor: 'amber',
    metrics: [
      { label: 'Locate Antidote Time', value: '< 15 sec' },
      { label: 'Stockout Prevention', value: '94%' },
      { label: 'Pharmacies Synced', value: '1,250+' }
    ],
    keyCapabilities: [
      'Instant search for critical & rare pharmaceuticals',
      'Automated batch expiration alert & redistribution',
      'Emergency drone delivery route integration',
      'Counterfeit & cold-chain breach detection'
    ],
    sampleOutput: {
      status: 'STOCK LOCATED',
      detail: 'Snake Antivenom Polyvalent found at St. Jude Hospital Pharmacy (4.2 km). Courier dispatched.',
      time: 'Delivery in 8 mins'
    }
  },
  {
    id: 'disease-outbreak-prediction',
    title: 'Disease Outbreak Prediction',
    category: 'Epidemiological AI Surveillance',
    shortDescription: 'Syndromic surveillance, emergency room surge modeling, vector heatmaps, and early quarantine alerts.',
    fullDescription: 'Protect communities before outbreaks escalate. LifeLink AI aggregates emergency room intake symptoms, fever trends, and pharmacy sales to detect epidemiological anomalies up to 7 days before traditional public health reporting.',
    iconName: 'Activity',
    accentColor: 'purple',
    metrics: [
      { label: 'Early Detection Window', value: '+7 Days' },
      { label: 'Anomalous Trend Accuracy', value: '96.2%' },
      { label: 'Regions Monitored', value: '45 Zones' }
    ],
    keyCapabilities: [
      'NLP analysis of chief complaint emergency room logs',
      'Predictive heatmaps for viral, bacterial, & vector threats',
      'Surge staffing & PPE buffer stock auto-recommendations',
      'Automated health authority outbreak alerts'
    ],
    sampleOutput: {
      status: 'SURGE WARNING',
      detail: 'Anomalous 34% spike in viral respiratory triage in Sector 4. Recommending +15 Bed Buffer.',
      time: 'Alert Triggered'
    }
  },
  {
    id: 'emergency-analytics',
    title: 'Emergency Analytics',
    category: 'Executive Resource Dashboard',
    shortDescription: 'Regional response velocity tracking, bottleneck heatmaps, mortality reduction metrics, and compliance logs.',
    fullDescription: 'Comprehensive, data-driven intelligence for healthcare directors and government ministers. Gain actionable clarity on emergency response performance, hospital bottleneck origins, and inter-agency collaboration efficiency.',
    iconName: 'BarChart3',
    accentColor: 'indigo',
    metrics: [
      { label: 'Data Points / Day', value: '4.2M' },
      { label: 'Compliance Audit', value: 'HIPAA & GDPR' },
      { label: 'Report Generation', value: 'Instant' }
    ],
    keyCapabilities: [
      'Real-time municipal emergency command map',
      'Resource utilization bottleneck heatmaps',
      'Standardized HL7 FHIR export & audit logging',
      'Response time SLA tracking & benchmark scoring'
    ],
    sampleOutput: {
      status: 'REPORT GENERATED',
      detail: 'Q2 Municipal Emergency Response Velocity audit finalized. Regional average ETA decreased by 2.1 mins.',
      time: 'Live Audit'
    }
  }
];

export const DEMO_USERS: DemoUser[] = [
  {
    role: 'HOSPITAL_ADMIN',
    name: 'Dr. Sarah Jenkins',
    org: 'Metro General Hospital',
    email: 's.jenkins@metrohealth.org',
    badge: 'Hospital Command Center'
  },
  {
    role: 'BLOOD_BANK',
    name: 'Marcus Vance',
    org: 'Regional Red Cross Blood Hub',
    email: 'm.vance@redcrossblood.org',
    badge: 'Senior Hematology Specialist'
  },
  {
    role: 'DISPATCHER',
    name: 'Chief Robert Torres',
    org: 'City Emergency Medical Services',
    email: 'r.torres@cityems.gov',
    badge: 'Lead Dispatcher'
  },
  {
    role: 'HEALTH_MINISTRY',
    name: 'Dr. Elena Rostova',
    org: 'Department of Public Health',
    email: 'e.rostova@health.gov',
    badge: 'Chief Epidemiologist'
  }
];
