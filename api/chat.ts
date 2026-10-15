import { GoogleGenAI } from '@google/genai';

interface ChatRequest {
  message?: unknown;
  capability?: unknown;
  history?: unknown;
}

interface VercelRequest {
  method?: string;
  body?: ChatRequest;
}

interface VercelResponse {
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
  json(body: unknown): void;
  end(): void;
}

const capabilities = new Set([
  'all',
  'patient_questions',
  'hospital_resource_prediction',
  'medicine_stock_recommendation',
  'blood_shortage_explanation',
  'disease_trend_explanation',
]);

const systemInstruction = `You are LifeLink AI's informational assistant for a synthetic healthcare logistics prototype.

Your core capabilities cover general emergency-logistics concepts and synthetic resource-planning examples using only information explicitly provided by the user.

Safety requirements:
- This prototype is not connected to live clinical or hospital systems. Never claim that a request was recorded, a resource was reserved, an alert was sent, or a dispatch occurred.
- Do not provide patient-specific diagnosis, triage, treatment, or medication dosing. Direct urgent or personal medical questions to licensed clinicians or local emergency services.
- Do not invent inventory, epidemiology, response-time, outcome, or other operational statistics. State when required data is missing.
- Treat model output as advisory and require qualified human review for all operational decisions.
- Users must use synthetic examples and must not submit personal health information.

Provide concise, clear markdown. Include a brief disclaimer for symptom or treatment questions.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Use POST for assistant messages.' });
  }

  const { message, capability, history } = req.body ?? {};
  if (typeof message !== 'string' || !message.trim() || message.length > 2000) {
    return res.status(400).json({ success: false, error: 'Enter a message of 1 to 2,000 characters.' });
  }
  if (capability !== undefined && (typeof capability !== 'string' || !capabilities.has(capability))) {
    return res.status(400).json({ success: false, error: 'Choose a supported assistant capability.' });
  }
  if (history !== undefined && !Array.isArray(history)) {
    return res.status(400).json({ success: false, error: 'Conversation history must be a list.' });
  }

  const safeHistory = (Array.isArray(history) ? history : [])
    .slice(-10)
    .filter((item): item is { role: string; text: string } =>
      !!item && typeof item === 'object'
      && ((item as { role?: unknown }).role === 'user' || (item as { role?: unknown }).role === 'model')
      && typeof (item as { text?: unknown }).text === 'string'
      && (item as { text: string }).text.length <= 2000)
    .map(item => ({ role: item.role, parts: [{ text: item.text }] }));

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      success: false,
      error: 'The informational assistant is not configured. Add GEMINI_API_KEY to the Vercel Preview environment to enable it.',
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [...safeHistory, { role: 'user', parts: [{ text: message.trim() }] }],
      config: {
        systemInstruction: `${systemInstruction}\n\nCapability focus: ${typeof capability === 'string' ? capability : 'general'}`,
        temperature: 0.3,
      },
    });

    if (!result.text?.trim()) {
      return res.status(503).json({ success: false, error: 'The assistant returned no answer. Please try again later.' });
    }
    return res.status(200).json({
      success: true,
      reply: result.text,
      capability: capability ?? 'general',
      model: 'gemini-3.6-flash',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Vercel /api/chat failed:', error);
    return res.status(503).json({ success: false, error: 'The AI assistant is temporarily unavailable.' });
  }
}
