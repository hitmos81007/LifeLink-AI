import React, { useState } from 'react';
import { CheckCircle2, Clock3, FileCheck2, LogOut, ShieldCheck, Upload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { uploadProviderVerificationDocument } from '../../services/providerVerificationDocumentService';

export const PendingApprovalPage: React.FC = () => {
  const { userProfile, logout, authError, clearAuthError } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitDocument = async () => {
    if (!file || uploading) return;
    setUploading(true); setError(null); setMessage(null); clearAuthError();
    try {
      await uploadProviderVerificationDocument(file, 'Provider registration proof');
      setFile(null);
      setMessage('Your proof document was uploaded privately and is ready for administrator review.');
    } catch (uploadError: any) {
      setError(uploadError?.message || 'The document could not be uploaded. Please try again.');
    } finally { setUploading(false); }
  };

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
            Your account remains inactive until an administrator reviews your provider proof and approves the account.
          </p>
        </div>
        <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/70 p-4" aria-labelledby="pending-proof-heading">
          <div className="flex items-center gap-2 text-sm font-bold text-white"><FileCheck2 className="h-4 w-4 text-sky-300" /><h2 id="pending-proof-heading">Provider verification proof</h2></div>
          <p className="text-xs leading-relaxed text-slate-400">Attach a current registration or operating licence, blood bank authorization, or ambulance permit. PDF, JPG, or PNG; up to 10 MB. Only you and platform administrators can view it.</p>
          <input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={(event) => setFile(event.target.files?.[0] || null)} className="block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:font-semibold file:text-white" aria-label="Choose provider verification proof" />
          {(authError || error) && <p className="rounded-lg border border-rose-800 bg-rose-950/40 p-3 text-xs text-rose-200" role="alert">{error || authError}</p>}
          {message && <p className="rounded-lg border border-emerald-800 bg-emerald-950/40 p-3 text-xs text-emerald-200" role="status">{message}</p>}
          <button type="button" onClick={() => void submitDocument()} disabled={!file || uploading} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            <Upload className="h-4 w-4" />{uploading ? 'Uploading securely…' : 'Upload proof privately'}
          </button>
        </section>
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
