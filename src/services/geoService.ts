/** Straight-line distance for synthetic facility comparisons; this is not routing. */
export function isValidCoordinatePair(lat?: number | null, lng?: number | null): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat! >= -90 && lat! <= 90
    && lng! >= -180 && lng! <= 180;
}

export function calculateHaversineDistance(
  lat1?: number | null,
  lon1?: number | null,
  lat2?: number | null,
  lon2?: number | null
): number | null {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null
    || !isValidCoordinatePair(lat1, lon1) || !isValidCoordinatePair(lat2, lon2)) return null;
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const rawA = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const a = Math.min(1, Math.max(0, rawA));
  return Math.round(earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) * 10) / 10;
}

/** Illustrative ETA only: assumes 35 km/h and a four minute preparation buffer. */
export function calculateEtaMinutes(distanceKm: number): number {
  return Math.max(3, Math.round((distanceKm / 35) * 60 + 4));
}
