import { createClient } from '@supabase/supabase-js';

const meta = import.meta as any;
const env = meta.env || {};

const supabaseUrl =
  env.VITE_SUPABASE_URL ||
  (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env && process.env.SUPABASE_URL) ||
  'https://mredtklmtkocbwazanio.supabase.co';

const supabaseAnonKey =
  env.VITE_SUPABASE_ANON_KEY ||
  (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && process.env && process.env.SUPABASE_ANON_KEY) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yZWR0a2xtdGtvY2J3YXphbmlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3NzAwOTgsImV4cCI6MjEwMDM0NjA5OH0.-NKMYD_CtnLasP-vI6svaZKaoemJ64NnRzv0xtcN_DE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const createSupabaseClient = () => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
};

/**
 * Connection test function verifying reachability to Supabase
 */
export async function testSupabaseConnection(): Promise<{ connected: boolean; message: string }> {
  try {
    const { error } = await supabase.from('hospitals').select('count', { count: 'exact', head: true });
    if (error && error.code !== 'PGRST116') {
      const { error: authErr } = await supabase.auth.getSession();
      if (authErr) {
        return { connected: false, message: `Supabase connection error: ${authErr.message}` };
      }
    }
    return { connected: true, message: 'Connected to Supabase' };
  } catch (err: any) {
    return { connected: false, message: `Failed to reach Supabase: ${err.message || 'Network error'}` };
  }
}
