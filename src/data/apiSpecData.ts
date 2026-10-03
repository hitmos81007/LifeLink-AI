import { ApiEndpoint } from '../types/architecture';

export const REST_API_ENDPOINTS: ApiEndpoint[] = [
  {
    id: 'api-triage',
    method: 'POST',
    path: '/api/v1/emergency/triage',
    tag: 'AI Triage',
    summary: 'Clinical Triage & Emergency Assessment',
    description: 'Submits patient symptom description, age, and vitals to Gemini 3.6 Flash server-side engine for immediate clinical priority grading (RED, YELLOW, GREEN, BLACK) and ambulance recommendation.',
    requiredRole: ['PATIENT', 'AMBULANCE_DISPATCH', 'HOSPITAL_ADMIN'],
    requestHeaders: {
      'Authorization': 'Bearer <Firebase_ID_Token>',
      'Content-Type': 'application/json'
    },
    requestBodySchema: {
      symptoms: "string (Required)",
      patientAge: "number (Optional)",
      vitals: "object { heartRate, bp, oxygenSat }",
      location: "object { lat, lng }"
    },
    sampleRequestBody: {
      symptoms: "Patient experiencing sudden severe chest pain, shortness of breath, and clammy skin.",
      patientAge: 58,
      vitals: { heartRate: 118, bp: "155/95", oxygenSat: 92 },
      location: { lat: 37.7749, lng: -122.4194 }
    },
    sampleResponse: {
      status: 200,
      body: {
        success: true,
        data: {
          triageLevel: "RED",
          priorityScore: 94,
          primaryCondition: "Acute Coronary Syndrome / Suspected Myocardial Infarction",
          recommendedSpecialty: "Cardiology / Interventional Cath Lab",
          recommendedAmbulanceType: "ALS",
          estimatedHospitalCareRequired: ["ICU", "Cath Lab", "Continuous 12-lead ECG"],
          reasoningSummary: "Critical triage assigned due to acute chest discomfort with hypoxia and tachycardia.",
          targetSpecialistAlert: true
        }
      }
    }
  },
  {
    id: 'api-blood-match',
    method: 'POST',
    path: '/api/v1/blood-bank/match',
    tag: 'Blood Bank',
    summary: 'Cross-Match Blood Group & Optimize Allocation',
    description: 'Evaluates recipient ABO/Rh blood type, computes alternative universal donor compatibility, and selects optimal blood banks based on stock, distance, and cold chain validity.',
    requiredRole: ['HOSPITAL_ADMIN', 'BLOOD_BANK_MGR', 'GOVT_AUTHORITY'],
    requestHeaders: {
      'Authorization': 'Bearer <Firebase_ID_Token>',
      'Content-Type': 'application/json'
    },
    requestBodySchema: {
      recipientBloodType: "string (e.g., O-, A+, AB-)",
      requiredUnits: "number",
      urgency: "CRITICAL | HIGH | ROUTINE",
      nearbyBloodBanks: "array"
    },
    sampleRequestBody: {
      recipientBloodType: "AB-",
      requiredUnits: 3,
      urgency: "CRITICAL"
    },
    sampleResponse: {
      status: 200,
      body: {
        success: true,
        data: {
          recipientType: "AB-",
          exactMatchAvailable: true,
          compatibleAlternativeTypes: ["O-", "A-", "B-", "AB-"],
          recommendedSources: [
            {
              bloodBankId: "bb_central_01",
              bloodBankName: "Metro Central Blood Reserve",
              allocatedUnits: 3,
              distanceKm: 3.8,
              etaMinutes: 9,
              compatibilityGrade: "EXACT_MATCH_100"
            }
          ],
          coldChainTempWarning: false,
          dispatchRecommendation: "Immediate dispatch via priority express vehicle with cold-chain lockbox."
        }
      }
    }
  },
  {
    id: 'api-dispatch-route',
    method: 'POST',
    path: '/api/v1/ambulance/route-optimize',
    tag: 'Ambulance',
    summary: 'Traffic Preemption & Dynamic Route Calculation',
    description: 'Generates green-wave traffic signal preemption sequences and optimized emergency navigation paths around congested urban zones.',
    requiredRole: ['AMBULANCE_DISPATCH', 'GOVT_AUTHORITY'],
    requestHeaders: {
      'Authorization': 'Bearer <Firebase_ID_Token>',
      'Content-Type': 'application/json'
    },
    sampleRequestBody: {
      origin: "Paramedic Depot Station 4",
      destination: "Metro General Hospital ER",
      emergencyLevel: "RED",
      trafficConditions: "HEAVY_RUSH_HOUR"
    },
    sampleResponse: {
      status: 200,
      body: {
        success: true,
        data: {
          optimalPathName: "High-Speed Expressway 101 -> Transit Bypass Gate 2",
          estimatedStandardETA: 26,
          estimatedEmergencyETA: 11,
          timeSavedMinutes: 15,
          trafficLightPreemptionSequence: ["INT_4TH_ST", "INT_MISSION_BLVD", "INT_HOSPITAL_RAMP"],
          hazardWarnings: ["Roadwork near 5th St - Diverted via Bay Bridge Ramp"],
          alternativeHelipadOption: false
        }
      }
    }
  },
  {
    id: 'api-hospitals-capacity',
    method: 'GET',
    path: '/api/v1/hospitals/capacity',
    tag: 'Hospitals',
    summary: 'Fetch Live Regional Hospital Capacity & Divert Status',
    description: 'Retrieves active ICU bed counts, ER room occupancy rates, trauma level ratings, and divert statuses for all registered regional medical centers.',
    requiredRole: ['PATIENT', 'HOSPITAL_ADMIN', 'BLOOD_BANK_MGR', 'AMBULANCE_DISPATCH', 'GOVT_AUTHORITY'],
    requestHeaders: {
      'Authorization': 'Bearer <Firebase_ID_Token>'
    },
    sampleResponse: {
      status: 200,
      body: {
        status: "success",
        hospitals: [
          { id: "hosp_metro_gen", name: "Metro General Trauma Center", traumaLevel: 1, icuBedsAvailable: 4, erCapacityPct: 82, status: "OPEN" },
          { id: "hosp_st_jude", name: "St. Jude Medical Center", traumaLevel: 2, icuBedsAvailable: 1, erCapacityPct: 95, status: "DIVERT_NEAR_CAPACITY" },
          { id: "hosp_kaiser_sf", name: "Kaiser Permanente SF", traumaLevel: 1, icuBedsAvailable: 12, erCapacityPct: 45, status: "OPEN" }
        ]
      }
    }
  },
  {
    id: 'api-authority-report',
    method: 'GET',
    path: '/api/v1/authority/compliance-report',
    tag: 'Govt Authority',
    summary: 'Generate Regional SLA Compliance & Audit Report',
    description: 'Compiles response time SLAs, emergency dispatch metrics, cold-chain compliance flags, and immutable audit logs for regulatory oversight.',
    requiredRole: ['GOVT_AUTHORITY'],
    requestHeaders: {
      'Authorization': 'Bearer <Firebase_ID_Token>'
    },
    sampleResponse: {
      status: 200,
      body: {
        status: "success",
        reportPeriod: "LAST_24_HOURS",
        jurisdiction: "San Francisco Metropolitan Region",
        totalEmergenciesHandled: 142,
        averageTriageToDispatchSeconds: 42,
        averageAmbulanceArrivalMinutes: 7.4,
        slaComplianceRatePct: 98.6,
        coldChainViolationsDetected: 0,
        divertOverridesTriggered: 1
      }
    }
  },
  {
    id: 'api-recommend-hospital',
    method: 'POST',
    path: '/recommend/hospital',
    tag: 'FastAPI ML Predictor',
    summary: 'AI Emergency Hospital Allocation & Recommendation Engine',
    description: 'Evaluates patient location, blood type, ICU beds, ambulance units, oxygen, and medicines to output recommended hospital, distance, ETA, stock matching, and AI rationale.',
    requiredRole: ['AMBULANCE_DISPATCH', 'HOSPITAL_ADMIN', 'GOVT_AUTHORITY'],
    requestHeaders: {
      'Content-Type': 'application/json'
    },
    sampleRequestBody: {
      patient_location: "Downtown Central - Sector 4",
      blood_type: "O-",
      need_icu: true,
      need_ambulance: true,
      need_oxygen: true,
      need_medicines: ["Amoxicillin 500mg", "Epinephrine 1mg"]
    },
    sampleResponse: {
      status: 200,
      body: {
        success: true,
        model_info: {
          name: "LifeLink AI Hospital Allocation & Recommendation Engine",
          algorithm: "XGBoostMultiCriteriaOptimization",
          version: "2.1.0-fastapi"
        },
        inputs: {
          patient_location: "Downtown Central - Sector 4",
          blood_type: "O-",
          need_icu: true,
          need_ambulance: true,
          need_oxygen: true,
          need_medicines: ["Amoxicillin 500mg", "Epinephrine 1mg"]
        },
        output: {
          recommended_hospital: "Metro Trauma & Critical Care Center",
          distance_km: 3.2,
          eta_minutes: 7,
          available_blood_units: 18,
          icu_beds_available: 6,
          ambulance_available_units: 3,
          oxygen_supply_hours: 72,
          match_score: 98.4,
          reason_for_recommendation: "Metro Trauma & Critical Care Center is recommended for patient at Downtown Central - Sector 4. It offers the shortest response time (3.2 km, 7 min ETA) with 18 units of O- blood available, 6 open ICU beds, 3 active ambulance units, and 72h oxygen reserve."
        }
      }
    }
  },
  {
    id: 'api-predict-blood',
    method: 'POST',
    path: '/predict/blood',
    tag: 'FastAPI ML Predictor',
    summary: 'Predict Blood Supply Shortage Risk & Depletion Days',
    description: 'XGBoost classifier endpoint evaluating current stock, daily burn rate, trauma surge index, and donor drives to predict depletion days and shortage risk.',
    requiredRole: ['HOSPITAL_ADMIN', 'BLOOD_BANK_MGR', 'GOVT_AUTHORITY'],
    requestHeaders: {
      'Content-Type': 'application/json'
    },
    sampleRequestBody: {
      blood_type: "O-",
      current_stock_units: 18,
      daily_burn_rate: 5.5,
      trauma_surge_index: 1.2,
      scheduled_donor_drives: 1,
      cold_chain_loss_pct: 0.02
    },
    sampleResponse: {
      status: 200,
      body: {
        success: true,
        model_info: {
          name: "LifeLink Universal Blood Supply Shortage Predictor",
          algorithm: "XGBoostClassifier",
          version: "2.1.0-xgboost-architecture"
        },
        prediction: {
          blood_type: "O-",
          shortage_risk_score: 0.84,
          shortage_risk_level: "CRITICAL",
          predicted_depletion_days: 2.4,
          recommended_reorder_units: 45,
          confidence: 0.93
        },
        feature_importances: {
          current_stock_units: 0.38,
          daily_burn_rate: 0.26,
          trauma_surge_index: 0.18,
          blood_type_rarity_score: 0.11,
          scheduled_donor_drives: 0.05
        }
      }
    }
  },
  {
    id: 'api-predict-icu',
    method: 'POST',
    path: '/predict/icu',
    tag: 'FastAPI ML Predictor',
    summary: 'Predict ICU Bed Occupancy & Hospital Divert Risk',
    description: 'XGBoost regressor predicting 24h & 48h ICU occupancy percentages, bed shortage counts, and divert triggers.',
    requiredRole: ['HOSPITAL_ADMIN', 'AMBULANCE_DISPATCH', 'GOVT_AUTHORITY'],
    requestHeaders: {
      'Content-Type': 'application/json'
    },
    sampleRequestBody: {
      total_beds: 50,
      current_beds_occupied: 42,
      er_admissions_24h: 18,
      planned_surgeries_24h: 6,
      respiratory_epidemic_index: 1.3
    },
    sampleResponse: {
      status: 200,
      body: {
        success: true,
        model_info: {
          name: "LifeLink ICU Bed Occupancy & Surge Capacity Forecast Engine",
          algorithm: "XGBoostRegressor",
          version: "2.1.0-xgboost-architecture"
        },
        prediction: {
          total_icu_capacity: 50,
          current_occupied: 42,
          predicted_occupancy_pct_24h: 92.5,
          predicted_occupancy_pct_48h: 96.8,
          expected_bed_shortage_count: 4,
          surge_status: "HIGH_SURGE_WARNING",
          recommended_divert: true,
          confidence: 0.91
        },
        feature_importances: {
          er_admissions_24h: 0.36,
          respiratory_epidemic_index: 0.27,
          current_beds_occupied: 0.18,
          planned_surgeries_24h: 0.11
        }
      }
    }
  },
  {
    id: 'api-predict-medicine',
    method: 'POST',
    path: '/predict/medicine',
    tag: 'FastAPI ML Predictor',
    summary: 'Predict Pharmaceutical Stockout & Reorder Date',
    description: 'XGBoost inventory model determining stockout probabilities, optimal reorder dates, and safety thresholds.',
    requiredRole: ['HOSPITAL_ADMIN', 'GOVT_AUTHORITY'],
    requestHeaders: {
      'Content-Type': 'application/json'
    },
    sampleRequestBody: {
      medicine_name: "Amoxicillin 500mg",
      current_stock_units: 250,
      daily_burn_rate: 35,
      supplier_lead_days: 4,
      seasonality_surge_factor: 1.25
    },
    sampleResponse: {
      status: 200,
      body: {
        success: true,
        model_info: {
          name: "LifeLink Pharmaceutical Inventory & Out-of-Stock Predictor",
          algorithm: "XGBoostRegressor",
          version: "2.1.0-xgboost-architecture"
        },
        prediction: {
          medicine_name: "Amoxicillin 500mg",
          current_stock_units: 250,
          days_until_stockout: 5.7,
          stockout_probability_30d: 0.81,
          recommended_reorder_quantity: 600,
          optimal_reorder_date: "2026-07-24",
          confidence: 0.94
        },
        feature_importances: {
          daily_burn_rate: 0.42,
          seasonality_surge_factor: 0.28,
          supplier_lead_days: 0.16,
          current_stock_units: 0.14
        }
      }
    }
  },
  {
    id: 'api-predict-ambulance',
    method: 'POST',
    path: '/predict/ambulance',
    tag: 'FastAPI ML Predictor',
    summary: 'Predict Emergency Ambulance Dispatch ETA & Preemption',
    description: 'XGBoost travel time model predicting emergency transport ETA and signal preemption time savings.',
    requiredRole: ['AMBULANCE_DISPATCH', 'GOVT_AUTHORITY'],
    requestHeaders: {
      'Content-Type': 'application/json'
    },
    sampleRequestBody: {
      distance_km: 8.5,
      traffic_congestion_index: 1.6,
      emergency_priority_level: "RED_CRITICAL",
      peak_hour_flag: true
    },
    sampleResponse: {
      status: 200,
      body: {
        success: true,
        model_info: {
          name: "LifeLink Emergency Ambulance Dispatch & Traffic Preemption Predictor",
          algorithm: "XGBoostRegressor",
          version: "2.1.0-xgboost-architecture"
        },
        prediction: {
          distance_km: 8.5,
          emergency_priority: "RED_CRITICAL",
          predicted_standard_eta_minutes: 22.4,
          predicted_preemption_eta_minutes: 9.8,
          time_saved_minutes: 12.6,
          signal_preemption_required: true,
          confidence: 0.92
        },
        feature_importances: {
          traffic_congestion_index: 0.44,
          distance_km: 0.28,
          peak_hour_flag: 0.14,
          emergency_priority_level: 0.14
        }
      }
    }
  }
];
