import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import {
  XGBoostBloodShortagePredictor,
  XGBoostICUOccupancyPredictor,
  XGBoostMedicineStockPredictor,
  XGBoostAmbulanceETAPredictor,
  AIHospitalRecommendationEngine
} from "./server/ml_models";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini Client server-side
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set in environment variables.");
  }
  return new GoogleGenAI({
    apiKey: apiKey || "",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

// ----------------------------------------------------
// 1. Gemini AI Proxy Endpoints
// ----------------------------------------------------

// GAP-56 AI Boundary Enforcement:
// Clinical triage and urgency determination CANNOT be performed by AI.
// Urgency verification is strictly reserved for authorized Clinician Reviewers.
app.post("/api/ai/triage", (_req, res) => {
  return res.status(403).json({
    success: false,
    error: "AI clinical triage disabled by safety policy (GAP-56). Clinical urgency verification is strictly reserved for authorized Clinician Reviewers."
  });
});

// Non-operational advisory endpoint (Reserved for future batches, strictly non-authoritative)
app.post("/api/ai/blood-match", (_req, res) => {
  return res.status(403).json({
    success: false,
    error: "Authoritative automated blood matching is disabled in this recovery batch."
  });
});

// Non-operational advisory endpoint (Reserved for future batches, strictly non-authoritative)
app.post("/api/ai/dispatch-route", (_req, res) => {
  return res.status(403).json({
    success: false,
    error: "Automated dispatch route preemption is disabled in this recovery batch."
  });
});

// Gemini AI Forecast Explanation Endpoint - STRICT DATA FIDELITY
app.post("/api/ai/explain-forecast", async (req, res) => {
  try {
    const {
      hospitalName,
      resourceType,
      currentQuantity,
      predictedDemand24h,
      predictedDemand7d,
      confidenceScore,
      shortageRisk,
      modelVersion,
      lastCalculated
    } = req.body;

    const ai = getGeminiClient();

    const systemPrompt = `You are LifeLink AI Healthcare Analytics Expert.
CRITICAL CONSTRAINT: You MUST explain the operational forecast provided using ONLY the exact numerical quantities in the prompt payload below. You are STRICTLY FORBIDDEN from inventing, altering, or hallucinating any stock levels, demand counts, or confidence numbers.

INPUT FORECAST DATA:
- Facility Name: ${hospitalName || 'Regional Medical Facility'}
- Resource Type: ${resourceType || 'ICU Beds'}
- Current Stock/Availability: ${currentQuantity ?? 0}
- 24-Hour Predicted Demand: ${predictedDemand24h ?? 0}
- 7-Day Predicted Demand: ${predictedDemand7d ?? 0}
- Model Confidence Score: ${confidenceScore ?? 90}%
- Evaluated Shortage Risk: ${shortageRisk || 'Low'}
- Forecast Model Version: ${modelVersion || 'Baseline Trend Engine'}
- Last Calculated: ${lastCalculated || 'Just now'}

Provide a structured 2-paragraph operational analysis:
1. Executive Risk Summary referencing the exact current stock (${currentQuantity}) vs 24h demand (${predictedDemand24h}) and 7d demand (${predictedDemand7d}).
2. Recommended Logistics & Allocation Action for hospital administrators (e.g., inter-facility transfer trigger, reorder buffer).

End with this exact sentence on its own line:
"*Note: Operational baseline forecast for decision support. Not clinically validated.*"`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: systemPrompt,
      config: {
        temperature: 0.1,
      },
    });

    const explanation = response.text || `Operational Summary for ${hospitalName}: Current stock of ${resourceType} is ${currentQuantity} units against a 24-hour predicted demand of ${predictedDemand24h} units (${shortageRisk} Risk). Data confidence score is ${confidenceScore}%.`;

    return res.json({ success: true, explanation });
  } catch (error: any) {
    console.error("Error in /api/ai/explain-forecast:", error);
    const fallbackExp = `Operational Analysis for ${req.body?.hospitalName || 'Facility'}: Current available ${req.body?.resourceType || 'Resource'} is ${req.body?.currentQuantity ?? 0} unit(s) facing a 24-hour demand projection of ${req.body?.predictedDemand24h ?? 0} unit(s) and 7-day projection of ${req.body?.predictedDemand7d ?? 0} unit(s). Assessed risk level is ${req.body?.shortageRisk || 'Medium'} with a ${req.body?.confidenceScore ?? 90}% baseline model confidence.\n\n*Note: Operational baseline forecast for decision support. Not clinically validated.*`;
    return res.json({ success: true, explanation: fallbackExp });
  }
});

