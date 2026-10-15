import { createClient } from '@supabase/supabase-js';

const env = import.meta.env;
const processEnv = typeof process !== 'undefined' && process.env ? process.env : {};

const configuredUrl = String(env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL ||
  processEnv.SUPABASE_URL || processEnv.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const configuredAnonKey = String(env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || processEnv.SUPABASE_ANON_KEY ||
  processEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || processEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim();
export const isSupabaseConfigured = Boolean(configuredUrl && configuredAnonKey);

// Never silently direct a local or misconfigured build to a shared remote project.
const clientUrl = isSupabaseConfigured ? configuredUrl : 'https://supabase-not-configured.invalid';
const clientKey = isSupabaseConfigured ? configuredAnonKey : 'supabase-not-configured';
const blockedFetch: typeof fetch = async () => {
  throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
};
const clientOptions = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  ...(!isSupabaseConfigured ? { global: { fetch: blockedFetch } } : {}),
};

export const supabase = createClient(clientUrl, clientKey, clientOptions);

export const createSupabaseClient = () => createClient(clientUrl, clientKey, clientOptions);

/**
 * Read-only connection check. Missing configuration is reported without making a request.
 */
export async function testSupabaseConnection(): Promise<{ connected: boolean; message: string }> {
  if (!isSupabaseConfigured) {
    return {
      connected: false,
      message: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    };
  }

  try {
    const { error } = await supabase
      .from('hospitals')
      .select('hospital_id', { count: 'exact', head: true })
      .limit(0);
    if (error) return { connected: false, message: `Supabase database check failed: ${error.message}` };
    return { connected: true, message: 'Database reachable' };
  } catch (err: any) {
    return { connected: false, message: `Failed to reach Supabase: ${err.message || 'Network error'}` };
  }
}
