/**
 * LifeLink AI - XGBoost & ML Model Prediction Architecture
 * 
 * Modular architecture for machine learning prediction engines.
 * Contains dummy XGBoost-compatible models for:
 * 1. Blood Shortage Risk Prediction (/predict/blood)
 * 2. ICU Bed Occupancy & Capacity Forecast (/predict/icu)
 * 3. Medicine Inventory Reorder Optimization (/predict/medicine)
 * 4. Ambulance Dispatch & Preemption ETA Prediction (/predict/ambulance)
 * 
 * Designed for direct drop-in replacement with trained Python XGBoost models (.json / .model / ONNX runtime).
 */

export interface ModelMetadata {
  model_id: string;
  name: string;
  framework: string;
  algorithm: 'XGBoostClassifier' | 'XGBoostRegressor';
  version: string;
  hyperparameters: {
    n_estimators: number;
    max_depth: number;
    learning_rate: number;
    subsample: number;
    colsample_bytree: number;
    objective: string;
  };
  features: string[];
  last_trained_timestamp: string;
  architecture_status: 'ACTIVE_DUMMY_FALLBACK' | 'READY_FOR_XGBOOST_C_API' | 'LOADED_FROM_ARTIFACT';
}

export interface FeatureImportance {
  [feature_name: string]: number; // Gain / SHAP score relative weight (0.0 to 1.0)
}

// ============================================================================
// 1. Blood Shortage Risk Model (/predict/blood)
// ============================================================================
export class XGBoostBloodShortagePredictor {
  public static getMetadata(): ModelMetadata {
    return {
      model_id: "xgb_blood_shortage_v2",
      name: "LifeLink Universal Blood Supply Shortage Predictor",
      framework: "XGBoost 2.0.3 / Python FastAPI Bridge",
      algorithm: "XGBoostClassifier",
      version: "2.1.0-xgboost-architecture",
      hyperparameters: {
        n_estimators: 150,
        max_depth: 6,
        learning_rate: 0.05,
        subsample: 0.85,
        colsample_bytree: 0.8,
        objective: "binary:logistic"
      },
      features: [
        "current_stock_units",
        "daily_burn_rate",
        "trauma_surge_index",
        "scheduled_donor_drives",
        "cold_chain_loss_pct",
        "blood_type_rarity_score"
      ],
      last_trained_timestamp: new Date().toISOString(),
      architecture_status: "ACTIVE_DUMMY_FALLBACK"
    };
  }