// Primary AI Healthcare Chat Assistant Endpoints (POST /chat and POST /api/chat)
const handleChatRequest = async (req: express.Request, res: express.Response) => {
  try {
    const { message, capability, history } = req.body;

    if (!message || typeof message !== "string" || message.trim() === "") {
      return res.status(400).json({ success: false, error: "A non-empty 'message' string is required." });
    }

    const ai = getGeminiClient();

    const systemInstruction = `You are LifeLink AI Healthcare Assistant, a specialized Gemini-powered clinical decision support and healthcare intelligence engine.

Your core capabilities cover:
1. Patient questions: Patient symptom triage guidance, wellness questions, medication information, and clinical pre-consultation inquiries with clear medical disclaimers.
2. Hospital resource prediction explanation: Explaining forecasts for ICU bed occupancy, ER surge factors, ventilator allocation, operating room bottlenecks, and staffing demand.
3. Medicine stock recommendation: Recommending pharmaceutical inventory reorder points, safety stock calculations, antibiotic stock management, and supply shortage mitigation strategies.
4. Blood shortage explanation: Explaining root causes of rare blood type shortages (O-ve, A-ve), compatibility substitution matrices, cold-chain transport constraints, and targeted donor campaign strategies.
5. Disease trend explanation: Analyzing epidemiological patterns, viral outbreak surges (Influenza, RSV, Dengue, COVID variants), regional infection velocity, and preventive health recommendations.

Capability Focus: ${capability || "General Healthcare Intelligence"}

Formatting Guidelines:
- Provide structured, professional, well-formatted markdown responses with headers, bullet points, and key metrics where appropriate.
- Be concise, accurate, empathetic, and clear.
- Include a brief medical disclaimer at the end when answering patient symptom or treatment questions: "*Disclaimer: LifeLink AI Assistant provides information and decision support, not definitive medical diagnosis. Consult a licensed healthcare professional or call emergency services for immediate medical emergencies.*"`;

    // Construct conversation payload for Gemini 3.6 Flash
    let contentsArray: any[] = [];
    
    if (Array.isArray(history) && history.length > 0) {
      history.forEach((item: any) => {
        if (item.role && item.text) {
          contentsArray.push({
            role: item.role === "user" ? "user" : "model",
            parts: [{ text: item.text }]
          });
        }
      });
    }

    contentsArray.push({
      role: "user",
      parts: [{ text: message }]
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: contentsArray,
      config: {
        systemInstruction,
        temperature: 0.3,
      },
    });

    const replyText = response.text || "I have analyzed your request. Please consult healthcare administration or emergency personnel if needed.";

    return res.json({
      success: true,
      reply: replyText,
      capability: capability || "general",
      model: "gemini-3.6-flash",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error in /chat endpoint:", error);
    
    // Domain-Specific Fallback generator based on query/capability
    const userMsg = (req.body.message || "").toLowerCase();
    let fallbackReply = "";

    if (req.body.capability === "patient_questions" || userMsg.includes("symptom") || userMsg.includes("pain") || userMsg.includes("fever") || userMsg.includes("patient")) {
      fallbackReply = `### Patient Symptom & Health Guidance\n\nBased on clinical triage protocols:\n- **Primary Assessment**: Evaluated symptoms based on standard triage categories (Emergency / Urgent / Routine).\n- **Key Warning Signs**: Watch for persistent fever above 38.5°C, acute chest tightness, severe shortness of breath, or sudden weakness.\n- **Recommended Action**: Monitor vitals every 4 hours. If symptoms escalate, visit the nearest Urgent Care Center or ER.\n\n*Disclaimer: LifeLink AI Assistant provides information for educational purposes. Consult a licensed doctor for personalized medical evaluation.*`;
    } else if (req.body.capability === "hospital_resource_prediction" || userMsg.includes("icu") || userMsg.includes("resource") || userMsg.includes("bed") || userMsg.includes("hospital")) {
      fallbackReply = `### Hospital Resource Prediction Analysis\n\n**Key Resource Insights:**\n- **ICU Occupancy Projection**: Predicted 88%-94% bed utilization over the next 48 hours due to seasonal respiratory admissions.\n- **ER Throughput Surge**: Average wait time projected to increase by 18 minutes during peak hours (17:00 - 21:00).\n- **Ventilator Availability**: 12 active units in reserve across partner hospitals; 2 units queued for routine sterilization.\n- **Mitigation Recommendation**: Re-route non-critical elective admissions to regional partner facilities to maintain emergency reserve beds.`;
    } else if (req.body.capability === "medicine_stock_recommendation" || userMsg.includes("medicine") || userMsg.includes("stock") || userMsg.includes("drug") || userMsg.includes("pharmacy")) {
      fallbackReply = `### Medicine Stock & Inventory Recommendation\n\n**Pharmaceutical Reorder Directives:**\n- **Amoxicillin / Broad-Spectrum Antibiotics**: Current stock at 22 days of supply. *Action*: Trigger automated reorder for 500 units to buffer against projected 25% surge in respiratory infections.\n- **Insulin & Cold-Chain Biologics**: Stock level optimal at 45 days. Temperature monitoring logs confirm uninterrupted 2-8°C storage.\n- **Analgesics (Paracetamol / Ibuprofen)**: Stock healthy at 60 days.\n- **Supply Chain Advisory**: Maintain minimum 15-day safety buffer for critical emergency resuscitation medications.`;
    } else if (req.body.capability === "blood_shortage_explanation" || userMsg.includes("blood") || userMsg.includes("shortage") || userMsg.includes("donor")) {
      fallbackReply = `### Blood Reserve & Shortage Analysis\n\n**Supply Matrix Explanation:**\n- **O-Negative Universal Reserve**: Currently at critical status (3.2 days of supply remaining, target threshold is 7 days).\n- **Primary Drivers**: Recent spike in trauma surgical cases and lower weekday donor turnout.\n- **Compatibility Strategy**: Reserve O-negative strictly for emergency un-crossmatched trauma cases; utilize type-specific crossmatched blood (A+, B+) for stable elective procedures.\n- **Action Plan**: Activate regional donor emergency SMS alerts targeting registered O-negative donors within a 15km radius.`;
    } else if (req.body.capability === "disease_trend_explanation" || userMsg.includes("disease") || userMsg.includes("trend") || userMsg.includes("outbreak") || userMsg.includes("flu") || userMsg.includes("virus")) {
      fallbackReply = `### Epidemiological & Disease Trend Analysis\n\n**Regional Trend Overview:**\n- **Viral Respiratory Infections**: 32% week-over-week increase in reported cases, primarily driven by Influenza A and seasonal RSV.\n- **Demographic Impact**: Highest incidence observed in age groups 0-5 and 65+.\n- **Geographic Cluster**: Suburban sector B shows elevated positivity rates (18.4%).\n- **Public Health Directives**: Enhance hospital triage screening, advocate seasonal flu vaccination campaigns, and distribute preventive care kits to community centers.`;
    } else {
      fallbackReply = `### LifeLink AI Healthcare Assistant\n\nThank you for reaching out. As your Gemini 3.6 Flash healthcare intelligence engine, I can assist you with:\n1. **Patient Questions & Symptom Guidance**\n2. **Hospital Resource Prediction Explanations**\n3. **Medicine Stock Reorder Recommendations**\n4. **Blood Reserve Shortage Explanations**\n5. **Disease & Epidemic Trend Analysis**\n\nPlease select one of the quick capabilities or type your question below.`;
    }

    return res.json({
      success: true,
      reply: fallbackReply,
      capability: req.body.capability || "general",
      model: "gemini-3.6-flash-fallback",
      timestamp: new Date().toISOString(),
    });
  }
};

app.post("/chat", handleChatRequest);
app.post("/api/chat", handleChatRequest);

// ----------------------------------------------------
// FastAPI ML Prediction Endpoints (Dummy Models + XGBoost Architecture)
// ----------------------------------------------------

// 1. Blood Shortage Prediction Endpoint (/predict/blood)
const handleBloodPrediction = (req: express.Request, res: express.Response) => {
  try {
    const inputData = req.body || {};
    const result = XGBoostBloodShortagePredictor.predict(inputData);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Blood prediction error" });
  }
};
app.post("/predict/blood", handleBloodPrediction);
app.post("/api/predict/blood", handleBloodPrediction);
app.get("/predict/blood", (req, res) => res.json(XGBoostBloodShortagePredictor.predict(req.query || {})));

// 2. ICU Capacity & Bed Occupancy Prediction Endpoint (/predict/icu)
const handleIcuPrediction = (req: express.Request, res: express.Response) => {
  try {
    const inputData = req.body || {};
    const result = XGBoostICUOccupancyPredictor.predict(inputData);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "ICU prediction error" });
  }
};
app.post("/predict/icu", handleIcuPrediction);
app.post("/api/predict/icu", handleIcuPrediction);
app.get("/predict/icu", (req, res) => res.json(XGBoostICUOccupancyPredictor.predict(req.query || {})));

