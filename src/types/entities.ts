export interface BloodInventory {
  id: string;
  bloodBankId?: string;
  bloodBankName?: string;
  bloodType: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  unitsAvailable: number;
  location?: string;
  status: 'SURPLUS' | 'ADEQUATE' | 'LOW' | 'CRITICAL' | 'EMPTY';
  lastUpdated?: string;
}

export interface BloodBank {
  id: string;
  name: string;
  location: string;
  contact: string;
  availableTypes: string[];
  totalUnits: number;
  status: 'OPERATIONAL' | 'LIMITED' | 'CRITICAL';
  lat: number;
  lng: number;
}

export interface BloodRequest {
  id: string;
  patientName: string;
  hospitalName: string;
  bloodGroup: string;
  unitsRequired: number;
  priority: 'CRITICAL' | 'URGENT' | 'STANDARD';
  status: 'PENDING' | 'APPROVED' | 'DISPATCHED' | 'FULFILLED' | 'REJECTED';
  requestedAt: string;
  eta?: string;
  requester?: string;
  doctorName?: string;
}

export interface BloodBatch {
  id: string;
  donorId: string;
  type: string;
  component: 'Whole Blood' | 'Packed Red Blood Cells' | 'Fresh Frozen Plasma' | 'Platelets';
  volumeMl: number;
  collectionDate: string;
  expiryDate: string;
  daysRemaining: number;
  location: string;
  status: 'TESTED & CLEAR' | 'QUARANTINED' | 'EXPIRING SOON' | 'EXPIRED';
}

export interface DonorCampaign {
  id: string;
  title: string;
  targetBloodGroup: string;
  location: string;
  date: string;
  notifiedDonorsCount: number;
  status: 'ACTIVE' | 'SCHEDULED' | 'COMPLETED';
}

export interface Hospital {
  id: string;
  name: string;
  licenseNo: string;
  address: string;
  phone: string;
  totalBeds: number;
  availableIcuBeds: number;
  totalIcuBeds: number;
  oxygenLevel: number;
  lat: number;
  lng: number;
  distanceKm: number;
  status: 'OPTIMAL' | 'HIGH LOAD' | 'CRITICAL SURGE' | 'FULL';
  emergencyContact?: string;
  specialities?: string[];
}

export interface ICUBed {
  id: string;
  bedNumber?: string;
  bay: string;
  patientName: string;
  ventAttached: boolean;
  status: 'OCCUPIED' | 'AVAILABLE' | 'RESERVED_EMS' | 'MAINTENANCE';
  doctorInCharge: string;
}

export interface MedicineStock {
  id: string;
  name: string;
  category: string;
  stockQuantity: number;
  reorderLevel: number;
  price: string;
  status: 'IN STOCK' | 'LOW STOCK' | 'OUT OF STOCK';
}

export interface OxygenStock {
  id: string;
  lmoTankPercent: number;
  dTypeCylinders: number;
  bTypeCylinders: number;
  concentratorsCount: number;
  status: 'OPTIMAL' | 'MODERATE' | 'CRITICAL';
  lastRefilled: string;
}

export interface HospitalResource {
  id: string;
  name: string;
  category: string;
  total: number;
  inUse: number;
  status: 'OPTIMAL' | 'READY' | 'HIGH LOAD' | 'MAINTENANCE';
  nextMaintenance: string;
}

export interface RequisitionOrder {
  id: string;
  item: string;
  target: string;
  priority: 'CRITICAL' | 'URGENT' | 'STANDARD';
  status: 'IN TRANSIT' | 'DISPATCHED' | 'PENDING' | 'FULFILLED';
  eta: string;
  createdAt: string;
}

export interface Ambulance {
  id: string;
  callSign: string;
  driverName: string;
  phone: string;
  vehicleType: 'Advanced Life Support (ALS)' | 'Basic Life Support (BLS)' | 'Mobile ICU (MICU)';
  status: 'AVAILABLE' | 'EN ROUTE TO SCENE' | 'TRANSPORTING' | 'MAINTENANCE';
  currentLat: number;
  currentLng: number;
  speed: number;
  batteryFuelLevel: number;
  location: string;
}