  public static predict(input: any) {
    const currentStock = Number(input.current_stock_units ?? input.current_stock ?? 18);
    const dailyBurn = Number(input.daily_burn_rate ?? input.daily_usage_rate ?? 5.5);
    const surgeIndex = Number(input.trauma_surge_index ?? input.surge_factor ?? 1.2);
    const donorDrives = Number(input.scheduled_donor_drives ?? 1);
    const bloodType = String(input.blood_type ?? "O-").toUpperCase();

    // Rarity multiplier (O- is rarest emergency donor)
    const rarityMap: Record<string, number> = {
      "O-": 2.2,
      "AB-": 1.9,
      "B-": 1.6,
      "A-": 1.4,
      "O+": 1.1,
      "A+": 1.0,
      "B+": 1.0,
      "AB+": 0.8
    };
    const rarityScore = rarityMap[bloodType] || 1.2;

    const netDailyBurn = dailyBurn * surgeIndex;
    const daysToDepletion = Math.max(0.2, Number((currentStock / Math.max(0.1, netDailyBurn)).toFixed(1)));
    
    // Risk score calculation based on days left and rarity
    let shortageRiskScore = Math.min(0.99, Math.max(0.05, (10 - daysToDepletion * 1.5) / 10 * (rarityScore / 1.5)));
    if (donorDrives > 2) shortageRiskScore = Math.max(0.1, shortageRiskScore - 0.25);

    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (shortageRiskScore > 0.80) riskLevel = 'CRITICAL';
    else if (shortageRiskScore > 0.60) riskLevel = 'HIGH';
    else if (shortageRiskScore > 0.35) riskLevel = 'MEDIUM';

    const recommendedUnitsToOrder = Math.max(10, Math.round((dailyBurn * 14 - currentStock) * surgeIndex));

    const featureImportances: FeatureImportance = {
      "current_stock_units": 0.38,
      "daily_burn_rate": 0.26,
      "trauma_surge_index": 0.18,
      "blood_type_rarity_score": 0.11,
      "scheduled_donor_drives": 0.05,
      "cold_chain_loss_pct": 0.02
    };

    return {
      success: true,
      model_info: this.getMetadata(),
      prediction: {
        blood_type: bloodType,
        shortage_risk_score: Number(shortageRiskScore.toFixed(3)),
        shortage_risk_level: riskLevel,
        predicted_depletion_days: daysToDepletion,
        recommended_reorder_units: recommendedUnitsToOrder,
        safety_threshold_units: Math.round(dailyBurn * 7),
        confidence: 0.93,
        action_directive: riskLevel === 'CRITICAL' 
          ? "CRITICAL ALERT: Trigger immediate regional donor SMS alert & inter-hospital O-ve transfer protocol."
          : riskLevel === 'HIGH'
          ? "HIGH WARNING: Schedule emergency blood drive & restrict non-urgent elective surgeries."
          : "STABLE: Inventory levels sufficient for normal operating parameters."
      },
      feature_importances: featureImportances,
      timestamp: new Date().toISOString()
    };
  }
}

// ============================================================================
// 2. ICU Bed Occupancy Model (/predict/icu)
// ============================================================================
export class XGBoostICUOccupancyPredictor {
  public static getMetadata(): ModelMetadata {
    return {
      model_id: "xgb_icu_capacity_v3",
      name: "LifeLink ICU Occupancy & Surge Capacity Forecast Engine",
      framework: "XGBoost 2.0.3 / Python FastAPI Bridge",
      algorithm: "XGBoostRegressor",
      version: "2.1.0-xgboost-architecture",
      hyperparameters: {
        n_estimators: 200,
        max_depth: 7,
        learning_rate: 0.03,
        subsample: 0.9,
        colsample_bytree: 0.85,
        objective: "reg:squarederror"
      },
      features: [
        "current_beds_occupied",
        "total_beds",
        "er_admissions_24h",
        "planned_surgeries_24h",
        "respiratory_epidemic_index",
        "average_length_of_stay_days"
      ],
      last_trained_timestamp: new Date().toISOString(),
      architecture_status: "ACTIVE_DUMMY_FALLBACK"
    };
  }

