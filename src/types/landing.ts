export type NavSection = 'home' | 'features' | 'about' | 'contact' | 'login';

export interface FeatureItem {
  id: string;
  title: string;
  category: string;
  shortDescription: string;
  fullDescription: string;
  iconName: 'Droplet' | 'Bed' | 'Ambulance' | 'Pill' | 'Activity' | 'BarChart3';
  accentColor: 'rose' | 'blue' | 'emerald' | 'purple' | 'amber' | 'indigo';
  metrics: { label: string; value: string }[];
  keyCapabilities: string[];
  sampleOutput: {
    status: string;
    detail: string;
    time: string;
  };
}

export interface ContactFormData {
  fullName: string;
  email: string;
  organization: string;
  role: string;
  phone: string;
  message: string;
  urgentInquiry: boolean;
}

export type DemoRole = 'HOSPITAL_ADMIN' | 'BLOOD_BANK' | 'DISPATCHER' | 'HEALTH_MINISTRY';

export interface DemoUser {
  role: DemoRole;
  name: string;
  org: string;
  email: string;
  badge: string;
}
