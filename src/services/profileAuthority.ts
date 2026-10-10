import { UserTable } from '../types/database';

/** The database user row, not the auth session or metadata, decides account access. */
export function isActiveUserProfile(profile: Pick<UserTable, 'status'> & Partial<Pick<UserTable, 'account_status'>> | null | undefined): boolean {
  return profile?.status === true && (profile.account_status == null || profile.account_status === 'active');
}

export function inactiveUserProfileMessage(profile: Pick<UserTable, 'status'> & Partial<Pick<UserTable, 'account_status'>> | null | undefined): string {
  switch (profile?.account_status) {
    case 'pending': return 'Your provider account is awaiting platform verification. You can sign in after it is approved.';
    case 'suspended': return 'This account is suspended. Contact a platform administrator for access.';
    case 'revoked': return 'This account has been revoked. Contact a platform administrator for help.';
    default: return 'This account is inactive. Contact an administrator for access.';
  }
}