  public static predict(input: any) {
    const totalBeds = Number(input.total_beds ?? 50);
    const currentOccupied = Number(input.current_beds_occupied ?? input.current_icu_beds_occupied ?? 42);
    const erAdmissions = Number(input.er_admissions_24h ?? 18);
    const plannedSurgeries = Number(input.planned_surgeries_24h ?? 6);
    const epidemicIndex = Number(input.respiratory_epidemic_index ?? 1.3);

    const currentPct = (currentOccupied / totalBeds) * 100;
    const projectedAdmissions24h = Math.round((erAdmissions * 0.35 + plannedSurgeries * 0.6) * epidemicIndex);
    const estimatedDischarges24h = Math.round(currentOccupied * 0.18);

    const netOccupied24h = Math.min(totalBeds + 8, currentOccupied + projectedAdmissions24h - estimatedDischarges24h);
    const predictedPct24h = Number(Math.min(100, Math.max(10, (netOccupied24h / totalBeds) * 100)).toFixed(1));
    const predictedPct48h = Number(Math.min(100, Math.max(10, predictedPct24h * 1.04)).toFixed(1));

    const expectedBedShortageCount = Math.max(0, netOccupied24h - totalBeds);
    
    let surgeStatus: 'NORMAL' | 'ELEVATED' | 'HIGH_SURGE_WARNING' | 'CRITICAL_OVERFLOW' = 'NORMAL';
    if (predictedPct24h >= 95) surgeStatus = 'CRITICAL_OVERFLOW';
    else if (predictedPct24h >= 85) surgeStatus = 'HIGH_SURGE_WARNING';
    else if (predictedPct24h >= 75) surgeStatus = 'ELEVATED';

    const featureImportances: FeatureImportance = {
      "er_admissions_24h": 0.36,
      "respiratory_epidemic_index": 0.27,
      "current_beds_occupied": 0.18,
      "planned_surgeries_24h": 0.11,
      "average_length_of_stay_days": 0.05,
      "day_of_week_seasonality": 0.03
    };

    return {
      success: true,
      model_info: this.getMetadata(),
      prediction: {
        total_icu_capacity: totalBeds,
        current_occupied: currentOccupied,
        predicted_occupancy_pct_24h: predictedPct24h,
        predicted_occupancy_pct_48h: predictedPct48h,
        expected_bed_shortage_count: expectedBedShortageCount,
        surge_status: surgeStatus,
        recommended_divert: predictedPct24h >= 90,
        confidence: 0.91,
        recommendation: predictedPct24h >= 90
          ? "ACTIVATE DIVERT: Issue regional trauma divert to secondary network facilities. Prepare step-down beds."
          : "MONITOR: Occupancy within manageable parameters. Maintain standard staffing levels."
      },
      feature_importances: featureImportances,
      timestamp: new Date().toISOString()
    };
  }
}

// ============================================================================
// 3. Medicine Stock Reorder Model (/predict/medicine)
// ============================================================================
export class XGBoostMedicineStockPredictor {
  public static getMetadata(): ModelMetadata {
    return {
      model_id: "xgb_pharmacy_reorder_v1",
      name: "LifeLink Pharmaceutical Inventory & Out-of-Stock Predictor",
      framework: "XGBoost 2.0.3 / Python FastAPI Bridge",
      algorithm: "XGBoostRegressor",
      version: "2.1.0-xgboost-architecture",
      hyperparameters: {
        n_estimators: 120,
        max_depth: 5,
        learning_rate: 0.08,
        subsample: 0.8,
        colsample_bytree: 0.8,
        objective: "reg:squarederror"
      },
      features: [
        "current_stock_units",
        "daily_burn_rate",
        "supplier_lead_days",
        "seasonality_surge_factor",
        "shelf_life_days_remaining",
        "minimum_safety_stock"
      ],
      last_trained_timestamp: new Date().toISOString(),
      architecture_status: "ACTIVE_DUMMY_FALLBACK"
    };
  }

