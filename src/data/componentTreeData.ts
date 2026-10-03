import { ComponentNode } from '../types/architecture';

export const COMPONENT_TREE_DATA: ComponentNode = {
  id: 'root-app',
  name: 'App',
  layer: 'Layout',
  description: 'Root React Application component containing Auth, Toast, QueryClient, and Tab State Providers.',
  stateHooks: ['useAuthSession()', 'useTabNavigation()', 'useSystemAlerts()'],
  children: [
    {
      id: 'header-bar',
      name: 'HeaderBar',
      layer: 'UI Component',
      description: 'Persistent top navigation bar with platform logo, view switcher tabs, role perspective toggle, and live clock.',
      props: ['activeTab', 'onSelectTab', 'currentRole', 'onSelectRole'],
    },
    {
      id: 'main-container',
      name: 'MainContentContainer',
      layer: 'Layout',
      description: 'Dynamic content wrapper rendering active architecture module view.',
      children: [
        {
          id: 'doc-view',
          name: 'ArchitectureDocView',
          layer: 'Page',
          description: 'Comprehensive software architecture specification document with table of contents and code previewers.',
          children: [
            { id: 'toc-nav', name: 'TableOfContents', layer: 'UI Component', description: 'Interactive section quick-jump drawer.' },
            { id: 'section-card', name: 'DocSectionCard', layer: 'Feature', description: 'Renders section text, key takeaways, diagrams, and code snippets.' }
          ]
        },
        {
          id: 'folder-view',
          name: 'FolderStructureView',
          layer: 'Page',
          description: 'Interactive directory explorer for apps, services, functions, and infra.',
          children: [
            { id: 'tree-item', name: 'FolderTreeNode', layer: 'UI Component', description: 'Collapsible folder and file row.' },
            { id: 'code-viewer', name: 'FileCodeViewer', layer: 'Feature', description: 'Displays selected source file syntax highlighting.' }
          ]
        },
        {
          id: 'firestore-view',
          name: 'FirestoreSchemaView',
          layer: 'Page',
          description: 'Visual Firestore database schema inspector & security rules runner.',
          children: [
            { id: 'collection-card', name: 'CollectionCard', layer: 'Feature', description: 'Shows fields, data types, and index configs.' },
            { id: 'rules-editor', name: 'SecurityRulesViewer', layer: 'UI Component', description: 'Renders firestore.rules code with syntax highlighting.' }
          ]
        },
        {
          id: 'api-view',
          name: 'ApiExplorerView',
          layer: 'Page',
          description: 'Interactive Swagger OpenAPI 3.1 REST endpoint tester.',
          children: [
            { id: 'endpoint-row', name: 'EndpointRow', layer: 'Feature', description: 'Collapsible REST endpoint row with test execution button.' }
          ]
        },
        {
          id: 'ai-view',
          name: 'AiSimulatorView',
          layer: 'Page',
          description: 'Live Gemini AI Triage, Blood Matching, and Traffic Dispatch sandbox.',
          stateHooks: ['useState(symptoms)', 'useMutation(triageApi)'],
          children: [
            { id: 'triage-form', name: 'TriageFormWidget', layer: 'Feature', description: 'Interactive symptom input and patient parameter controls.' },
            { id: 'ai-result', name: 'AiDiagnosisCard', layer: 'UI Component', description: 'Visual display of AI urgency score, ambulance type, and hospital care.' }
          ]
        }
      ]
    }
  ]
};
