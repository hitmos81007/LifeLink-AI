import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { parseForecastExplanationInput } from "./src/services/forecastExplanationInput";
// Match the local setup documented in README: keep secrets in .env.local.
// Vercel supplies GEMINI_API_KEY through its server-side environment instead.
dotenv.config({ path: ['.env.local', '.env'] });

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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
  const forecast = parseForecastExplanationInput(req.body);
  if (!forecast) {
    return res.status(400).json({ success: false, error: "Provide a supported synthetic bed estimate with valid numeric values and risk label." });
  }
  try {
    const ai = getGeminiClient();

    const systemPrompt = `You are LifeLink AI Healthcare Analytics Expert.
CRITICAL CONSTRAINT: You MUST explain the operational forecast provided using ONLY the exact numerical quantities in the prompt payload below. You are STRICTLY FORBIDDEN from inventing, altering, or hallucinating any stock levels, demand counts, or confidence numbers.

INPUT SYNTHETIC FORECAST DATA:
- Resource Type: ${forecast.resourceType}
- Current Stock/Availability: ${forecast.currentQuantity}
- 24-Hour Predicted Demand: ${forecast.predictedDemand24h}
- 7-Day Predicted Demand: ${forecast.predictedDemand7d}
- Model Confidence Score: Not available (the estimate is a rule-based prototype and has not been validated)
- Evaluated Shortage Risk: ${forecast.shortageRisk}

Provide a structured 2-paragraph operational analysis:
1. Briefly restate the supplied inventory and illustrative estimate values without inferring clinical or operational outcomes.
2. State that no action recommendation can be derived from this unvalidated prototype estimate.

End with this exact sentence on its own line:
"*Note: Operational baseline forecast for decision support. Not clinically validated.*"`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: systemPrompt,
      config: {
        temperature: 0.1,
      },
    });

    const explanation = response.text || `Illustrative baseline: recorded ${forecast.resourceType} stock is ${forecast.currentQuantity} units against a simplified 24-hour estimate of ${forecast.predictedDemand24h} units (${forecast.shortageRisk} scenario flag). No validated model or confidence score is available.`;

    return res.json({ success: true, explanation });
  } catch (error: any) {
    console.error("Error in /api/ai/explain-forecast:", error);
    const fallbackExp = `Illustrative baseline: recorded ${forecast.resourceType} stock is ${forecast.currentQuantity} units against simplified estimates of ${forecast.predictedDemand24h} units over 24 hours and ${forecast.predictedDemand7d} units over 7 days. The ${forecast.shortageRisk} scenario flag is rule-based. No validated model or confidence score is available.\n\n*Prototype estimate only; not operational guidance.*`;
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

    const systemInstruction = `You are LifeLink AI's informational assistant for a synthetic healthcare logistics prototype.

Your core capabilities cover:
1. Explain general emergency-logistics concepts.
2. Discuss resource-planning examples using only information explicitly provided in the prompt.
3. Help interpret synthetic inventory and demand examples.

Capability Focus: ${capability || "General Healthcare Intelligence"}

Safety requirements:
- This prototype is not connected to live clinical or hospital systems. Never claim that a request was recorded, a resource was reserved, an alert was sent, or a dispatch occurred.
- Do not provide patient-specific diagnosis, triage, treatment, or medication dosing. Direct urgent or personal medical questions to licensed clinicians or local emergency services.
- Do not invent inventory, epidemiology, response-time, outcome, or other operational statistics. State when required data is missing.
- Treat model output as advisory and require qualified human review for all operational decisions.
- Users must use synthetic examples and must not submit personal health information.

Formatting Guidelines:
- Provide structured, professional, well-formatted markdown responses with headers, bullet points, and key metrics where appropriate.
- Be concise, accurate, empathetic, and clear.
- Include a brief medical disclaimer at the end when answering patient symptom or treatment questions: "*Disclaimer: LifeLink AI Assistant provides information and decision support, not definitive medical diagnosis. Consult a licensed healthcare professional or call emergency services for immediate medical emergencies.*"`;

    // Construct the conversation payload for the configured Gemini model.
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
    return res.status(503).json({
      success: false,
      error: "The AI assistant is unavailable. No answer or operational recommendation was generated."
    });
  }
};

app.post("/chat", handleChatRequest);
app.post("/api/chat", handleChatRequest);

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
