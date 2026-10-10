import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { UserTable, UserRole } from '../types/database';
import { User } from '@supabase/supabase-js';
import { scheduleAuthProfileLookup } from '../services/authProfileScheduler';
import { inactiveUserProfileMessage, isActiveUserProfile } from '../services/profileAuthority';
import {
  loginWithSupabase,
  signUpWithSupabase,
  logoutWithSupabase,
  onSupabaseAuthStateChange,
  fetchSupabaseUserProfile,
  resendSupabaseConfirmation,
  resetPasswordWithSupabase,
  SignupPayload
} from '../services/supabaseAuth';

export type AuthViewMode = 'landing' | 'login' | 'signup' | 'forgot-password' | 'dashboard';

interface AuthContextType {
  user: User | null;
  userProfile: UserTable | null;
  loading: boolean;
  profileUnconfigured: boolean;
  viewMode: AuthViewMode;
  setViewMode: (mode: AuthViewMode) => void;
  login: (email: string, password: string) => Promise<UserTable>;
  signup: (payload: SignupPayload) => Promise<UserTable>;
  logout: () => Promise<void>;
  authError: string | null;
  clearAuthError: () => void;
  resendConfirmation: (email: string) => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserTable | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [profileUnconfigured, setProfileUnconfigured] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<AuthViewMode>('landing');
  const [authError, setAuthError] = useState<string | null>(null);
  const profileRequestId = useRef(0);

  useEffect(() => {
    let active = true;
    let pendingProfileUserId: string | null = null;
    let loadedProfileUserId: string | null = null;

    try {
      localStorage.removeItem('lifelink_active_demo_user');
    } catch {}

    // Keep this callback synchronous. Supabase documents a deadlock risk when
    // async Supabase calls run inside onAuthStateChange; defer profile lookup
    // until after the auth callback has returned.
    const sub = onSupabaseAuthStateChange((_event, session) => {
      const sessionUser = session?.user;
      if (!sessionUser) {
        profileRequestId.current += 1;
        pendingProfileUserId = null;
        loadedProfileUserId = null;
        setUser(null);
        setUserProfile(null);
        setProfileUnconfigured(false);
        setLoading(false);
        return;
      }

      setUser(sessionUser);
      if (loadedProfileUserId === sessionUser.id || pendingProfileUserId === sessionUser.id) return;

      const requestId = ++profileRequestId.current;
      pendingProfileUserId = sessionUser.id;
      setUserProfile(null);
      setProfileUnconfigured(false);
      setLoading(true);

      scheduleAuthProfileLookup(
        sessionUser.id,
        fetchSupabaseUserProfile,
        (userId, fetchedProfile) => {
          if (!active || userId !== sessionUser.id || requestId !== profileRequestId.current) return;
          pendingProfileUserId = null;
          if (!isActiveUserProfile(fetchedProfile)) {
            loadedProfileUserId = null;
            setUser(null);
            setUserProfile(null);
            setProfileUnconfigured(!fetchedProfile);
            setAuthError(fetchedProfile
              ? inactiveUserProfileMessage(fetchedProfile)
              : 'Your account profile is not configured. Contact an administrator for access.');
            setViewMode('login');
            setLoading(false);
            void logoutWithSupabase();
            return;
          }
          loadedProfileUserId = sessionUser.id;
          setUserProfile(fetchedProfile);
          setProfileUnconfigured(false);
          setAuthError(null);
          setViewMode('dashboard');
          setLoading(false);
        },
        (task, delayMs) => window.setTimeout(task, delayMs)
      );
    });

    return () => {
      active = false;
      profileRequestId.current += 1;
      sub.unsubscribe();
    };
  }, []);

  const clearAuthError = () => setAuthError(null);

  // Pure Supabase Auth Login
  const login = async (email: string, pass: string): Promise<UserTable> => {
    setAuthError(null);
    setProfileUnconfigured(false);

    const supRes = await loginWithSupabase(email, pass);
    if (supRes.error || !supRes.user) {
      const msg = supRes.error && supRes.error.toLowerCase().includes('email not confirmed')
        ? 'Email not confirmed. Please check your email inbox to verify your account.'
        : 'Invalid email or password';
      setAuthError(msg);
      throw new Error(msg);
    }

    setUser(supRes.user);
    const fetchedProfile = await fetchSupabaseUserProfile(supRes.user.id);
    
    if (!isActiveUserProfile(fetchedProfile)) {
      setProfileUnconfigured(!fetchedProfile);
      const msg = fetchedProfile
        ? inactiveUserProfileMessage(fetchedProfile)
        : 'Your account profile is not configured';
      setAuthError(msg);
      await logoutWithSupabase();
      setUser(null);
      setUserProfile(null);
      setViewMode('login');
      throw new Error(msg);
    }

    setUserProfile(fetchedProfile);
    setProfileUnconfigured(false);
    setViewMode('dashboard');
    return fetchedProfile;
  };

  // Pure Supabase Auth Signup
  const signup = async (payload: SignupPayload): Promise<UserTable> => {
    setAuthError(null);
    setProfileUnconfigured(false);

    const supRes = await signUpWithSupabase(payload);
    if (supRes.error || !supRes.user) {
      const msg = supRes.error || 'Signup failed. Please try again.';
      setAuthError(msg);
      throw new Error(msg);
    }

    // Supabase returns a user without a session when email confirmation is
    // enabled. Do not query RLS-protected profile data or treat that signup as
    // a broken account; send the user to the existing confirmation/resend flow.
    if (!supRes.session) {
      const msg = 'Email not confirmed. If registration succeeded, check your inbox for a verification link before signing in.';
      setUser(null);
      setUserProfile(null);
      setProfileUnconfigured(false);
      setAuthError(msg);
      setViewMode('login');
      throw new Error(msg);
    }

    setUser(supRes.user);

    // Fetch the inserted users table row
    const fetchedProfile = await fetchSupabaseUserProfile(supRes.user.id);
    if (!isActiveUserProfile(fetchedProfile)) {
      setProfileUnconfigured(!fetchedProfile);
      const msg = fetchedProfile
        ? inactiveUserProfileMessage(fetchedProfile)
        : 'Your account was created but its public.users profile is missing configuration details.';
      setAuthError(msg);
      await logoutWithSupabase();
      setUser(null);
      setUserProfile(null);
      setViewMode('login');
      throw new Error(msg);
    }

    setUserProfile(fetchedProfile);
    setProfileUnconfigured(false);
    setViewMode('dashboard');
    return fetchedProfile;
  };

  // Supabase Logout
  const logout = async () => {
    try {
      await logoutWithSupabase();
    } catch (e) {
      console.warn('Signout notice:', e);
    }
    setUser(null);
    setUserProfile(null);
    setProfileUnconfigured(false);
    setViewMode('landing');
  };

  const resendConfirmation = async (email: string) => {
    return await resendSupabaseConfirmation(email);
  };

  const resetPassword = async (email: string) => {
    return await resetPasswordWithSupabase(email);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        profileUnconfigured,
        viewMode,
        setViewMode,
        login,
        signup,
        logout,
        authError,
        clearAuthError,
        resendConfirmation,
        resetPassword
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