  public static predict(input: any) {
    const medicineName = String(input.medicine_name ?? input.medicine ?? "Amoxicillin 500mg");
    const currentStock = Number(input.current_stock_units ?? input.current_stock ?? 250);
    const dailyBurn = Number(input.daily_burn_rate ?? input.daily_consumption_rate ?? 35);
    const leadTimeDays = Number(input.supplier_lead_days ?? input.lead_time_days ?? 4);
    const surgeFactor = Number(input.seasonality_surge_factor ?? input.surge_factor ?? 1.25);

    const adjustedDailyBurn = dailyBurn * surgeFactor;
    const daysUntilStockout = Number((currentStock / Math.max(1, adjustedDailyBurn)).toFixed(1));
    const safetyStockThreshold = Math.round(adjustedDailyBurn * leadTimeDays * 1.5);
    const recommendedReorderQuantity = Math.max(200, Math.round(adjustedDailyBurn * 30 - currentStock));
    
    const reorderDateObj = new Date();
    const daysToOrder = Math.max(0, Math.floor(daysUntilStockout - leadTimeDays));
    reorderDateObj.setDate(reorderDateObj.getDate() + daysToOrder);

    const stockoutProb30d = daysUntilStockout < 30 ? Number(Math.min(0.99, (30 - daysUntilStockout) / 30).toFixed(2)) : 0.05;

    const featureImportances: FeatureImportance = {
      "daily_burn_rate": 0.42,
      "seasonality_surge_factor": 0.28,
      "supplier_lead_days": 0.16,
      "current_stock_units": 0.09,
      "shelf_life_days_remaining": 0.05
    };

    return {
      success: true,
      model_info: this.getMetadata(),
      prediction: {
        medicine_name: medicineName,
        current_stock_units: currentStock,
        daily_burn_rate_adjusted: Number(adjustedDailyBurn.toFixed(1)),
        days_until_stockout: daysUntilStockout,
        stockout_probability_30d: stockoutProb30d,
        safety_stock_threshold: safetyStockThreshold,
        recommended_reorder_quantity: recommendedReorderQuantity,
        optimal_reorder_date: reorderDateObj.toISOString().split('T')[0],
        supplier_lead_time_days: leadTimeDays,
        confidence: 0.94,
        reorder_urgency: daysUntilStockout <= leadTimeDays ? "IMMEDIATE_EXPEDITED_ORDER" : daysUntilStockout <= leadTimeDays * 2 ? "RECOMMENDED_REORDER" : "STOCK_HEALTHY"
      },
      feature_importances: featureImportances,
      timestamp: new Date().toISOString()
    };
  }
}

// ============================================================================
// 4. Ambulance Dispatch & Traffic Preemption Model (/predict/ambulance)
// ============================================================================
export class XGBoostAmbulanceETAPredictor {
  public static getMetadata(): ModelMetadata {
    return {
      model_id: "xgb_ambulance_dispatch_eta_v4",
      name: "LifeLink Emergency Ambulance Dispatch & Traffic Preemption Predictor",
      framework: "XGBoost 2.0.3 / Python FastAPI Bridge",
      algorithm: "XGBoostRegressor",
      version: "2.1.0-xgboost-architecture",
      hyperparameters: {
        n_estimators: 180,
        max_depth: 6,
        learning_rate: 0.04,
        subsample: 0.88,
        colsample_bytree: 0.85,
        objective: "reg:squarederror"
      },
      features: [
        "distance_km",
        "traffic_congestion_index",
        "peak_hour_flag",
        "emergency_priority_level",
        "weather_severity_index",
        "signal_preemption_count"
      ],
      last_trained_timestamp: new Date().toISOString(),
      architecture_status: "ACTIVE_DUMMY_FALLBACK"
    };
  }

