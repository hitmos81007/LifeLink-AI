export interface ForecastExplanationInput {
  resourceType: 'ICU Beds' | 'General Beds';
  currentQuantity: number;
  predictedDemand24h: number;
  predictedDemand7d: number;
  shortageRisk: 'Critical' | 'High' | 'Medium' | 'Low';
}

const RESOURCE_TYPES = new Set<ForecastExplanationInput['resourceType']>(['ICU Beds', 'General Beds']);
const RISK_LEVELS = new Set<ForecastExplanationInput['shortageRisk']>(['Critical', 'High', 'Medium', 'Low']);
const MAX_EXPLANATION_QUANTITY = 1_000_000;

/** Whitelist only the synthetic forecast values that the explanation needs. */
export function parseForecastExplanationInput(body: unknown): ForecastExplanationInput | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const resourceType = input.resourceType;
  const shortageRisk = input.shortageRisk;
  const quantities = [input.currentQuantity, input.predictedDemand24h, input.predictedDemand7d];

  if (typeof resourceType !== 'string' || !RESOURCE_TYPES.has(resourceType as ForecastExplanationInput['resourceType'])) return null;
  if (typeof shortageRisk !== 'string' || !RISK_LEVELS.has(shortageRisk as ForecastExplanationInput['shortageRisk'])) return null;
  if (!quantities.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_EXPLANATION_QUANTITY)) return null;

  return {
    resourceType: resourceType as ForecastExplanationInput['resourceType'],
    currentQuantity: quantities[0] as number,
    predictedDemand24h: quantities[1] as number,
    predictedDemand7d: quantities[2] as number,
    shortageRisk: shortageRisk as ForecastExplanationInput['shortageRisk'],
  };
}
