import { describe, expect, it } from 'vitest';
import { inactiveUserProfileMessage, isActiveUserProfile } from '../services/profileAuthority';

describe('Supabase profile account authority', () => {
  it('allows only an explicitly active public.users profile', () => {
    expect(isActiveUserProfile({ status: true })).toBe(true);
    expect(isActiveUserProfile({ status: true, account_status: 'active' })).toBe(true);
    expect(isActiveUserProfile({ status: true, account_status: 'pending' })).toBe(false);
    expect(isActiveUserProfile({ status: true, account_status: 'suspended' })).toBe(false);
    expect(isActiveUserProfile({ status: true, account_status: 'revoked' })).toBe(false);
    expect(isActiveUserProfile({ status: false })).toBe(false);
    expect(isActiveUserProfile(null)).toBe(false);
    expect(isActiveUserProfile(undefined)).toBe(false);
  });

  it.each([
    ['pending', 'awaiting platform verification'],
    ['suspended', 'account is suspended'],
    ['revoked', 'account has been revoked']
  ] as const)('explains the %s account state', (accountStatus, expectedMessage) => {
    expect(inactiveUserProfileMessage({ status: false, account_status: accountStatus })).toContain(expectedMessage);
  });
});
