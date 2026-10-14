import { FeatureItem } from '../types/landing';

export const FEATURE_CARDS_DATA: FeatureItem[] = [
  {
    id: 'blood-intelligence',
    title: 'Blood Intelligence',
    category: 'Blood Inventory',
    shortDescription: 'Role-scoped blood inventory records and authorized stock updates.',
    fullDescription: 'This prototype demonstrates selected blood inventory and request workflows using synthetic records. It does not connect regional blood banks, automate clinical compatibility decisions, or arrange delivery.',
    iconName: 'Droplet',
    accentColor: 'rose',
    metrics: [
      { label: 'Cross-Match Speed', value: 'Not measured' },
      { label: 'Wastage Reduction', value: 'Not measured' },
      { label: 'Connected Banks', value: 'Not connected' }
    ],
    keyCapabilities: [
      'View blood inventory visible to the signed-in account',
      'Authorized blood-bank users can update stock records',
      'Blood group and stock quantities are stored in Supabase',
      'No compatibility decision, reservation, donor alert, or delivery is performed'
    ],
    sampleOutput: {
      status: 'ILLUSTRATIVE MATCH',
      detail: 'A synthetic inventory record can be reviewed by an authorized user. No units are reserved and no delivery is arranged.',
      time: 'No ETA provided'
    }
  },
  {
    id: 'icu-availability',
    title: 'ICU Availability',
    category: 'Critical Bed Management',
    shortDescription: 'Hospital inventory records, approval workflows, and synthetic request review.',
    fullDescription: 'The prototype can demonstrate selected resource workflows with synthetic records. It is not connected to EHRs or bedside sensors and does not make admissions decisions.',
    iconName: 'Bed',
    accentColor: 'blue',
    metrics: [
      { label: 'Bed Sync Frequency', value: 'Not connected' },
      { label: 'Transfer Delay Saved', value: 'Not measured' },
      { label: 'Ventilator Tracking', value: 'Not connected' }
    ],
    keyCapabilities: [
      'Hospital staff can maintain ICU, general-bed, oxygen, and medicine inventory records',
      'Hospital resource transfers require the configured approval workflow',
      'Authorized clinicians can review synthetic emergency requests',
      'No EHR, bedside-sensor, ventilator, or admission system is connected'
    ],
    sampleOutput: {
      status: 'ILLUSTRATIVE CAPACITY',
      detail: 'A prototype inventory workflow can display capacity records. No admission or bed reservation occurs in this example.',
      time: 'No live bed feed'
    }
  },
  {
    id: 'ambulance-coordination',
    title: 'Ambulance Coordination',
    category: 'Fleet Management',
    shortDescription: 'Fleet records and status management for authorized provider accounts.',
    fullDescription: 'Routing and dispatch integrations are roadmap concepts. This prototype does not contact emergency services, control traffic signals, or stream responder or patient telemetry.',
    iconName: 'Ambulance',
    accentColor: 'emerald',
    metrics: [
      { label: 'Avg Arrival Time', value: 'Not measured' },
      { label: 'Traffic Light Preemption', value: 'Not connected' },
      { label: 'Live Vitals Stream', value: 'Not connected' }
    ],
    keyCapabilities: [
      'Authorized ambulance providers can maintain fleet records and status',
      'Location fields are records, not live GPS tracking',
      'Recommendations do not assign or dispatch a vehicle',
      'No traffic-signal, paramedic telemetry, or helicopter integration exists'
    ],
    sampleOutput: {
      status: 'PLANNED INTEGRATION',
      detail: 'Traffic routing is a product concept only. The prototype does not contact ambulances or control traffic signals.',
      time: 'No live routing'
    }
  },
  {
    id: 'medicine-intelligence',
    title: 'Medicine Intelligence',
    category: 'Medicine Inventory',
    shortDescription: 'Hospital medicine stock records for authorized inventory users.',
    fullDescription: 'Medicine inventory examples use prototype records. The app does not maintain a verified regional registry, provide medication advice, or arrange delivery.',
    iconName: 'Pill',
    accentColor: 'amber',
    metrics: [
      { label: 'Locate Antidote Time', value: 'Not measured' },
      { label: 'Stockout Prevention', value: 'Not measured' },
      { label: 'Pharmacies Synced', value: 'Not connected' }
    ],
    keyCapabilities: [
      'Authorized hospital users can maintain medicine stock records',
      'Inventory records include category, unit, and optional expiry date',
      'No medication recommendations, dosage guidance, or delivery is provided',
      'No counterfeit or cold-chain monitoring is connected'
    ],
    sampleOutput: {
      status: 'ILLUSTRATIVE INVENTORY',
      detail: 'Synthetic medicine inventory may be explored as a future workflow. This prototype does not provide medication advice or delivery.',
      time: 'No delivery estimate'
    }
  },
  {
    id: 'disease-outbreak-prediction',
    title: 'Disease Trend Early-Warning Demo',
    category: 'Synthetic Public Health Demonstration',
    shortDescription: 'A threshold-based signal over generated aggregate trends, for demonstration only.',
    fullDescription: 'The district dashboard compares a synthetic 7-day case-count window with a synthetic 21-day baseline. It demonstrates an early-warning signal only; no live surveillance feed, outbreak diagnosis, or public-health alert is provided.',
    iconName: 'Activity',
    accentColor: 'purple',
    metrics: [
      { label: 'Comparison Window', value: '7 days vs 21 days' },
      { label: 'Signal Method', value: 'Threshold-based demo' },
      { label: 'Source', value: 'Synthetic aggregates' }
    ],
    keyCapabilities: [
      'Risk tier and count change are explained from the displayed windows',
      'Synthetic admissions and oxygen-use proxies are shown as context',
      'Stale data and insufficient history are called out explicitly',
      'Official public-health confirmation is required; no alerts are sent'
    ],
    sampleOutput: {
      status: 'SYNTHETIC EARLY-WARNING DEMO',
      detail: 'A synthetic trend can show normal, watch, elevated, or insufficient-data status; it is not an outbreak diagnosis.',
      time: 'Updated when demo data is generated'
    }
  },
  {
    id: 'emergency-analytics',
    title: 'Emergency Analytics',
    category: 'Executive Resource Dashboard',
    shortDescription: 'Prototype views of records currently visible to an authorized account.',
    fullDescription: 'Available dashboard counts are limited to records visible through the current Supabase role. The prototype does not calculate mortality reduction, certify compliance, or represent regional coverage.',
    iconName: 'BarChart3',
    accentColor: 'indigo',
    metrics: [
      { label: 'Data Points / Day', value: 'Not measured' },
      { label: 'Compliance Audit', value: 'Not certified' },
      { label: 'Report Generation', value: 'Prototype only' }
    ],
    keyCapabilities: [
      'View counts from records accessible to the signed-in Supabase role',
      'District dashboard summarizes current database records',
      'No HL7/FHIR export or external EHR connection is configured',
      'No clinical outcomes, response SLAs, or lives-saved metrics are measured'
    ],
    sampleOutput: {
      status: 'PROTOTYPE ANALYTICS',
      detail: 'Available metrics reflect records visible to the signed-in Supabase account; no outcomes or lives-saved claims are calculated.',
      time: 'Current records only'
    }
  }
];