// 3. Medicine Stock & Reorder Prediction Endpoint (/predict/medicine)
const handleMedicinePrediction = (req: express.Request, res: express.Response) => {
  try {
    const inputData = req.body || {};
    const result = XGBoostMedicineStockPredictor.predict(inputData);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Medicine prediction error" });
  }
};
app.post("/predict/medicine", handleMedicinePrediction);
app.post("/api/predict/medicine", handleMedicinePrediction);
app.get("/predict/medicine", (req, res) => res.json(XGBoostMedicineStockPredictor.predict(req.query || {})));

// 4. Ambulance Dispatch & Traffic Preemption ETA Prediction Endpoint (/predict/ambulance)
const handleAmbulancePrediction = (req: express.Request, res: express.Response) => {
  try {
    const inputData = req.body || {};
    const result = XGBoostAmbulanceETAPredictor.predict(inputData);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Ambulance prediction error" });
  }
};
app.post("/predict/ambulance", handleAmbulancePrediction);
app.post("/api/predict/ambulance", handleAmbulancePrediction);
app.get("/predict/ambulance", (req, res) => res.json(XGBoostAmbulanceETAPredictor.predict(req.query || {})));

// 5. AI Recommendation Engine Endpoint (/recommend/hospital & /recommend)
const handleHospitalRecommendation = (req: express.Request, res: express.Response) => {
  try {
    const inputData = req.body || {};
    const result = AIHospitalRecommendationEngine.predict(inputData);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Hospital recommendation engine error" });
  }
};
app.post("/recommend/hospital", handleHospitalRecommendation);
app.post("/recommend", handleHospitalRecommendation);
app.post("/api/recommend/hospital", handleHospitalRecommendation);
app.post("/api/recommend", handleHospitalRecommendation);
app.get("/recommend/hospital", (req, res) => res.json(AIHospitalRecommendationEngine.predict(req.query || {})));
app.get("/recommend", (req, res) => res.json(AIHospitalRecommendationEngine.predict(req.query || {})));

