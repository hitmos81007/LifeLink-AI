import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  (typeof process !== 'undefined' && process.env && process.env.SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_SUPABASE_URL) ||
  'https://mredtklmtkocbwazanio.supabase.co';

const supabaseAnonKey =
  (typeof process !== 'undefined' && process.env && process.env.SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yZWR0a2xtdGtvY2J3YXphbmlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3NzAwOTgsImV4cCI6MjEwMDM0NjA5OH0.-NKMYD_CtnLasP-vI6svaZKaoemJ64NnRzv0xtcN_DE';

export const createServerSupabaseClient = () => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
    },
  });
};

export const supabaseServer = createServerSupabaseClient();