  public static predict(input: any) {
    const distanceKm = Number(input.distance_km ?? input.distance ?? 8.5);
    const trafficIndex = Number(input.traffic_congestion_index ?? input.traffic_factor ?? 1.6);
    const priority = String(input.emergency_priority_level ?? input.priority ?? "RED_CRITICAL");
    const peakHour = Boolean(input.peak_hour_flag ?? true);
    
    // Base speed in km/h
    const baseSpeed = peakHour ? 32 : 50;
    const congestedSpeed = baseSpeed / Math.max(1.0, trafficIndex * 0.8);
    
    const standardEtaMinutes = Number(((distanceKm / congestedSpeed) * 60).toFixed(1));
    
    // Preemption savings (green wave traffic light overrides)
    const timeSavedMinutes = Number((standardEtaMinutes * 0.52).toFixed(1));
    const preemptionEtaMinutes = Number((standardEtaMinutes - timeSavedMinutes).toFixed(1));

    const featureImportances: FeatureImportance = {
      "traffic_congestion_index": 0.44,
      "distance_km": 0.28,
      "peak_hour_flag": 0.14,
      "emergency_priority_level": 0.09,
      "weather_severity_index": 0.05
    };

    return {
      success: true,
      model_info: this.getMetadata(),
      prediction: {
        distance_km: distanceKm,
        emergency_priority: priority,
        predicted_standard_eta_minutes: standardEtaMinutes,
        predicted_preemption_eta_minutes: preemptionEtaMinutes,
        time_saved_minutes: timeSavedMinutes,
        optimal_ambulance_unit_id: "amb_04_als_express",
        recommended_route: "High-Speed Bypass Highway 101 -> Emergency Gate 3",
        signal_preemption_sequence: [
          { intersection_id: "INT_MARKET_4TH", preemption_status: "GREEN_WAVE_ARMED", green_hold_seconds: 35 },
          { intersection_id: "INT_MISSION_5TH", preemption_status: "GREEN_WAVE_ARMED", green_hold_seconds: 40 },
          { intersection_id: "INT_HOSPITAL_MAIN_AV", preemption_status: "CLEAR_LANE_RESERVED", green_hold_seconds: 60 }
        ],
        confidence: 0.92,
        dispatch_status: "PREEMPTION_ACTIVE"
      },
      feature_importances: featureImportances,
      timestamp: new Date().toISOString()
    };
  }
}

// ============================================================================
// 5. AI Hospital Recommendation Engine (/recommend/hospital)
// ============================================================================
export interface RecommendationInput {
  patient_location?: string;
  blood_type?: string;
  need_icu?: boolean;
  need_ambulance?: boolean;
  need_oxygen?: boolean;
  need_medicines?: boolean | string[] | string;
}

export class AIHospitalRecommendationEngine {
  public static getMetadata(): ModelMetadata {
    return {
      model_id: "lifelink_ai_hospital_recommender_v1",
      name: "LifeLink AI Hospital Allocation & Emergency Recommendation Engine",
      framework: "XGBoost + Multi-Criteria AI Optimization Engine",
      algorithm: "XGBoostRegressor",
      version: "2.1.0-recommendation-engine",
      hyperparameters: {
        n_estimators: 250,
        max_depth: 8,
        learning_rate: 0.05,
        subsample: 0.9,
        colsample_bytree: 0.85,
        objective: "rank:pairwise"
      },
      features: [
        "patient_geospatial_distance",
        "blood_stock_exact_type_match",
        "icu_capacity_headroom",
        "ambulance_unit_availability",
        "oxygen_reserve_hrs",
        "pharma_availability_pct"
      ],
      last_trained_timestamp: "2026-07-22T06:00:00Z",
      architecture_status: "ACTIVE_DUMMY_FALLBACK"
    };
  }