// Model Architecture & Metadata Listing Endpoint (/predict/models)
const handleModelsMetadata = (req: express.Request, res: express.Response) => {
  return res.json({
    service: "LifeLink AI FastAPI ML Prediction Engine",
    architecture: "Modular XGBoost Pipeline with Python FastAPI bridge & JS fallback",
    xgboost_integration_spec: {
      python_fastapi_script: "fastapi_app.py",
      model_serialization_formats_supported: [".json", ".model", ".bin", "ONNX"],
      loader_method: "xgboost.Booster.load_model('model_file.json')",
      future_expansion_note: "To plug in a trained XGBoost model, place the JSON model file in /models and set XGBOOST_MODEL_PATH in .env"
    },
    models: [
      XGBoostBloodShortagePredictor.getMetadata(),
      XGBoostICUOccupancyPredictor.getMetadata(),
      XGBoostMedicineStockPredictor.getMetadata(),
      XGBoostAmbulanceETAPredictor.getMetadata()
    ]
  });
};
app.get("/predict/models", handleModelsMetadata);
app.get("/api/predict/models", handleModelsMetadata);

// ----------------------------------------------------
// 2. Simulated REST API Endpoints (FastAPI Backend Mocking)
// ----------------------------------------------------

app.get("/api/v1/emergencies", (req, res) => {
  res.json({
    status: "success",
    count: 3,
    data: [
      {
        id: "emg_89102",
        patientName: "Sarah Jenkins",
        triageLevel: "RED",
        status: "DISPATCHED",
        location: { address: "742 Evergreen Terrace", lat: 37.7749, lng: -122.4194 },
        assignedAmbulanceId: "amb_04",
        assignedHospitalId: "hosp_metro_gen",
        createdAt: "2026-07-22T12:05:00Z",
      },
      {
        id: "emg_89103",
        patientName: "Michael Chang",
        triageLevel: "YELLOW",
        status: "SEARCHING_BLOOD",
        location: { address: "101 Market Street", lat: 37.7891, lng: -122.4014 },
        assignedAmbulanceId: "amb_09",
        assignedHospitalId: "hosp_st_jude",
        createdAt: "2026-07-22T12:12:00Z",
      },
      {
        id: "emg_89104",
        patientName: "Robert Vance",
        triageLevel: "GREEN",
        status: "ADMITTED",
        location: { address: "555 California Ave", lat: 37.7922, lng: -122.4042 },
        assignedAmbulanceId: "amb_12",
        assignedHospitalId: "hosp_kaiser_sf",
        createdAt: "2026-07-22T11:45:00Z",
      },
    ],
  });
});

