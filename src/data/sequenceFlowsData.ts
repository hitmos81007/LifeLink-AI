import { SequenceWorkflow } from '../types/architecture';

export const SEQUENCE_WORKFLOWS: SequenceWorkflow[] = [
  {
    id: 'triage-dispatch',
    title: 'Emergency Triage & Paramedic Dispatch Lifecycle',
    description: 'Sub-second workflow triggered when a patient or bystander reports an acute medical emergency.',
    actors: ['Patient App', 'FastAPI Gateway', 'Gemini AI Engine', 'Firestore DB', 'Ambulance App', 'Hospital Dashboard'],
    steps: [
      {
        stepNumber: 1,
        from: 'Patient App',
        to: 'FastAPI Gateway',
        action: 'POST /api/v1/emergency/triage',
        payload: '{ symptoms: "Sudden crushing chest pain", age: 58, vitals: {...}, location: {...} }',
        latencyMs: 35,
        type: 'http',
        description: 'Patient submits emergency request with symptoms and live GPS location.'
      },
      {
        stepNumber: 2,
        from: 'FastAPI Gateway',
        to: 'Gemini AI Engine',
        action: 'Invoke Clinical Triage Prompt',
        payload: 'Prompt with patient clinical context & historical rules',
        latencyMs: 320,
        type: 'ai',
        description: 'Gemini 3.6 Flash evaluates symptoms, calculates priority score (94), triage level (RED), and recommends ALS ambulance.'
      },
      {
        stepNumber: 3,
        from: 'Gemini AI Engine',
        to: 'FastAPI Gateway',
        action: 'Return Triage JSON',
        payload: '{ triageLevel: "RED", priorityScore: 94, recommendedAmbulanceType: "ALS" }',
        latencyMs: 15,
        type: 'ai',
        description: 'Structured clinical JSON returned to API Gateway.'
      },
      {
        stepNumber: 4,
        from: 'FastAPI Gateway',
        to: 'Firestore DB',
        action: 'Write /emergencies/{id}',
        payload: '{ id: "emg_8912", status: "TRIAGED", triageLevel: "RED", geohash: "9q9hv0" }',
        latencyMs: 45,
        type: 'firestore',
        description: 'Emergency incident record written to Firestore database.'
      },
      {
        stepNumber: 5,
        from: 'Firestore DB',
        to: 'Ambulance App',
        action: 'onSnapshot() Trigger',
        payload: 'Push Notification: Priority RED Dispatch Assigned',
        latencyMs: 20,
        type: 'websocket',
        description: 'Real-time Firestore listener alerts nearest ALS ambulance driver terminal.'
      },
      {
        stepNumber: 6,
        from: 'Firestore DB',
        to: 'Hospital Dashboard',
        action: 'onSnapshot() Trigger',
        payload: 'Incoming Trauma Alert: Expected ETA 11 mins',
        latencyMs: 22,
        type: 'websocket',
        description: 'Target trauma center ER team notified to prep Cath Lab & ER room.'
      }
    ]
  },
  {
    id: 'blood-crossmatch',
    title: 'Urgent Blood Group Cross-Match & Cold-Chain Logistics',
    description: 'Fulfills emergency blood unit allocation during surgical trauma or postpartum hemorrhage.',
    actors: ['Hospital ER', 'FastAPI Gateway', 'Gemini AI Engine', 'Firestore DB', 'Blood Bank Depot', 'Transport Drone/Vehicle'],
    steps: [
      {
        stepNumber: 1,
        from: 'Hospital ER',
        to: 'FastAPI Gateway',
        action: 'POST /api/v1/blood-bank/match',
        payload: '{ recipientBloodType: "AB-", requiredUnits: 3, urgency: "CRITICAL" }',
        latencyMs: 30,
        type: 'http',
        description: 'Hospital doctor places emergency blood reservation.'
      },
      {
        stepNumber: 2,
        from: 'FastAPI Gateway',
        to: 'Gemini AI Engine',
        action: 'Calculate Antigen Compatibility & Depot Inventory',
        payload: 'Recipient AB- + Stock Inventory Query Across Depots',
        latencyMs: 280,
        type: 'ai',
        description: 'Gemini identifies exact AB- matches and ranks depots by distance and cold-chain sensor validity.'
      },
      {
        stepNumber: 3,
        from: 'FastAPI Gateway',
        to: 'Firestore DB',
        action: 'Reserve Units in /blood_inventories',
        payload: '{ reservedUnits: 3, status: "DISPATCH_LOCKED" }',
        latencyMs: 40,
        type: 'firestore',
        description: 'Atomic Firestore transaction locks reserved blood bags to prevent double allocation.'
      },
      {
        stepNumber: 4,
        from: 'Firestore DB',
        to: 'Blood Bank Depot',
        action: 'Real-time Dispatch Order',
        payload: 'Pick 3 units AB- from Fridge Bay 4',
        latencyMs: 18,
        type: 'websocket',
        description: 'Blood bank warehouse screen displays pick route and cold-chain lockbox barcode.'
      },
      {
        stepNumber: 5,
        from: 'Blood Bank Depot',
        to: 'Transport Drone/Vehicle',
        action: 'Handoff & Sensor Activation',
        payload: 'IoT Cold Box Sensor Connected (3.8°C)',
        latencyMs: 50,
        type: 'websocket',
        description: 'Temperature sensor streams telemetry every 10 seconds during transport.'
      }
    ]
  },
  {
    id: 'govt-escalation',
    title: 'Health Authority Regional Disaster & Traffic Preemption',
    description: 'Overriding regional hospital divert statuses and activating green-wave traffic corridors during mass casualty events.',
    actors: ['Govt Authority', 'FastAPI Gateway', 'Firestore DB', 'Traffic Signal Network', 'All Regional Hospitals'],
    steps: [
      {
        stepNumber: 1,
        from: 'Govt Authority',
        to: 'FastAPI Gateway',
        action: 'POST /api/v1/authority/disaster-declaration',
        payload: '{ region: "CA_REGION_04", code: "MASS_CASUALTY_RED", trafficPreemption: true }',
        latencyMs: 25,
        type: 'http',
        description: 'Government health official initiates disaster protocol override.'
      },
      {
        stepNumber: 2,
        from: 'FastAPI Gateway',
        to: 'Firestore DB',
        action: 'Update /hospitals (Clear Divert Flags)',
        payload: '{ divertOverride: true, massCasualtyMode: true }',
        latencyMs: 38,
        type: 'firestore',
        description: 'System automatically suspends hospital divert statuses across the metropolitan zone.'
      },
      {
        stepNumber: 3,
        from: 'FastAPI Gateway',
        to: 'Traffic Signal Network',
        action: 'Trigger Green-Wave Preemption Sequence',
        payload: '{ corridorIds: ["HWY_101", "MARKET_ST"], emergencyHoldDurationSec: 300 }',
        latencyMs: 65,
        type: 'http',
        description: 'Municipal traffic signals along primary hospital routes switch to continuous green.'
      },
      {
        stepNumber: 4,
        from: 'Firestore DB',
        to: 'All Regional Hospitals',
        action: 'Broadcast Mass Casualty Command',
        payload: 'Activate Emergency On-Call Medical Staff & Triage Tents',
        latencyMs: 15,
        type: 'websocket',
        description: 'Command centers at all area hospitals open extra surge capacity.'
      }
    ]
  }
];
