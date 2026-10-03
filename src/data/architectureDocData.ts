import { DocSection } from '../types/architecture';

export const ARCHITECTURE_SECTIONS: DocSection[] = [
  {
    id: 'folder-structure',
    number: 1,
    title: 'Complete Monorepo Folder Structure',
    subtitle: 'Production-ready Clean Architecture & Modular Micro-Frontend/Service Blueprint',
    badge: 'Directory & Architecture',
    summary: 'Strict separation of concerns across Client (React + Vite), Microservice Backend (FastAPI), Firebase Cloud Functions, and Infrastructure-as-Code (Terraform).',
    keyTakeaways: [
      'Frontend uses Feature-Driven Development (FDD) with atomic design principles.',
      'FastAPI uses Domain-Driven Design (DDD) with clean presentation, application, domain, and infrastructure layers.',
      'Firebase Cloud Functions handle async event-driven Firestore triggers and batch AI pipelines.',
      'Docker multi-stage builds ensure zero-downtime containerized Cloud Run deployments.'
    ],
    contentMarkdown: `
### Monorepo Layout Overview

LifeLink AI is organized as an enterprise monorepo using standard domain boundaries. The frontend application is placed under \`apps/web\`, while backend services reside under \`services/api-gateway\` and \`services/ai-orchestrator\`.

\`\`\`
lifelink-ai/
├── apps/
│   └── web/                         # React 19 + Vite Frontend SPA
│       ├── public/                  # Static assets & PWA manifest
│       ├── src/
│       │   ├── assets/              # Icons, maps markers, theme graphics
│       │   ├── components/          # Reusable design system UI (shadcn/Radix)
│       │   ├── config/              # Firebase, Maps, and API endpoint configs
│       │   ├── features/            # Feature modules (Triage, Blood, Ambulance, Hospital, Authority)
│       │   │   ├── triage/          # Triage wizard, symptom input, AI score card
│       │   │   ├── blood-bank/      # Inventory tracker, cold-chain monitor, cross-match
│       │   │   ├── ambulance/       # Live driver GPS dashboard, green-wave route
│       │   │   ├── hospital/        # ICU bed matrix, ER capacity, incoming alerts
│       │   │   └── authority/       # Regional compliance map, SLA analytics, audit logs
│       │   ├── hooks/               # Custom React hooks (useFirestoreSync, useGeoTracking)
│       │   ├── layouts/             # Authenticated role-based shell layouts
│       │   ├── routes/              # React Router v7 RBAC route definitions
│       │   ├── services/            # Axios API client, WebSocket dispatch client
│       │   ├── store/               # Zustand global state slices
│       │   ├── types/               # Shared TypeScript models & DTOs
│       │   ├── utils/               # Formatting, distance math, error handlers
│       │   ├── App.tsx              # Root app orchestrator
│       │   └── main.tsx             # React DOM entry point
│       ├── index.html
│       ├── package.json
│       ├── tailwind.config.ts
│       └── vite.config.ts
├── services/
│   ├── api-gateway/                 # FastAPI Core Gateway Engine
│   │   ├── app/
│   │   │   ├── api/v1/              # FastAPI Router endpoints
│   │   │   ├── core/                # Config, security, JWT middleware, CORS
│   │   │   ├── db/                  # Firestore Async Client & Repositories
│   │   │   ├── models/              # Pydantic schema validation models
│   │   │   ├── services/            # Core business logic services
│   │   │   └── main.py              # FastAPI ASGI entry point
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   └── ai-orchestrator/             # Gemini 3.6 Flash Medical Engine
│       ├── app/
│       │   ├── gemini_client.py     # @google/genai SDK wrapper
│       │   ├── triage_engine.py     # Urgency score calculator
│       │   ├── blood_matcher.py     # Antigen compatibility matrix
│       │   └── route_optimizer.py   # Traffic-aware routing algorithms
│       ├── Dockerfile
│       └── requirements.txt
├── functions/                       # Firebase Cloud Functions (Node.js/TS)
│   ├── src/
│   │   ├── index.ts                 # Firestore triggers & background tasks
│   │   ├── triggers/                # On Emergency Create -> Notify Hospital
│   │   └── schedulers/              # Cron jobs for inventory expiry alerts
│   └── package.json
└── infra/                           # Infrastructure as Code
    ├── firebase/                    # firestore.rules, firestore.indexes.json
    ├── docker/                      # Multi-stage container configs
    └── terraform/                   # GCP Cloud Run, Secret Manager, IAM setup
\`\`\`
`,
    codeSnippets: [
      {
        language: 'python',
        filename: 'services/api-gateway/app/main.py',
        code: `from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.routers import emergency, blood_bank, hospital, ambulance, authority
from app.core.config import settings
from app.core.security import verify_firebase_jwt

app = FastAPI(
    title="LifeLink AI Enterprise Gateway",
    version="2.4.0",
    docs_url="/api/v1/docs",
    openapi_url="/api/v1/openapi.json"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(emergency.router, prefix="/api/v1/emergency", tags=["Emergency Dispatch"])
app.include_router(blood_bank.router, prefix="/api/v1/blood-bank", tags=["Blood Logistics"])
app.include_router(hospital.router, prefix="/api/v1/hospital", tags=["Hospital Operations"])
app.include_router(ambulance.router, prefix="/api/v1/ambulance", tags=["Ambulance Telematics"])
app.include_router(authority.router, prefix="/api/v1/authority", tags=["Government Governance"])

@app.get("/healthz", tags=["System"])
async def health_check():
    return {"status": "HEALTHY", "tier": "enterprise-ready"}`
      }
    ]
  },
  {
    id: 'frontend-arch',
    number: 2,
    title: 'Frontend Architecture & PWA Client Layer',
    subtitle: 'Reactive, Resilience-First Single Page Application with Real-Time Firestore Mirroring',
    badge: 'React 19 & Tailwind',
    summary: 'Designed for sub-100ms render speeds under emergency conditions, featuring optimistic local mutations, automatic offline sync, and modular role-based layout rendering.',
    keyTakeaways: [
      'State Separation: Global UI state (Zustand) vs Remote Server Cache (TanStack Query / Firestore listeners).',
      'Geospatial Capabilities: Integrated Google Maps JavaScript API with WebSockets telemetry for live driver tracking.',
      'Accessibility & Speed: High contrast UI, touch-friendly 48px targets for paramedics on mobile tablets.'
    ],
    contentMarkdown: `
### Core Architectural Layers

1. **Presentation Layer (Components & Views)**
   - Atomic component taxonomy (Atoms, Molecules, Organisms, Templates).
   - Dynamic Layout Wrappers mapped to User Roles (\`PatientLayout\`, \`HospitalLayout\`, \`AmbulanceLayout\`).

2. **State & Synchronization Layer**
   - **Zustand Stores**: Lightweight, atomic stores for current active session, active navigation state, driver GPS coords, and UI toast alerts.
   - **Firestore Real-Time Snapshots**: Subscriptions to \`emergencies/{id}\` and \`ambulances/{id}\` collections using \`onSnapshot()\` hooks for zero-latency UI updates.

3. **Service & API Adapter Layer**
   - Centralized Axios client with automatic Firebase Auth ID token injection via request interceptors.
   - WebSockets client bridge for sub-50ms streaming telematics from moving ambulances.

4. **Resilience & Offline Triage Engine**
   - Service Worker precaching critical emergency wizard flows.
   - IndexedDB fallback for recording symptom logs offline when cellular signal drops during transit.
`,
    codeSnippets: [
      {
        language: 'typescript',
        filename: 'src/hooks/useEmergencyRealtime.ts',
        code: `import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { EmergencyRecord } from '../types';

export function useEmergencyRealtime(emergencyId: string) {
  const [data, setData] = useState<EmergencyRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!emergencyId) return;
    const unsub = onSnapshot(doc(db, 'emergencies', emergencyId), (snapshot) => {
      if (snapshot.exists()) {
        setData({ id: snapshot.id, ...snapshot.data() } as EmergencyRecord);
      }
      setLoading(false);
    }, (err) => {
      console.error("Firestore sync error:", err);
      setLoading(false);
    });
    return () => unsub();
  }, [emergencyId]);

  return { data, loading };
}`
      }
    ]
  },
  {
    id: 'backend-arch',
    number: 3,
    title: 'Backend Architecture (FastAPI & Gemini Engine)',
    subtitle: 'High-Throughput Async REST Gateway with Dedicated AI Orchestrator',
    badge: 'FastAPI & Async Engine',
    summary: 'Built on Python FastAPI with ASGI async workers (Uvicorn/Gunicorn), enforcing strict OpenAPI schemas, connection-pooled Firestore async clients, and Gemini AI prompt chains.',
    keyTakeaways: [
      'Asynchronous I/O: All route handlers use async/await for concurrency up to 10,000 requests/second.',
      'Gemini Integration: Uses the official @google/genai SDK server-side with structured JSON schema outputs.',
      'Audit Trail Middleware: Logs every state-changing mutation with cryptographic hashes for compliance.'
    ],
    contentMarkdown: `
### FastAPI Gateway + AI Microservice Design

The backend is split into two primary FastAPI runtimes:
- **API Gateway Service**: Standard CRUD, RBAC token validation, rate limiting (Redis token bucket), and audit logging.
- **AI Orchestrator Service**: Dedicated engine processing complex prompt workflows using Gemini 3.6 Flash.

\`\`\`
Client (React PWA) 
   │ (HTTPS / Bearer JWT)
   ▼
FastAPI Gateway (Uvicorn / Gunicorn)
   ├── 1. Verify Firebase Auth Token & Claims
   ├── 2. Validate Pydantic Schema
   ├── 3. Execute Async Service Logic
   ├──────► Firestore Database Async SDK (google-cloud-firestore)
   └──────► AI Orchestrator Microservice
                └── Gemini 3.6 Flash (@google/genai)
                     ├── Clinical Triage Scoring
                     ├── Blood Group Antigen Matrix
                     └── Route Optimization Algorithms
\`\`\`
`,
    codeSnippets: [
      {
        language: 'python',
        filename: 'services/ai-orchestrator/app/triage_engine.py',
        code: `from google import genai
from google.genai import types
import os, json

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

async def calculate_triage_score(symptoms: str, age: int, vitals: dict) -> dict:
    prompt = f"""
    Analyze clinical emergency parameters:
    Patient Age: {age}
    Symptoms: {symptoms}
    Vitals: {vitals}
    
    Calculate medical triage level (RED, YELLOW, GREEN, BLACK), priority score (1-100), 
    and recommended ambulance unit type (ALS vs BLS).
    """
    
    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.1
        )
    )
    return json.loads(response.text)`
      }
    ]
  },
  {
    id: 'firestore-schema',
    number: 4,
    title: 'Firestore Collections & Database Design',
    subtitle: 'NoSQL Schema Definition, Indexing Strategy, and Security Rules',
    badge: 'Firebase Firestore',
    summary: 'Normalized top-level collections for primary domain entities with embedded subcollections for real-time telemetry, backed by field-level security rules and compound query indexes.',
    keyTakeaways: [
      'Top-level collections: users, emergencies, hospitals, blood_inventories, ambulances, audit_logs, authority_alerts.',
      'Geohash indexing for sub-second spatial proximity queries on emergency locations.',
      'At-rest encryption and Firestore Security Rules enforcing role-based access control.'
    ],
    contentMarkdown: `
### Primary Collections Schema

1. **\`users\`**: User profile & assigned RBAC role.
2. **\`emergencies\`**: Active & historical emergency incidents.
3. **\`hospitals\`**: Hospital bed capacities, ICU availability, ER status.
4. **\`blood_inventories\`**: Real-time blood bank stock levels & cold chain logs.
5. **\`ambulances\`**: Live driver GPS coordinates, vehicle capabilities (ALS/BLS).
6. **\`authority_alerts\`**: Regional health alerts, disaster escalations, SLA audit trails.

### Security Rules Overview

\`\`\`
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAuthenticated() {
      return request.auth != null;
    }
    function hasRole(role) {
      return isAuthenticated() && request.auth.token.role == role;
    }

    match /emergencies/{emergencyId} {
      allow read: if isAuthenticated();
      allow create: if hasRole('PATIENT') || hasRole('AMBULANCE_DISPATCH') || hasRole('HOSPITAL_ADMIN');
      allow update: if hasRole('AMBULANCE_DISPATCH') || hasRole('HOSPITAL_ADMIN') || hasRole('GOVT_AUTHORITY');
    }

    match /blood_inventories/{itemId} {
      allow read: if isAuthenticated();
      allow write: if hasRole('BLOOD_BANK_MGR') || hasRole('GOVT_AUTHORITY');
    }
  }
}
\`\`\`
`
  },
  {
    id: 'rest-apis',
    number: 5,
    title: 'REST API Specification (OpenAPI 3.1)',
    subtitle: 'Enterprise Endpoint Specification & Payload Contracts',
    badge: 'REST & OpenAPI',
    summary: 'Standardized HTTP JSON API design adhering to REST principles, complete with request headers, error codes (RFC 7807), and role requirements.',
    keyTakeaways: [
      'All endpoints require Authorization header: Bearer <Firebase_ID_Token>.',
      'Structured responses include status, message, data, and metadata objects.',
      'Comprehensive validation error messages for missing or malformed fields.'
    ],
    contentMarkdown: `
### Endpoint Matrix Overview

| Method | Endpoint | Description | Required Role |
| :--- | :--- | :--- | :--- |
| **POST** | \`/api/v1/emergency/triage\` | Submit symptoms & trigger Gemini AI Triage | Patient / Dispatcher |
| **GET** | \`/api/v1/emergency/{id}\` | Fetch emergency incident details | All Roles |
| **GET** | \`/api/v1/hospitals/nearby\` | Query available hospital ER beds by location | Dispatcher / Patient |
| **POST** | \`/api/v1/blood-bank/match\` | Request blood group cross-matching | Hospital / Blood Bank |
| **PUT** | \`/api/v1/ambulance/telematics\` | Stream driver GPS & vehicle status | Ambulance Driver |
| **GET** | \`/api/v1/authority/compliance-report\` | Fetch regional SLA analytics & audit logs | Govt Authority |
`
  },
  {
    id: 'auth-flow',
    number: 6,
    title: 'Authentication & Security Architecture',
    subtitle: 'Firebase Auth, Custom Claims RBAC, and Token Renewal Lifecycle',
    badge: 'Firebase Auth & JWT',
    summary: 'Zero-Trust security model using Firebase Authentication with custom claims (\`role\`, \`organizationId\`, \`jurisdictionCode\`) verified on both frontend routes and backend FastAPI middleware.',
    keyTakeaways: [
      'Firebase Auth handles Identity Provider (IdP) authentication via Email/Pass, OAuth, or SAML SSO.',
      'Custom Claims injected via Firebase Admin SDK upon role approval.',
      'FastAPI verifies RS256 JWT signature against Google public keys with automatic token caching.'
    ],
    contentMarkdown: `
### Auth Sequence Lifecycle

\`\`\`
User Login (React UI) 
   │
   ├──► 1. Authenticate with Firebase Auth (Email/Pass or SSO)
   │    └── Returns Firebase ID Token (JWT) containing Custom Claims:
   │        { "uid": "usr_99", "role": "HOSPITAL_ADMIN", "orgId": "hosp_metro" }
   │
   ├──► 2. API Request to FastAPI Gateway
   │    └── Header: "Authorization: Bearer <JWT_TOKEN>"
   │
   ├──► 3. FastAPI Security Middleware
   │    ├── Download & Cache Google Public RS256 Certificates
   │    ├── Verify Token Expiry, Signature, and Issuer
   │    └── Extract User Role & Scope
   │
   └──► 4. Route Execution & Firestore Security Enforcer
\`\`\`
`
  },
  {
    id: 'user-roles',
    number: 7,
    title: 'User Roles & Role-Based Access Control (RBAC)',
    subtitle: '5 Core Stakeholder Personas & Security Matrix',
    badge: 'RBAC Matrix',
    summary: 'Granular privilege control isolating patient data, emergency actions, blood inventory management, and regional regulatory monitoring.',
    keyTakeaways: [
      'Patient: Request emergency assistance, view assigned ambulance ETA, access personal emergency record.',
      'Hospital Admin/Doctor: Manage bed capacity, accept incoming emergency triage alerts, order blood units.',
      'Blood Bank Manager: Update stock, manage cold-chain sensors, fulfill urgent blood requests.',
      'Ambulance Driver/Paramedic: Update GPS telematics, receive green-wave routes, stream patient vitals.',
      'Government Authority: Regional health monitoring, compliance audit log inspection, disaster alerts.'
    ],
    contentMarkdown: `
### Role Matrix & Privilege Overview

| Role | Emergency Create | Emergency Read | Blood Inventory Write | Hospital Capacity Write | Audit Log Read |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Patient** | ✅ (Self) | ✅ (Self) | ❌ | ❌ | ❌ |
| **Hospital Admin** | ✅ | ✅ (Assigned) | ❌ | ✅ (Own Hosp) | ❌ |
| **Blood Bank Mgr** | ❌ | ✅ | ✅ (Own Depot) | ❌ | ❌ |
| **Paramedic** | ✅ | ✅ (Active) | ❌ | ❌ | ❌ |
| **Govt Authority** | ✅ (Override) | ✅ (All) | ✅ (Audit) | ✅ (Audit) | ✅ (Full Region) |
`
  },
  {
    id: 'component-hierarchy',
    number: 8,
    title: 'Frontend Component Hierarchy & Layout Tree',
    subtitle: 'Modular Layout Architecture, Shared Controls & Visual State Mapping',
    badge: 'Component Tree',
    summary: 'A clean taxonomy of presentation components, container views, and layout wrappers enforcing single-responsibility and effortless code maintenance.',
    keyTakeaways: [
      'App Shell -> Role Guard -> Layout Container -> Feature Dashboard -> Atomic Components.',
      'Lazy loading for high-overhead components like Google Maps canvas and charting modules.',
      'Shared UI design system components wrapped with Tailwind styling utilities.'
    ],
    contentMarkdown: `
### React Component Architecture Tree

\`\`\`
App (Root Provider: Auth, QueryClient, Toast)
 ├── Header Bar (Role Switcher, Status Indicator, System Time)
 ├── Navigation Tab Controller
 └── Role Guard Router
      ├── PatientDashboard
      │    ├── EmergencyWizard
      │    │   ├── SymptomInputForm
      │    │   ├── AiTriageScoreCard
      │    │   └── LiveEtaTracker (Maps Canvas)
      │    └── PatientHistoryList
      ├── HospitalDashboard
      │    ├── BedCapacityMatrix
      │    ├── IncomingTriageAlerts
      │    └── BloodOrderModal
      ├── BloodBankDashboard
      │    ├── StockGridByGroup
      │    ├── ColdChainTempSensor
      │    └── UrgentMatchRequests
      ├── AmbulanceDashboard
      │    ├── TelematicsHud
      │    ├── GreenWaveRouteMap
      │    └── PatientVitalsStreamer
      └── AuthorityDashboard
           ├── RegionalHealthMap
           ├── SlaPerformanceChart
           └── SystemAuditLogViewer
\`\`\`
`
  },
  {
    id: 'state-management',
    number: 9,
    title: 'State Management & Real-Time Data Flow',
    subtitle: 'Dual-Layer Architecture: Local State, Global Store, and Server Cache',
    badge: 'Zustand & Real-Time',
    summary: 'Harmonious state management pattern leveraging Zustand for light client state and Firestore snapshots for live multi-actor state synchronization.',
    keyTakeaways: [
      'Zustand Stores: authStore, emergencyStore, telemetryStore, uiStore.',
      'Real-Time Engine: Firestore onSnapshot hooks subscribe to live collections.',
      'Optimistic Mutations: Client UI updates immediately while async sync runs in background.'
    ],
    contentMarkdown: `
### State Layer Architecture

1. **Client UI State (Zustand)**:
   - Holds temporary form values, current active filter tags, modal toggle states, and theme mode.
2. **Real-Time Synchronized State (Firestore Listeners)**:
   - Tracks ambulance live latitude/longitude during emergency trips.
   - Updates hospital available bed count as patients are admitted.
3. **Server Cache State (REST API Data)**:
   - Historical emergency analytics reports, government compliance export tables.
`
  },
  {
    id: 'api-flow',
    number: 10,
    title: 'API Communication Flow & Sequence Diagrams',
    subtitle: 'End-to-End Operational Workflows Across Multi-Stakeholder Boundaries',
    badge: 'Sequence Flows',
    summary: 'Comprehensive step-by-step transaction lifecycles detailing latencies, network protocols, payloads, and fallback strategies for emergency scenarios.',
    keyTakeaways: [
      'Emergency Triage & Ambulance Dispatch Flow: Sub-second triage to driver assignment.',
      'Urgent Blood Matching Flow: Cross-compatibility verification and cold-chain dispatch.',
      'Govt Escalation Flow: Regional hospital overflow trigger and emergency traffic preemption.'
    ],
    contentMarkdown: `
### Primary Sequence Workflow: Emergency Triage & Dispatch

\`\`\`
Patient UI              FastAPI Gateway            Gemini AI Engine           Firestore DB            Ambulance App
    │                         │                           │                        │                        │
    ├── 1. Submit Symptoms ──►│                           │                        │                        │
    │                         ├── 2. Calculate Triage ───►│                        │                        │
    │                         │   (Urgency Score & ALS)   │                        │                        │
    │                         │◄── 3. Return JSON ────────┤                        │                        │
    │                         │                            │                        │                        │
    │                         ├── 4. Write Emergency Record ──────────────────────►│                        │
    │                         │                            │                        │                        │
    │                         ├── 5. Query Nearest Available Ambulance ───────────►│                        │
    │                         │                                                     │                        │
    │                         ├── 6. Assign Ambulance & Trigger Push Alert ────────────────────────────────►│
    │◄── 7. Return ETA ───────┤                                                     │                        │
    │    & Driver Marker      │                                                     │                        │
\`\`\`
`
  }
];
