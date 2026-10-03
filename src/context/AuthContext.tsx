import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserTable, UserRole } from '../types/database';
import { User } from '@supabase/supabase-js';
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

  useEffect(() => {
    // Check for active demo user override
    try {
      const demoRaw = localStorage.getItem('lifelink_active_demo_user');
      if (demoRaw) {
        const demoUser = JSON.parse(demoRaw) as UserTable;
        setUserProfile(demoUser);
        setProfileUnconfigured(false);
      }
    } catch {}

    const handleDemoRoleChange = (e: any) => {
      if (e.detail) {
        setUserProfile(e.detail);
        setProfileUnconfigured(false);
      }
    };
    window.addEventListener('lifelink_demo_role_change', handleDemoRoleChange);

    // Listen strictly to Supabase Auth State for Session Persistence
    const sub = onSupabaseAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser(session.user);
        const fetchedProfile = await fetchSupabaseUserProfile(session.user.id);
        if (fetchedProfile) {
          setUserProfile(fetchedProfile);
          setProfileUnconfigured(false);
        } else {
          // If no custom profile in DB, check demo user
          const demoRaw = localStorage.getItem('lifelink_active_demo_user');
          if (demoRaw) {
            setUserProfile(JSON.parse(demoRaw));
            setProfileUnconfigured(false);
          } else {
            setUserProfile(null);
            setProfileUnconfigured(true);
          }
        }
      } else {
        const demoRaw = localStorage.getItem('lifelink_active_demo_user');
        if (demoRaw) {
          setUserProfile(JSON.parse(demoRaw));
          setProfileUnconfigured(false);
        } else {
          setUser(null);
          setUserProfile(null);
          setProfileUnconfigured(false);
        }
      }
      setLoading(false);
    });

    return () => {
      sub.unsubscribe();
      window.removeEventListener('lifelink_demo_role_change', handleDemoRoleChange);
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
    
    if (!fetchedProfile) {
      setProfileUnconfigured(true);
      const msg = 'Your account profile is not configured';
      setAuthError(msg);
      await logoutWithSupabase();
      setUser(null);
      setUserProfile(null);
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

    setUser(supRes.user);

    // Fetch the inserted users table row
    const fetchedProfile = await fetchSupabaseUserProfile(supRes.user.id);
    if (!fetchedProfile) {
      setProfileUnconfigured(true);
      const msg = 'Your account profile was created but is missing configuration details in public.users.';
      setAuthError(msg);
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