  public static predict(input: RecommendationInput) {
    const patientLocation = input.patient_location || "Downtown Central - Sector 4";
    const bloodType = (input.blood_type || "O-").toUpperCase();
    const needIcu = Boolean(input.need_icu);
    const needAmbulance = Boolean(input.need_ambulance);
    const needOxygen = Boolean(input.need_oxygen);

    let requiredMedsList: string[] = [];
    if (Array.isArray(input.need_medicines)) {
      requiredMedsList = input.need_medicines;
    } else if (typeof input.need_medicines === 'string' && input.need_medicines.trim().length > 0) {
      requiredMedsList = input.need_medicines.split(',').map(s => s.trim());
    } else if (Boolean(input.need_medicines)) {
      requiredMedsList = ["Amoxicillin 500mg", "Epinephrine 1mg", "Oxygen Cylinders"];
    }

    // Network of hospitals with live inventory and geospatial coordinates
    const hospitalsNetwork = [
      {
        id: "hosp_metro",
        name: "Metro Trauma & Critical Care Center",
        location: "Central Avenue, Sector 2",
        distance_km: 3.2,
        eta_minutes: 7,
        blood_inventory: { "O-": 18, "O+": 45, "A-": 8, "A+": 30, "B-": 5, "B+": 28, "AB-": 3, "AB+": 12 },
        icu_beds_available: 6,
        icu_total_beds: 40,
        ambulances_available: 3,
        oxygen_supply_hours: 72,
        medicines_stock: ["Amoxicillin 500mg", "Epinephrine 1mg", "Insulin", "Morphine 10mg", "Saline 500ml"],
        trauma_center_level: "Level 1 Trauma Center",
        contact_phone: "+1-800-555-METRO",
        latitude: 37.7749,
        longitude: -122.4194
      },
      {
        id: "hosp_stjude",
        name: "St. Jude General & Emergency Hospital",
        location: "East Medical Ridge, Sector 7",
        distance_km: 5.8,
        eta_minutes: 12,
        blood_inventory: { "O-": 6, "O+": 22, "A-": 2, "A+": 18, "B-": 1, "B+": 14, "AB-": 0, "AB+": 8 },
        icu_beds_available: 2,
        icu_total_beds: 25,
        ambulances_available: 1,
        oxygen_supply_hours: 48,
        medicines_stock: ["Amoxicillin 500mg", "Epinephrine 1mg", "Saline 500ml"],
        trauma_center_level: "Level 2 Emergency",
        contact_phone: "+1-800-555-JUDE",
        latitude: 37.7833,
        longitude: -122.4167
      },
      {
        id: "hosp_city",
        name: "City Memorial Emergency Institute",
        location: "North Industrial Park, Sector 11",
        distance_km: 8.4,
        eta_minutes: 16,
        blood_inventory: { "O-": 2, "O+": 12, "A-": 0, "A+": 10, "B-": 0, "B+": 8, "AB-": 1, "AB+": 5 },
        icu_beds_available: 0,
        icu_total_beds: 20,
        ambulances_available: 2,
        oxygen_supply_hours: 36,
        medicines_stock: ["Amoxicillin 500mg", "Saline 500ml"],
        trauma_center_level: "Level 3 Community Hospital",
        contact_phone: "+1-800-555-CITY",
        latitude: 37.7600,
        longitude: -122.4350
      },
      {
        id: "hosp_childrens",
        name: "Regional Super Specialty & Children Hospital",
        location: "South Tech Corridor, Sector 15",
        distance_km: 11.2,
        eta_minutes: 21,
        blood_inventory: { "O-": 24, "O+": 60, "A-": 12, "A+": 40, "B-": 8, "B+": 32, "AB-": 4, "AB+": 20 },
        icu_beds_available: 12,
        icu_total_beds: 60,
        ambulances_available: 5,
        oxygen_supply_hours: 120,
        medicines_stock: ["Amoxicillin 500mg", "Epinephrine 1mg", "Insulin", "Morphine 10mg", "Saline 500ml", "Dopamine"],
        trauma_center_level: "Level 1 Pediatric & Adult Specialty",
        contact_phone: "+1-800-555-REGI",
        latitude: 37.7500,
        longitude: -122.4050
      }
    ];

    // Score each hospital based on input criteria
    const scoredHospitals = hospitalsNetwork.map(hosp => {
      let score = 100;
      const reasons: string[] = [];

      // 1. Distance & ETA penalty
      const distancePenalty = hosp.distance_km * 2.5;
      score -= distancePenalty;

      // 2. Blood Stock matching
      const availBloodUnits = hosp.blood_inventory[bloodType as keyof typeof hosp.blood_inventory] || 0;
      if (availBloodUnits >= 10) {
        score += 15;
        reasons.push(`High stock of requested blood type ${bloodType} (${availBloodUnits} units)`);
      } else if (availBloodUnits > 0) {
        score += 5;
        reasons.push(`Limited stock of blood type ${bloodType} (${availBloodUnits} units)`);
      } else {
        score -= 40;
        reasons.push(`CRITICAL: Zero stock of requested blood type ${bloodType}`);
      }

      // 3. Need ICU
      if (needIcu) {
        if (hosp.icu_beds_available > 0) {
          score += 20;
          reasons.push(`ICU beds available (${hosp.icu_beds_available} open of ${hosp.icu_total_beds})`);
        } else {
          score -= 50; // Severe penalty if ICU needed but zero beds
          reasons.push(`ICU AT CAPACITY: 0 beds available`);
        }
      }

      // 4. Need Ambulance
      if (needAmbulance) {
        if (hosp.ambulances_available > 0) {
          score += 10;
          reasons.push(`Active dispatch ambulance available (${hosp.ambulances_available} units ready)`);
        } else {
          score -= 20;
          reasons.push(`No ready ambulance units for dispatch`);
        }
      }

      // 5. Need Oxygen
      if (needOxygen) {
        if (hosp.oxygen_supply_hours >= 48) {
          score += 10;
          reasons.push(`Abundant central oxygen reserve (${hosp.oxygen_supply_hours}h supply)`);
        } else {
          score += 2;
        }
      }

      // 6. Need Medicines
      if (requiredMedsList.length > 0) {
        const matchedMeds = requiredMedsList.filter(m => 
          hosp.medicines_stock.some(stockMed => stockMed.toLowerCase().includes(m.toLowerCase()))
        );
        if (matchedMeds.length === requiredMedsList.length) {
          score += 10;
          reasons.push(`All requested pharmaceuticals available in pharmacy (${matchedMeds.join(', ')})`);
        } else {
          reasons.push(`Partial medicine stock matched (${matchedMeds.length}/${requiredMedsList.length})`);
        }
      }

      // Baseline proximity note
      reasons.unshift(`Proximity: ${hosp.distance_km} km away (~${hosp.eta_minutes} min ETA)`);

      const normalizedScore = Number(Math.max(5, Math.min(99.8, score)).toFixed(1));

      return {
        ...hosp,
        match_score: normalizedScore,
        requested_blood_type_units: availBloodUnits,
        reasons
      };
    });

    // Sort by match_score descending
    scoredHospitals.sort((a, b) => b.match_score - a.match_score);

    const recommended = scoredHospitals[0];

    // Construct human-readable AI justification sentence
    const mainReasons = recommended.reasons.slice(0, 4).join('; ');
    const recommendationReason = `${recommended.name} is selected as the top choice (Match Score: ${recommended.match_score}/100) for patient at "${patientLocation}". Key factors: ${mainReasons}.`;

    return {
      success: true,
      model_info: this.getMetadata(),
      inputs: {
        patient_location: patientLocation,
        blood_type: bloodType,
        need_icu: needIcu,
        need_ambulance: needAmbulance,
        need_oxygen: needOxygen,
        need_medicines: requiredMedsList
      },
      output: {
        recommended_hospital: recommended.name,
        hospital_id: recommended.id,
        distance_km: recommended.distance_km,
        eta_minutes: recommended.eta_minutes,
        available_blood_units: recommended.requested_blood_type_units,
        icu_beds_available: recommended.icu_beds_available,
        ambulance_available_units: recommended.ambulances_available,
        oxygen_supply_hours: recommended.oxygen_supply_hours,
        match_score: recommended.match_score,
        reason_for_recommendation: recommendationReason,
        contact_phone: recommended.contact_phone,
        trauma_center_level: recommended.trauma_center_level
      },
      ranked_hospitals: scoredHospitals.map(h => ({
        hospital_id: h.id,
        hospital_name: h.name,
        match_score: h.match_score,
        distance_km: h.distance_km,
        eta_minutes: h.eta_minutes,
        available_blood_units: h.requested_blood_type_units,
        icu_beds_available: h.icu_beds_available,
        ambulance_available_units: h.ambulances_available,
        reasons: h.reasons
      })),
      timestamp: new Date().toISOString()
    };
  }
}

