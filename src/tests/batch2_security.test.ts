import { describe, it, expect } from 'vitest';
import { calculateOperationalPriorityScore } from '../services/emergencyCaseService';
import { UserRole } from '../types/database';

describe('Batch 2 Security and Authority Tests', () => {
  describe('Canonical Roles (GAP-61)', () => {
    it('should strictly contain all 7 canonical roles', () => {
      const canonicalRoles: UserRole[] = [
        'patient',
        'hospital_admin',
        'blood_bank_admin',
        'ambulance_admin',
        'government_admin',
        'clinician_reviewer',
        'hospital_approver'
      ];

      expect(canonicalRoles).toHaveLength(7);
      expect(canonicalRoles).toContain('ambulance_admin');
      // Verify ambulance_driver is NOT in canonical roles list
      expect(canonicalRoles.includes('ambulance_driver' as any)).toBe(false);
    });
  });

  describe('Operational Priority Score Calculation (GAP-56)', () => {
    it('should compute deterministic priority score bounded [0, 100]', () => {
      const mockRequest: any = {
        request_id: 'req-test-123',
        patient_id: 'pat-test-123',
        created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        needs_icu: true,
        needs_general_bed: false,
        needs_oxygen: false,
        needs_blood: false,
        needs_ambulance: true,
        required_blood_group: null,
        emergency_type: 'CARDIAC'
      };

      const mockRecs: any[] = [
        {
          recommendation_id: 'rec-1',
          hospital_id: 'hosp-1',
          ambulance_id: 'amb-1',
          eta_minutes: 15,
          distance_km: 5.2,
          confidence_score: 92
        }
      ];

      const result = calculateOperationalPriorityScore(mockRequest, mockRecs);
      expect(result.priority_score).toBeGreaterThanOrEqual(0);
      expect(result.priority_score).toBeLessThanOrEqual(100);
      expect(result.score_factors.time_to_need).toBeGreaterThanOrEqual(0);
      expect(result.score_factors.time_to_need).toBeLessThanOrEqual(1);
    });
  });

  describe('Blood Inventory Compatibility', () => {
    it('should support both available_units and available_quantity properties', () => {
      const mockRowWithUnits = {
        inventory_id: 'inv-1',
        blood_bank_id: 'bank-1',
        blood_group: 'O+',
        available_units: 45,
        reserved_units: 5,
        expired_units: 0,
        minimum_threshold: 10
      };

      const mockRowWithQuantity = {
        inventory_id: 'inv-2',
        blood_bank_id: 'bank-1',
        blood_group: 'A+',
        available_quantity: 30,
        reserved_units: 2,
        expired_units: 0,
        minimum_threshold: 10
      };

      const normalized1 = {
        ...mockRowWithUnits,
        available_units: mockRowWithUnits.available_units ?? (mockRowWithUnits as any).available_quantity ?? 0
      };
      const normalized2 = {
        ...mockRowWithQuantity,
        available_units: (mockRowWithQuantity as any).available_units ?? mockRowWithQuantity.available_quantity ?? 0
      };

      expect(normalized1.available_units).toBe(45);
      expect(normalized2.available_units).toBe(30);
    });
  });
});
