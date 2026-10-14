import React from 'react';
import { CheckCircle2, Clock3, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const PendingApprovalPage: React.FC = () => {
  const { userProfile, logout } = useAuth();

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
      <section className="w-full max-w-lg rounded-2xl border border-amber-800/70 bg-slate-800/90 p-7 shadow-2xl space-y-5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-amber-700 bg-amber-950/70 text-amber-300">
          <Clock3 className="h-7 w-7" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Account status</p>
          <h1 className="text-2xl font-black text-white">Provider approval pending</h1>
          <p className="text-sm leading-relaxed text-slate-300">
            Your sign-in succeeded. A platform administrator must verify this provider account before operational dashboards become available.
          </p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold text-white">
            <ShieldCheck className="h-4 w-4 text-amber-300" />
            {userProfile?.full_name || 'Your account'}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            You do not need to register again. After approval, sign in again to open your dashboard.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-950/50 px-4 py-3 text-xs font-semibold text-amber-200" role="status">
            <CheckCircle2 className="h-4 w-4" /> Credentials accepted
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-700 px-4 py-3 text-xs font-bold text-white transition hover:bg-slate-600"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </section>
    </main>
  );
};