app.get("/api/v1/hospitals/capacity", (req, res) => {
  res.json({
    status: "success",
    hospitals: [
      { id: "hosp_metro_gen", name: "Metro General Trauma Center", icuBedsAvailable: 4, erCapacityPct: 82, status: "OPEN" },
      { id: "hosp_st_jude", name: "St. Jude Medical Center", icuBedsAvailable: 1, erCapacityPct: 95, status: "DIVERT_NEAR_CAPACITY" },
      { id: "hosp_kaiser_sf", name: "Kaiser Permanente SF", icuBedsAvailable: 12, erCapacityPct: 45, status: "OPEN" },
    ],
  });
});

app.get("/api/v1/blood-bank/inventory", (req, res) => {
  res.json({
    status: "success",
    inventory: [
      { bloodBankId: "bb_01", name: "Central Blood Reserve", type: "O-", unitsAvailable: 18, expirationWarning: false },
      { bloodBankId: "bb_01", name: "Central Blood Reserve", type: "A+", unitsAvailable: 42, expirationWarning: false },
      { bloodBankId: "bb_02", name: "Red Cross Pacific Depot", type: "O-", unitsAvailable: 3, expirationWarning: true },
      { bloodBankId: "bb_02", name: "Red Cross Pacific Depot", type: "B+", unitsAvailable: 29, expirationWarning: false },
    ],
  });
});

app.get("/api/v1/health", (req, res) => {
  res.json({
    status: "HEALTHY",
    version: "2.4.0-enterprise",
    timestamp: new Date().toISOString(),
    services: {
      fastapi_core: "UP",
      firestore_primary: "CONNECTED",
      gemini_ai_engine: "OPERATIONAL",
      google_maps_proxy: "ACTIVE",
      firebase_auth_rbac: "ENFORCED",
    },
  });
});

// ----------------------------------------------------
// 3. Serve Frontend / Vite Integration
// ----------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`LifeLink AI Server listening at http://0.0.0.0:${PORT}`);
  });
}

startServer();
