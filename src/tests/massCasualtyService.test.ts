import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyMciTriageCounts,
  createSyntheticMciExampleCounts,
  getRecentMciIncidents,
  reportMassCasualtyIncident,
  SYNTHETIC_MCI_LOCATION
} from '../services/massCasualtyService';
import { calculateHaversineDistance } from '../services/geoService';

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    }
  });
});

describe('synthetic mass-casualty distribution', () => {
  it('starts with no implied casualties and exposes the example only as an explicit preset', () => {
    expect(createEmptyMciTriageCounts()).toEqual({ red: 0, yellow: 0, green: 0, black: 0 });
    expect(createSyntheticMciExampleCounts()).toEqual({ red: 4, yellow: 6, green: 8, black: 0 });
  });

  it('never allocates above illustrative facility capacity and reports unmet demand', async () => {
    const triage = { red: 80, yellow: 120, green: 140, black: 7 };
    const report = await reportMassCasualtyIncident({
      hazard_type: 'Multi-Vehicle Collision / Highway Pileup',
      triage
    });

    for (const allocation of report.hospital_allocations) {
      expect(allocation.allocated_red).toBeLessThanOrEqual(allocation.open_icu_beds);
      expect(allocation.allocated_yellow + allocation.allocated_green).toBeLessThanOrEqual(allocation.open_general_beds);
    }
    for (const color of ['red', 'yellow', 'green'] as const) {
      const assigned = report.hospital_allocations.reduce((sum, allocation) => sum + allocation[`allocated_${color}`], 0);
      expect(assigned + report.unallocated[color]).toBe(triage[color]);
    }
    expect(report.unallocated.red + report.unallocated.yellow + report.unallocated.green).toBeGreaterThan(0);
  });

  it('uses the same simulated coordinates for map markers and distance calculations', async () => {
    const report = await reportMassCasualtyIncident({
      hazard_type: 'Multi-Vehicle Collision / Highway Pileup',
      triage: { red: 1, yellow: 1, green: 1, black: 0 }
    });
    expect(report.location_name).toBe(SYNTHETIC_MCI_LOCATION.name);
    expect(report.latitude).toBe(SYNTHETIC_MCI_LOCATION.latitude);
    expect(report.longitude).toBe(SYNTHETIC_MCI_LOCATION.longitude);

    for (const hospital of report.hospital_allocations) {
      expect(calculateHaversineDistance(report.latitude, report.longitude, hospital.latitude, hospital.longitude))
        .toBe(hospital.distance_km);
    }
    for (const ambulance of report.example_ambulances) {
      const distance = calculateHaversineDistance(report.latitude, report.longitude, ambulance.latitude, ambulance.longitude);
      expect(ambulance.eta_minutes).toBe(Math.max(3, Math.round((distance! / 35) * 60 + 4)));
    }
  });

  it('rejects invalid counts before creating a report', async () => {
    const base = {
      hazard_type: 'Multi-Vehicle Collision / Highway Pileup' as const,
      triage: { red: 1, yellow: 0, green: 0, black: 0 }
    };
    await expect(reportMassCasualtyIncident({ ...base, triage: { ...base.triage, red: -1 } })).rejects.toThrow(/whole numbers/i);
    await expect(reportMassCasualtyIncident({ ...base, triage: { ...base.triage, red: 1.5 } })).rejects.toThrow(/whole numbers/i);
    await expect(reportMassCasualtyIncident({ ...base, triage: createEmptyMciTriageCounts() })).rejects.toThrow(/at least one casualty/i);
  });

  it('ignores caller-supplied scene details and never adds contact data to a guest report', async () => {
    const report = await reportMassCasualtyIncident(Object.assign({
      hazard_type: 'Multi-Vehicle Collision / Highway Pileup' as const,
      triage: { red: 1, yellow: 0, green: 0, black: 0 }
    }, {
      location_name: '123 Real Street', latitude: 91, longitude: 200,
      reporter_name: 'Real Person', reporter_phone: '+1-555-0100', scene_notes: 'Patient details'
    }));

    expect(report.location_name).toBe(SYNTHETIC_MCI_LOCATION.name);
    expect(report.latitude).toBe(SYNTHETIC_MCI_LOCATION.latitude);
    expect(report.longitude).toBe(SYNTHETIC_MCI_LOCATION.longitude);
    expect(report).not.toHaveProperty('reported_by');
    expect(report).not.toHaveProperty('contact_phone');
    expect(report).not.toHaveProperty('scene_notes');
    expect(JSON.stringify(getRecentMciIncidents()[0])).not.toContain('Real Person');
  });

  it('does not invent a sample incident when no reports exist or stored data is malformed', () => {
    expect(getRecentMciIncidents()).toEqual([]);
    storage.set('lifelink_mci_incidents', '{bad json');
    expect(getRecentMciIncidents()).toEqual([]);
  });

  it('reports a storage failure instead of claiming the report was saved', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: () => null, setItem: vi.fn(() => { throw new Error('quota'); }) }
    });
    await expect(reportMassCasualtyIncident({
      hazard_type: 'Multi-Vehicle Collision / Highway Pileup',
      triage: { red: 0, yellow: 0, green: 1, black: 0 }
    })).rejects.toThrow(/could not be saved/i);
  });
});
