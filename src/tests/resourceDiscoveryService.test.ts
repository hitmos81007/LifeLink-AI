import { describe, expect, it } from 'vitest';
import type { PublicBloodBank, PublicHospital } from '../services/publicResourceService';
import { findBloodBanksForGroup, findHospitalsByDistance } from '../services/resourceDiscoveryService';

const bank = (
  id: string,
  name: string,
  latitude: number | null,
  longitude: number | null,
  stock: PublicBloodBank['stock']
): PublicBloodBank => ({
  id, name, address: 'Synthetic address', district: 'Synthetic district', state: 'Synthetic state',
  latitude, longitude, phone: null, profile_updated_at: '', stock
});

const hospital = (id: string, name: string, latitude: number | null, longitude: number | null): PublicHospital => ({
  id, name, address: 'Synthetic address', district: 'Synthetic district', state: 'Synthetic state',
  latitude, longitude, phone: null, hospital_type: 'General', trauma_center: false,
  profile_updated_at: '', icu_beds: 3, icu_status: 'Available', icu_updated_at: '2026-10-07T11:40:00.000Z',
  general_beds: 10, general_beds_status: 'Available', general_beds_updated_at: '2026-10-07T11:30:00.000Z',
  oxygen: [{ type: 'Medical Oxygen', quantity: 4, unit: 'cylinders', availability_status: 'Available', updated_at: '2026-10-07T11:30:00.000Z' }],
  medicines: []
});

describe('blood bank directory matching', () => {
  const now = Date.parse('2026-10-07T12:00:00.000Z');

  it('filters by selected blood group and ranks reported matches by straight-line distance', () => {
    const banks = [
      bank('far', 'Far Bank', 1, 0, [{ blood_group: 'O-', quantity: 8, availability_status: 'Available', updated_at: '2026-10-07T11:30:00.000Z' }]),
      bank('near', 'Near Bank', 0.1, 0, [{ blood_group: 'O-', quantity: 2, availability_status: 'Critical', updated_at: '2026-10-07T11:30:00.000Z' }]),
      bank('other', 'Other Group Bank', 0.05, 0, [{ blood_group: 'A+', quantity: 40, availability_status: 'Available', updated_at: '2026-10-07T11:30:00.000Z' }]),
      bank('no-coordinates', 'Unmapped Bank', null, null, [{ blood_group: 'O-', quantity: 5, availability_status: 'Available', updated_at: '2026-10-07T11:30:00.000Z' }])
    ];

    const matches = findBloodBanksForGroup(banks, 'O-', { lat: 0, lng: 0 }, now);
    expect(matches.map((match) => match.bank.id)).toEqual(['near', 'far']);
    expect(matches[0].distanceKm).toBe(11.1);
    expect(matches[0].freshness).toBe('Fresh');
    expect(matches[0].inventory.availability_status).toBe('Critical');
  });

  it('keeps stale reported stock visible and sorts alphabetically without a search point', () => {
    const banks = [
      bank('z', 'Zulu Bank', 1, 1, [{ blood_group: 'O-', quantity: 0, availability_status: 'Critical', updated_at: '2026-10-07T09:00:00.000Z' }]),
      bank('a', 'Alpha Bank', 2, 2, [{ blood_group: 'O-', quantity: null, availability_status: 'Unknown', updated_at: null }])
    ];

    const matches = findBloodBanksForGroup(banks, 'O-', null, now);
    expect(matches.map((match) => match.bank.id)).toEqual(['a', 'z']);
    expect(matches[0].inventory.quantity).toBeNull();
    expect(matches[1].freshness).toBe('Stale');
  });

  it('ranks hospital inventory by distance and reports freshness independently per resource', () => {
    const matches = findHospitalsByDistance([
      hospital('far', 'Far Hospital', 1, 0),
      hospital('near', 'Near Hospital', 0.1, 0),
      hospital('unmapped', 'Unmapped Hospital', null, null)
    ], { lat: 0, lng: 0 }, now);

    expect(matches.map((match) => match.hospital.id)).toEqual(['near', 'far']);
    expect(matches[0].distanceKm).toBe(11.1);
    expect(matches[0].icuFreshness).toBe('Stale');
    expect(matches[0].generalBedsFreshness).toBe('Stale');
  });
});
