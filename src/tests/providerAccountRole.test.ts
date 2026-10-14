import { describe, expect, it } from 'vitest';
import { hasCapability, normalizeAppRole } from '../types/roles';

describe('provider account administration role boundary', () => {
  it('recognizes a platform administrator role without making it a public signup role', async () => {
    expect(normalizeAppRole('platform_admin')).toBe('platform_admin');
    const { PUBLIC_ROLE_OPTIONS } = await import('../types/roles');
    expect(PUBLIC_ROLE_OPTIONS.some((option) => option.role === 'platform_admin')).toBe(false);
  });

  it('keeps provider review separate from district and clinical authority', () => {
    expect(hasCapability('platform_admin', 'review_provider_account')).toBe(true);
    expect(hasCapability('government_admin', 'review_provider_account')).toBe(false);
    expect(hasCapability('clinician_reviewer', 'review_provider_account')).toBe(false);
    expect(hasCapability('hospital_approver', 'review_provider_account')).toBe(false);
    expect(hasCapability('government_admin', 'manage_system_configuration')).toBe(false);
  });
});