export interface VehicleUnit {
  id: string;
  callSign: string;
  type: 'Advanced Life Support (ALS)' | 'Basic Life Support (BLS)' | 'Mobile ICU (MICU)';
  status: 'AVAILABLE' | 'EN ROUTE TO SCENE' | 'TRANSPORTING' | 'MAINTENANCE';
  driver: string;
  paramedic: string;
  fuelLevel: number;
  oxygenLevel: number;
  location: string;
  etaMinutes: number | null;
  currentHospital: string | null;
}

export interface DispatchTrip {
  id: string;
  ambulanceId: string;
  callSign: string;
  patientName: string;
  pickupLocation: string;
  destinationHospital: string;
  eta: string;
  vitals: string;
  corridorStatus: 'ACTIVE' | 'STANDBY' | 'COMPLETED';
  priority: 'CRITICAL' | 'URGENT' | 'STANDARD';
  startTime: string;
}

export interface GreenCorridorRoute {
  id: string;
  routeName: string;
  intersectionsOverridden: number;
  activeSegment: string;
  distanceKm: number;
  status: 'ACTIVE' | 'STANDBY' | 'INACTIVE';
  etaMinutes: number;
}

export interface EmergencyCall {
  id: string;
  patientName: string;
  location: string;
  triageReason: string;
  priority: 'CRITICAL (P1)' | 'URGENT (P2)' | 'NON-EMERGENCY (P3)';
  timestamp: string;
  assignedUnit: string | null;
  hospitalDestination: string;
  status: 'QUEUED' | 'DISPATCHED' | 'ARRIVED';
}

export interface BedPrediction {
  id: string;
  hospitalId: string;
  timestamp: string;
  predictedSurgePercent: number;
  expectedICUDemand: number;
  recommendedAction: string;
  confidenceScore: number;
}

export interface DemandForecast {
  id: string;
  region: string;
  timeframe: string;
  forecastType: string;
  predictedCases: number;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
}

export interface MLPredictionResult {
  id: string;
  inputFeatures: Record<string, any>;
  predictedVal: number;
  classLabel: string;
  confidence: number;
  explanation: string;
  timestamp: string;
}

export interface HospitalRecommendation {
  hospitalId: string;
  hospitalName: string;
  matchScore: number;
  distanceKm: number;
  bedAvailability: string;
  specialities: string[];
  travelTimeMinutes: number;
  address?: string;
  phone?: string;
}

export interface DistrictInfo {
  id: string;
  name: string;
  population: string;
  hospitalsCount: number;
  readinessScore: number;
  icuOccupancy: number;
  bloodStockStatus: 'OPTIMAL' | 'MODERATE' | 'LOW' | 'CRITICAL';
  medicineVulnerability: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  outbreakRisk: 'MINIMAL' | 'ELEVATED' | 'HIGH' | 'SEVERE';
  activeAmbulances: number;
  totalBeds: number;
  occupiedBeds: number;
}

export interface MunicipalAlert {
  id: string;
  title: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  region: string;
  description: string;
  timestamp: string;
  status: 'ACTIVE' | 'RESOLVED';
}

export interface ComplianceReport {
  id: string;
  facilityName: string;
  facilityType: string;
  complianceScore: number;
  auditStatus: 'PASSED' | 'PENDING' | 'NEEDS REVIEW';
  lastInspected: string;
}

export interface AnalyticsSummary {
  totalIncidents: number;
  averageResponseTimeMinutes: number;
  livesSaved: number;
  icuOccupancyRate: number;
  bloodFulfillmentRate: number;
  systemUptimePercent: number;
  resourceHealthScore: number;
}

export interface TimeSeriesPoint {
  period?: string;
  timestamp?: string;
  demand?: number;
  supply?: number;
  value?: number;
  label?: string;
  category?: string;
  [key: string]: any;
}

export interface ResourceUtilizationData {
  category: string;
  score?: number;
  used: number;
  total: number;
  percentage: number;
  fill?: string;
}
