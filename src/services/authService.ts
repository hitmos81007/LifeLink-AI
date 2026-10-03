import { supabase } from '../lib/supabase/client';
import { UserTable } from '../types/database';

export async function getCurrentUserProfile(): Promise<UserTable | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user) return null;

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', sessionData.session.user.id)
      .single();

    if (!error && data) {
      return data as UserTable;
    }
  } catch (error) {
    console.warn('authService: Error fetching user profile from Supabase:', error);
  }
  return null;
}

export async function updateUserProfileService(
  userId: string,
  profileData: Partial<UserTable>
): Promise<UserTable | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({
        ...profileData,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (!error && data) {
      return data as UserTable;
    }
  } catch (err) {
    console.warn('updateUserProfileService notice:', err);
  }
  return null;
}
