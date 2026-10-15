import { supabase } from '../lib/supabase/client';

/** Subscribe to permitted database changes. Row access remains governed by Supabase RLS. */
export function subscribeToSupabaseRealtime(
  tables: string[],
  onDataChange: (tableName: string, payload: any) => void
) {
  const uniqueId = Math.random().toString(36).substring(2, 9);
  const channel = supabase.channel(`public:realtime_${Date.now()}_${uniqueId}`);

  tables.forEach((table) => {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload) => onDataChange(table, payload)
    );
  });

  channel.subscribe();
  return () => { void supabase.removeChannel(channel); };
}

