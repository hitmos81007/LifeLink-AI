import { supabase } from '../lib/supabase/client';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { UserTable, UserRole } from '../types/database';

export interface SupabaseAuthResponse {
  user: User | null;
  session: Session | null;
  error: string | null;
}

/**
 * Save user profile in Supabase database table `users`
 * Payload strictly matches PostgreSQL schema:
 * user_id, full_name, email, phone, role, hospital_id, blood_bank_id, ambulance_provider_id, status
 */
export async function saveSupabaseUserProfile(payload: {
  user_id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  role: UserRole;
  hospital_id?: string | null;
  blood_bank_id?: string | null;
  ambulance_provider_id?: string | null;
}): Promise<UserTable | null> {
  const userPayload = {
    user_id: payload.user_id,
    full_name: payload.full_name,
    email: payload.email,
    phone: payload.phone || null,
    role: payload.role,
    hospital_id: (payload.role === 'hospital_admin' || payload.role === 'hospital_approver') ? (payload.hospital_id || null) : null,
    blood_bank_id: payload.role === 'blood_bank_admin' ? (payload.blood_bank_id || null) : null,
    ambulance_provider_id: payload.role === 'ambulance_admin' ? (payload.ambulance_provider_id || null) : null,
    status: true
  };

  try {
    const { data, error } = await supabase
      .from('users')
      .upsert([userPayload], { onConflict: 'user_id' })
      .select()
      .maybeSingle();

    if (error) {
      console.warn('Supabase notice when saving user profile to users table:', error.message);
      return null;
    }

    return (data as UserTable) || null;
  } catch (err: any) {
    console.warn('saveSupabaseUserProfile exception:', err?.message || err);
    return null;
  }
}

/**
 * Fetch user profile from `users` table matching user_id.
 * Strict Ground Truth: Supabase public.users is the SOLE authority for roles & profiles.
 * Never falls back to client localStorage, session storage, or auth.user.user_metadata.
 */
export async function fetchSupabaseUserProfile(userId: string): Promise<UserTable | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      return data as UserTable;
    }
    if (error) {
      console.warn(`Profile query notice for user_id ${userId}:`, error.message);
    }
  } catch (e: any) {
    console.warn('fetchSupabaseUserProfile exception:', e);
  }

  // If public.users record is missing, return null to indicate unconfigured profile
  return null;
}

/**
 * Supabase Email & Password Login
 */
export async function loginWithSupabase(email: string, password: string): Promise<SupabaseAuthResponse> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return { user: null, session: null, error: error.message };
    }
    return { user: data.user, session: data.session, error: null };
  } catch (err: any) {
    return { user: null, session: null, error: err.message || 'An unexpected error occurred during login' };
  }
}

export interface SignupPayload {
  email: string;
  password: string;
  full_name: string;
  phone?: string | null;
  role: UserRole;
  // Hospital registration fields
  hospital_name?: string;
  hospital_address?: string;
  district?: string;
  state?: string;
  hospital_type?: string;
  trauma_center?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  // Ambulance provider registration fields
  provider_name?: string;
  // Blood bank registration fields
  blood_bank_name?: string;
  blood_bank_address?: string;
  // Legacy optional IDs
  hospital_id?: string | null;
  blood_bank_id?: string | null;
  ambulance_provider_id?: string | null;
}

/**
 * Supabase Email & Password Sign Up
 */
export async function signUpWithSupabase(payload: SignupPayload): Promise<SupabaseAuthResponse> {
  try {
    let metadata: Record<string, any> = {};

    if (payload.role === 'hospital_admin') {
      metadata = {
        full_name: payload.full_name,
        phone: payload.phone || null,
        role: 'hospital_admin',
        hospital_name: payload.hospital_name,
        hospital_address: payload.hospital_address,
        district: payload.district,
        state: payload.state,
        hospital_type: payload.hospital_type,
        trauma_center: payload.trauma_center ?? false,
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
      };
    } else if (payload.role === 'ambulance_admin') {
      metadata = {
        full_name: payload.full_name,
        phone: payload.phone || null,
        role: 'ambulance_admin',
        provider_name: payload.provider_name,
        district: payload.district,
        state: payload.state,
      };
    } else if (payload.role === 'blood_bank_admin') {
      metadata = {
        full_name: payload.full_name,
        phone: payload.phone || null,
        role: 'blood_bank_admin',
        blood_bank_name: payload.blood_bank_name,
        blood_bank_address: payload.blood_bank_address,
        district: payload.district,
        state: payload.state,
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
      };
    } else {
      metadata = {
        full_name: payload.full_name,
        phone: payload.phone || null,
        role: payload.role,
      };
    }

    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: metadata,
      },
    });

    if (error) {
      return { user: null, session: null, error: error.message };
    }

    if (data.session) {
      try {
        await supabase.auth.setSession(data.session);
      } catch {}
    }

    return { user: data.user, session: data.session, error: null };
  } catch (err: any) {
    return { user: null, session: null, error: err.message || 'An unexpected error occurred during signup' };
  }
}

/**
 * Resend Supabase Signup Email Confirmation
 */
export async function resendSupabaseConfirmation(email: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
    });
    if (error) {
      return { error: error.message };
    }
    return { error: null };
  } catch (err: any) {
    return { error: err.message || 'Failed to resend confirmation email.' };
  }
}

/**
 * Reset password via Supabase Auth
 */
export async function resetPasswordWithSupabase(email: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) {
      return { error: error.message };
    }
    return { error: null };
  } catch (err: any) {
    return { error: err.message || 'Failed to send password reset email.' };
  }
}

/**
 * Supabase Logout
 */
export async function logoutWithSupabase(): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { error: error.message };
    }
    return { error: null };
  } catch (err: any) {
    return { error: err.message || 'An unexpected error occurred during logout' };
  }
}

/**
 * Get current active session
 */
export async function getSupabaseSession(): Promise<Session | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session;
  } catch {
    return null;
  }
}

/**
 * Listen to auth state change for session persistence
 */
export function onSupabaseAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void
) {
  const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return authListener.subscription;
}
