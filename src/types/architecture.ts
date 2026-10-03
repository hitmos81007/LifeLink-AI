export type TabType = 
  | 'doc' 
  | 'folder' 
  | 'firestore' 
  | 'api' 
  | 'roles' 
  | 'components' 
  | 'sequence' 
  | 'ai-simulator';

export type UserRole = 'PATIENT' | 'HOSPITAL_ADMIN' | 'BLOOD_BANK_MGR' | 'AMBULANCE_DISPATCH' | 'GOVT_AUTHORITY';

export interface DocSection {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  badge: string;
  summary: string;
  contentMarkdown: string;
  diagramSvgKey?: string;
  keyTakeaways: string[];
  codeSnippets?: {
    language: string;
    filename: string;
    code: string;
  }[];
}

export interface FolderNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  category: 'frontend' | 'backend' | 'database' | 'infra' | 'shared';
  description: string;
  children?: FolderNode[];
  snippet?: string;
}

export interface FirestoreField {
  name: string;
  type: string;
  required: boolean;
  description: string;
  example: string | number | boolean | object;
}

export interface FirestoreCollection {
  id: string;
  name: string;
  description: string;
  securityScope: string;
  fields: FirestoreField[];
  sampleDocument: Record<string, any>;
  indexes: {
    fields: string[];
    queryType: string;
    purpose: string;
  }[];
}

export interface ApiEndpoint {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  tag: 'Emergency' | 'Hospitals' | 'Blood Bank' | 'Ambulance' | 'Govt Authority' | 'AI Triage' | 'FastAPI ML Predictor';
  summary: string;
  description: string;
  requiredRole: UserRole[];
  requestHeaders: Record<string, string>;
  requestBodySchema?: Record<string, any>;
  sampleRequestBody?: Record<string, any>;
  sampleResponse: {
    status: number;
    body: Record<string, any>;
  };
}

export interface RoleDetail {
  id: UserRole;
  name: string;
  title: string;
  icon: string;
  color: string;
  description: string;
  permissions: {
    resource: string;
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
    scope: string;
  }[];
  customClaims: Record<string, any>;
  keyUIModules: string[];
}

export interface ComponentNode {
  id: string;
  name: string;
  layer: 'Layout' | 'Page' | 'Feature' | 'UI Component' | 'State Store';
  description: string;
  props?: string[];
  stateHooks?: string[];
  children?: ComponentNode[];
}

export interface SequenceStep {
  stepNumber: number;
  from: string;
  to: string;
  action: string;
  payload: string;
  latencyMs: number;
  type: 'auth' | 'http' | 'firestore' | 'ai' | 'websocket';
  description: string;
}

export interface SequenceWorkflow {
  id: string;
  title: string;
  description: string;
  actors: string[];
  steps: SequenceStep[];
}
