import { isValidCoordinatePair, calculateHaversineDistance } from './geoService';
import { getResourceFreshness, ResourceFreshness } from './resourceFreshness';
import type { PublicBloodBank, PublicHospital, PublicResourceItem } from './publicResourceService';

export interface BloodBankDiscoveryMatch {
  bank: PublicBloodBank;
  inventory: PublicResourceItem & { blood_group: string };
  distanceKm: number | null;
  freshness: ResourceFreshness;
}

export interface HospitalDiscoveryMatch {
  hospital: PublicHospital;
  distanceKm: number | null;
  icuFreshness: ResourceFreshness;
  generalBedsFreshness: ResourceFreshness;
}

/**
 * Lists reported stock for one blood group and ranks it by straight-line
 * distance from an optional browser-only synthetic map point. This is not a
 * compatibility, clinical suitability, reservation, or routing decision.
 */
export function findBloodBanksForGroup(
  banks: PublicBloodBank[],
  bloodGroup: string,
  origin?: { lat: number; lng: number } | null,
  now = Date.now()
): BloodBankDiscoveryMatch[] {
  const validOrigin = origin && isValidCoordinatePair(origin.lat, origin.lng) ? origin : null;
  return banks.flatMap((bank) => {
    if (!isValidCoordinatePair(bank.latitude, bank.longitude)) return [];
    const inventory = bank.stock.find((item) => item.blood_group === bloodGroup);
    if (!inventory) return [];
    return [{
      bank,
      inventory,
      distanceKm: validOrigin
        ? calculateHaversineDistance(validOrigin.lat, validOrigin.lng, bank.latitude, bank.longitude)
        : null,
      freshness: getResourceFreshness(inventory.updated_at ?? null, 'blood', now)
    }];
  }).sort((a, b) => {
    if (a.distanceKm == null) return b.distanceKm == null ? a.bank.name.localeCompare(b.bank.name) : 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });
}

/** Rank recorded hospital resources from an optional browser-only map point. */
export function findHospitalsByDistance(
  hospitals: PublicHospital[],
  origin?: { lat: number; lng: number } | null,
  now = Date.now()
): HospitalDiscoveryMatch[] {
  const validOrigin = origin && isValidCoordinatePair(origin.lat, origin.lng) ? origin : null;
  return hospitals.flatMap((hospital) => {
    if (!isValidCoordinatePair(hospital.latitude, hospital.longitude)) return [];
    return [{
      hospital,
      distanceKm: validOrigin
        ? calculateHaversineDistance(validOrigin.lat, validOrigin.lng, hospital.latitude, hospital.longitude)
        : null,
      icuFreshness: getResourceFreshness(hospital.icu_updated_at, 'icu', now),
      generalBedsFreshness: getResourceFreshness(hospital.general_beds_updated_at, 'beds', now)
    }];
  }).sort((a, b) => {
    if (a.distanceKm == null) return b.distanceKm == null ? a.hospital.name.localeCompare(b.hospital.name) : 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });
}
