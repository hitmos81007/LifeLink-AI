import React, { useEffect, useState } from 'react';
import { testSupabaseConnection } from '../../lib/supabase/client';
import { Database, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

export const SupabaseStatusBanner: React.FC = () => {
  const [status, setStatus] = useState<{ loading: boolean; connected: boolean; message: string }>({
    loading: true,
    connected: false,
    message: 'Testing connection to Supabase...',
  });

  const checkConnection = async () => {
    setStatus({ loading: true, connected: false, message: 'Verifying Supabase connectivity...' });
    const result = await testSupabaseConnection();
    setStatus({
      loading: false,
      connected: result.connected,
      message: result.message,
    });
  };

  useEffect(() => {
    checkConnection();
  }, []);

  return (
    <div
      className={`px-4 py-2 border-b text-xs font-semibold flex items-center justify-between transition-colors ${
        status.loading
          ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-300'
          : status.connected
          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
          : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-300'
      }`}
    >
      <div className="flex items-center space-x-2 max-w-4xl overflow-hidden">
        <Database className="w-4 h-4 shrink-0" />
        <span className="font-bold shrink-0">Supabase:</span>
        {status.loading ? (
          <span className="flex items-center space-x-1.5 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Connecting to Supabase...</span>
          </span>
        ) : status.connected ? (
          <span className="flex items-center space-x-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="font-bold text-emerald-700 dark:text-emerald-300">Connected to Supabase</span>
            <span className="hidden sm:inline text-emerald-600 dark:text-emerald-400 font-normal">
              — {status.message}
            </span>
          </span>
        ) : (
          <span className="flex items-center space-x-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="font-medium text-amber-800 dark:text-amber-200 truncate">{status.message}</span>
          </span>
        )}
      </div>

      <button
        onClick={checkConnection}
        disabled={status.loading}
        className="ml-2 px-2 py-0.5 text-[11px] rounded bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors flex items-center space-x-1 shrink-0"
        title="Re-verify Supabase Connection"
      >
        <RefreshCw className={`w-3 h-3 ${status.loading ? 'animate-spin' : ''}`} />
        <span className="hidden sm:inline">Verify Connection</span>
      </button>
    </div>
  );
};
