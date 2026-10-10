export type ResourceCategory = 'blood' | 'oxygen' | 'icu' | 'beds' | 'ambulance' | 'medicine';
export type ResourceFreshness = 'Fresh' | 'Stale' | 'Unknown';

const FAST_CHANGING_RESOURCE_CATEGORIES = new Set<ResourceCategory>(['icu', 'beds', 'ambulance']);
const FAST_CHANGING_WINDOW_MS = 15 * 60 * 1000;
const STANDARD_WINDOW_MS = 60 * 60 * 1000;

export function getResourceFreshness(
  updatedAt: string | null,
  category: ResourceCategory,
  now = Date.now()
): ResourceFreshness {
  if (!updatedAt) return 'Unknown';

  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp) || timestamp > now) return 'Unknown';

  const freshnessWindow = FAST_CHANGING_RESOURCE_CATEGORIES.has(category)
    ? FAST_CHANGING_WINDOW_MS
    : STANDARD_WINDOW_MS;
  return now - timestamp > freshnessWindow ? 'Stale' : 'Fresh';
}
