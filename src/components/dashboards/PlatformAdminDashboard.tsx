import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, UserRoundCog, UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { hasCapability } from '../../types/roles';
import {
  getProviderAccountReviewHistory,
  getProviderAccountsForReview,
  ProviderAccountForReview,
  ProviderAccountReviewEvent,
  ProviderDecision,
  reviewProviderAccount
} from '../../services/providerAccountService';
import { DemoRoleOptions, DemoRoleProvisioningEvent, DemoProvisionableRole, getDemoRoleProvisioningHistory, getDemoRoleProvisioningOptions, getSyntheticDemoRegistrationCandidates, provisionDemoAccountRole, registerSyntheticDemoAccount, RESTRICTED_DEMO_ROLES, SyntheticDemoRegistrationCandidate } from '../../services/demoRoleProvisioningService';
import { listProviderVerificationDocuments, openProviderVerificationDocument, ProviderVerificationDocument, reviewProviderVerificationDocument } from '../../services/providerVerificationDocumentService';

const decisionLabel: Record<ProviderDecision, string> = {
  activate: 'Activate provider',
  suspend: 'Suspend provider',
  revoke: 'Revoke provider'
};

export const PlatformAdminDashboard: React.FC = () => {
  const { userProfile } = useAuth();
  const [accounts, setAccounts] = useState<ProviderAccountForReview[]>([]);
  const [verificationDocuments, setVerificationDocuments] = useState<ProviderVerificationDocument[]>([]);
  const [history, setHistory] = useState<ProviderAccountReviewEvent[]>([]);
  const [accountsUnavailable, setAccountsUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ account: ProviderAccountForReview; decision: ProviderDecision } | null>(null);
  const [reason, setReason] = useState('');
  const [reviewFeedback, setReviewFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [demoOptions, setDemoOptions] = useState<DemoRoleOptions>({ accounts: [], hospitals: [] });
  const [demoProvisioningSchemaReady, setDemoProvisioningSchemaReady] = useState(true);
  const [registrationCandidates, setRegistrationCandidates] = useState<SyntheticDemoRegistrationCandidate[]>([]);
  const [registrationUserId, setRegistrationUserId] = useState('');
  const [registrationReason, setRegistrationReason] = useState('');
  const [confirmedSynthetic, setConfirmedSynthetic] = useState(false);
  const [demoHistory, setDemoHistory] = useState<DemoRoleProvisioningEvent[]>([]);
  const [demoUserId, setDemoUserId] = useState('');
  const [demoRole, setDemoRole] = useState<DemoProvisionableRole>('clinician_reviewer');
  const [demoHospitalId, setDemoHospitalId] = useState('');
  const [demoReason, setDemoReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAccountsUnavailable(false);
    try {
      // Provider verification is the core admin workflow. Keep it independent
      // of the optional synthetic-demo role tools so a missing demo migration
      // cannot make pending provider accounts disappear from this dashboard.
      const nextAccounts = await getProviderAccountsForReview();
      setAccounts(nextAccounts);
      try { setVerificationDocuments(await listProviderVerificationDocuments()); }
      catch (documentError: any) {
        setVerificationDocuments([]);
        setError(`Provider accounts loaded, but verification documents are unavailable: ${documentError?.message || 'database request failed'}`);
      }
      try {
        setHistory(await getProviderAccountReviewHistory());
      } catch (historyError: any) {
        setHistory([]);
        setError(`Provider accounts loaded, but review history is unavailable: ${historyError?.message || 'database request failed'}`);
      }
    } catch (err: any) {
      setAccounts([]);
      setHistory([]);
      setAccountsUnavailable(true);
      setError(err?.message || 'Provider review data could not be loaded.');
    } finally {
      setLoading(false);
    }

    // Demo-role provisioning is supplementary and can be unavailable until
    // its own schema migration is installed. It must not block provider review.
    const [demoOptionsResult, demoHistoryResult, candidatesResult] = await Promise.allSettled([
      getDemoRoleProvisioningOptions(),
      getDemoRoleProvisioningHistory(),
      getSyntheticDemoRegistrationCandidates()
    ]);
    if (demoOptionsResult.status === 'fulfilled' && demoHistoryResult.status === 'fulfilled' && candidatesResult.status === 'fulfilled') {
      const nextDemoOptions = demoOptionsResult.value;
      setDemoOptions(nextDemoOptions);
      setDemoHistory(demoHistoryResult.value);
      setDemoUserId((current) => current && nextDemoOptions.accounts.some((account) => account.user_id === current) ? current : '');
      setRegistrationCandidates(candidatesResult.value);
      setRegistrationUserId((current) => current && candidatesResult.value.some((candidate) => candidate.user_id === current) ? current : '');
      setDemoProvisioningSchemaReady(true);
    } else {
      setDemoOptions({ accounts: [], hospitals: [] });
      setDemoHistory([]);
      setDemoUserId('');
      setRegistrationCandidates([]);
      setRegistrationUserId('');
      setDemoProvisioningSchemaReady(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!hasCapability(userProfile?.role, 'review_provider_account')) {
    return <div className="p-8 text-center text-slate-300">This workspace requires a platform administrator account.</div>;
  }

  const requestDecision = (account: ProviderAccountForReview, decision: ProviderDecision) => {
    setNotice(null);
    setReviewFeedback(null);
    setReason('');
    setSelected({ account, decision });
  };

  const confirmDecision = async () => {
    if (!selected || reason.trim().length < 3 || reason.trim().length > 500 || saving) return;
    setSaving(true);
    setError(null);
    setReviewFeedback('Saving review…');
    try {
      await reviewProviderAccount(selected.account.user_id, selected.decision, reason);
      setNotice(`${selected.account.provider_name || 'Provider account'} is now ${selected.decision === 'activate' ? 'active' : selected.decision === 'suspend' ? 'suspended' : 'revoked'}.`);
      setReviewFeedback(null);
      setSelected(null);
      setReason('');
      await load();
    } catch (err: any) {
      const message = err?.message || 'Provider review could not be saved.';
      setError(message);
      setReviewFeedback(message);
    } finally {
      setSaving(false);
    }
  };

  const reviewProof = async (document: ProviderVerificationDocument, decision: 'verified' | 'rejected') => {
    const reviewReason = window.prompt(`Required reason to ${decision === 'verified' ? 'verify' : 'reject'} this proof (3–500 characters):`);
    if (!reviewReason || reviewReason.trim().length < 3 || reviewReason.trim().length > 500) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      await reviewProviderVerificationDocument(document.document_id, decision, reviewReason);
      setNotice(`Document ${decision} for ${accounts.find((account) => account.user_id === document.user_id)?.provider_name || 'provider'}.`);
      setVerificationDocuments(await listProviderVerificationDocuments());
      await load();
    } catch (err: any) { setError(err?.message || 'Document review could not be saved.'); }
    finally { setSaving(false); }
  };

  const provisionRole = async () => {
    const hospitalRole = demoRole === 'hospital_admin' || demoRole === 'hospital_approver';
    if (!demoUserId || demoReason.trim().length < 3 || demoReason.trim().length > 500 || saving ||
        (hospitalRole && !demoHospitalId)) return;
    setSaving(true);
    setError(null);
    try {
      const account = demoOptions.accounts.find((candidate) => candidate.user_id === demoUserId);
      await provisionDemoAccountRole({ userId: demoUserId, role: demoRole, hospitalId: hospitalRole ? demoHospitalId : null, reason: demoReason });
      setNotice(`${account?.full_name || 'Demo account'} was assigned ${RESTRICTED_DEMO_ROLES.find((option) => option.role === demoRole)?.label}.`);
      setDemoUserId(''); setDemoHospitalId(''); setDemoReason('');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Demo role could not be provisioned.');
    } finally {
      setSaving(false);
    }
  };

  const registerDemoAccount = async () => {
    if (!registrationUserId || !confirmedSynthetic || registrationReason.trim().length < 3 || registrationReason.trim().length > 500 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const account = registrationCandidates.find((candidate) => candidate.user_id === registrationUserId);
      await registerSyntheticDemoAccount({ userId: registrationUserId, reason: registrationReason, confirmedSynthetic });
      setNotice(`${account?.full_name || 'Account'} was registered as dedicated synthetic demo data.`);
      setRegistrationUserId(''); setRegistrationReason(''); setConfirmedSynthetic(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Synthetic demo account could not be registered.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-5rem)] rounded-2xl border border-slate-800 bg-slate-950 p-4 text-slate-100 shadow-2xl sm:p-6 lg:p-8 space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-violet-400" /><h1 className="text-xl font-black text-white">Provider Account Verification</h1></div>
          <p className="mt-1 text-xs text-slate-400">Platform administration • provider access only; no clinical or hospital operational approvals</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-50">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </header>

      <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 text-xs text-amber-200" role="note">
        New hospital, blood bank, and ambulance provider signups stay inactive until reviewed. Activating a provider makes the account and its facility discoverable; enter the verification reason before saving.
      </div>
      {error && <div className="rounded-xl border border-rose-800 bg-rose-950/40 p-4 text-sm text-rose-200" role="alert">{error}</div>}
      {notice && <div className="flex items-center gap-2 rounded-xl border border-emerald-800 bg-emerald-950/40 p-4 text-sm text-emerald-200" role="status"><CheckCircle2 className="h-4 w-4" />{notice}</div>}

      {hasCapability(userProfile?.role, 'manage_demo_account_roles') && <section className="space-y-4 rounded-2xl border border-sky-800/70 bg-sky-950/20 p-5" aria-labelledby="demo-role-heading">
        <div className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-sky-400" /><div><h2 id="demo-role-heading" className="font-black text-white">Assign a restricted demo role</h2><p className="mt-1 text-xs text-slate-400">Only accounts explicitly registered as dedicated synthetic data appear here. Each role assignment records the admin, previous role, hospital link, and reason.</p></div></div>
        {!demoProvisioningSchemaReady ? <p className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-amber-200" role="status">Role assignment is temporarily disabled until the synthetic demo account migration is applied in Supabase.</p> : <>
        <div className="space-y-3 rounded-xl border border-amber-800/60 bg-amber-950/25 p-4">
          <div><h3 className="text-sm font-bold text-amber-100">Register a dedicated synthetic account</h3><p className="mt-1 text-xs text-amber-200/80">Review the account first. Do not register a real patient account for testing.</p></div>
          {registrationCandidates.length === 0 ? <p className="text-xs text-slate-400">No unregistered confirmed patient accounts are available for review.</p> : <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs font-bold text-slate-300">Patient account to review<select value={registrationUserId} onChange={(event) => setRegistrationUserId(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-white"><option value="">Select account</option>{registrationCandidates.map((account) => <option key={account.user_id} value={account.user_id}>{account.full_name} · {account.email}</option>)}</select></label>
            <label className="flex items-center gap-2 self-end rounded-lg border border-amber-900/60 bg-slate-900 p-3 text-xs text-amber-100"><input type="checkbox" checked={confirmedSynthetic} onChange={(event) => setConfirmedSynthetic(event.target.checked)} />I verified this is a dedicated synthetic test account</label>
            <label className="space-y-1 text-xs font-bold text-slate-300 md:col-span-2">Required verification reason<textarea value={registrationReason} onChange={(event) => setRegistrationReason(event.target.value)} maxLength={500} rows={2} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-white" placeholder="Record how you verified this account is reserved for synthetic testing." /></label>
            <div className="md:col-span-2 flex justify-end"><button type="button" onClick={() => void registerDemoAccount()} disabled={saving || !registrationUserId || !confirmedSynthetic || registrationReason.trim().length < 3} className="rounded-lg border border-amber-700 px-4 py-2 text-xs font-bold text-amber-100 hover:bg-amber-950 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving…' : 'Register synthetic account'}</button></div>
          </div>}
        </div>
        {demoOptions.accounts.length === 0 ? <p className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">No confirmed active patient accounts are ready for role assignment.</p> : <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs font-bold text-slate-300">Registered synthetic account<select value={demoUserId} onChange={(event) => setDemoUserId(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-white"><option value="">Select account</option>{demoOptions.accounts.map((account) => <option key={account.user_id} value={account.user_id}>{account.full_name} · {account.email}</option>)}</select></label>
          <label className="space-y-1 text-xs font-bold text-slate-300">New role<select value={demoRole} onChange={(event) => { setDemoRole(event.target.value as DemoProvisionableRole); setDemoHospitalId(''); }} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-white">{RESTRICTED_DEMO_ROLES.map((option) => <option key={option.role} value={option.role}>{option.label}</option>)}</select></label>
          {(demoRole === 'hospital_admin' || demoRole === 'hospital_approver') && <label className="space-y-1 text-xs font-bold text-slate-300 md:col-span-2">Synthetic demo hospital<select value={demoHospitalId} onChange={(event) => setDemoHospitalId(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-white"><option value="">Select hospital</option>{demoOptions.hospitals.map((hospital) => <option key={hospital.hospital_id} value={hospital.hospital_id}>{hospital.hospital_name} · {hospital.district}, {hospital.state}</option>)}</select></label>}
          <label className="space-y-1 text-xs font-bold text-slate-300 md:col-span-2">Required assignment reason<textarea value={demoReason} onChange={(event) => setDemoReason(event.target.value)} maxLength={500} rows={2} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-white" placeholder="Explain why this confirmed demo account needs the role." /></label>
          <div className="md:col-span-2 flex justify-end"><button type="button" onClick={() => void provisionRole()} disabled={saving || !demoUserId || demoReason.trim().length < 3 || ((demoRole === 'hospital_admin' || demoRole === 'hospital_approver') && !demoHospitalId)} className="rounded-lg bg-sky-700 px-4 py-2 text-xs font-bold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving…' : 'Assign role'}</button></div>
        </div>}
        </>}
      </section>}

      {selected && (
        <section className="space-y-3 rounded-2xl border border-violet-700 bg-violet-950/30 p-5" aria-labelledby="provider-review-confirm-heading">
          <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" /><div><h2 id="provider-review-confirm-heading" className="font-bold text-white">Confirm: {decisionLabel[selected.decision]}</h2><p className="mt-1 text-xs text-slate-300">{selected.account.provider_name || 'Unlinked provider profile'} • {selected.account.email}. This changes provider access and directory visibility.</p></div></div>
          <label className="block text-xs font-bold text-slate-200" htmlFor="provider-review-reason">Required review reason</label>
          <textarea id="provider-review-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-white outline-none focus:border-violet-500" placeholder="Record the verification evidence or reason for the access change." />
          {reviewFeedback && <p className={`rounded-lg border p-3 text-sm ${saving ? 'border-sky-800 bg-sky-950/40 text-sky-200' : 'border-rose-800 bg-rose-950/40 text-rose-200'}`} role="status" aria-live="polite">{reviewFeedback}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setSelected(null)} disabled={saving} className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800">Cancel</button>
            <button type="button" onClick={() => void confirmDecision()} disabled={saving || reason.trim().length < 3} className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving review…' : `Confirm ${selected.decision}`}</button>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2"><UserRoundCog className="h-5 w-5 text-violet-400" /><h2 className="text-base font-black text-white">Provider accounts</h2></div>
        {loading ? <p className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400" role="status">Loading provider accounts…</p> : accountsUnavailable ? <p className="rounded-xl border border-rose-800 bg-rose-950/30 p-6 text-sm text-rose-200" role="status">Provider accounts could not be loaded. Review the error above and retry.</p> : accounts.length === 0 ? <p className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">No provider accounts are available for review.</p> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {accounts.map((account) => {
              const accountDocuments = verificationDocuments.filter((document) => document.user_id === account.user_id);
              const hasVerifiedProof = accountDocuments.some((document) => document.status === 'verified');
              return (
              <article key={account.user_id} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold text-white">{account.provider_name || 'Unlinked provider profile'}</h3><p className="text-xs text-slate-400">{account.role.replaceAll('_', ' ')} • {account.district || 'Location unknown'}, {account.state || 'State unknown'}</p></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${account.account_status === 'active' ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300' : account.account_status === 'pending' ? 'border-amber-700 bg-amber-950/40 text-amber-300' : 'border-rose-800 bg-rose-950/40 text-rose-300'}`}>{account.account_status}</span></div>
                {!account.provider_id && <p className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-2 text-xs text-amber-200">This legacy account has no linked facility. It can be suspended or revoked; activation requires repairing its provider profile.</p>}
                <div className="text-xs text-slate-300">Account: {account.full_name} · {account.email}<br />Registered {new Date(account.created_at).toLocaleString()}</div>
                <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                  <p className="text-xs font-bold text-slate-200">Verification documents</p>
                  {accountDocuments.length === 0 ? <p className="text-xs text-amber-200">No proof uploaded yet. The provider cannot be activated until proof is reviewed.</p> : accountDocuments.map((document) => (
                    <div key={document.document_id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2 text-xs">
                      <div><p className="font-semibold text-white">{document.document_type} · {document.original_filename}</p><p className="text-slate-400">{document.mime_type} · {(document.byte_size / 1024 / 1024).toFixed(2)} MB · {document.status}</p>{document.review_reason && <p className="mt-1 text-slate-400">Review: {document.review_reason}</p>}</div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => void openProviderVerificationDocument(document.document_id).catch((err: any) => setError(err?.message || 'Document could not be opened.'))} className="rounded-lg border border-sky-700 px-3 py-2 font-bold text-sky-200 hover:bg-sky-950/40">Open securely</button>
                        {document.status !== 'verified' && <button type="button" disabled={saving} onClick={() => void reviewProof(document, 'verified')} className="rounded-lg border border-emerald-700 px-3 py-2 font-bold text-emerald-200 disabled:opacity-50">Verify</button>}
                        {document.status !== 'rejected' && <button type="button" disabled={saving} onClick={() => void reviewProof(document, 'rejected')} className="rounded-lg border border-rose-800 px-3 py-2 font-bold text-rose-200 disabled:opacity-50">Reject</button>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {account.provider_id && account.account_status !== 'active' && account.account_status !== 'revoked' && <button type="button" disabled={!hasVerifiedProof} onClick={() => requestDecision(account, 'activate')} title={!hasVerifiedProof ? 'Verify a provider proof document first' : undefined} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40">Activate</button>}
                  {account.account_status !== 'suspended' && account.account_status !== 'revoked' && <button type="button" onClick={() => requestDecision(account, 'suspend')} className="rounded-lg border border-amber-700 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-950/40">Suspend</button>}
                  {account.account_status !== 'revoked' && <button type="button" onClick={() => requestDecision(account, 'revoke')} className="rounded-lg border border-rose-800 px-3 py-2 text-xs font-bold text-rose-200 hover:bg-rose-950/40">Revoke</button>}
                </div>
              </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-black text-white">Review audit history</h2>
        {history.length === 0 ? <p className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-400">No provider review events have been recorded.</p> : (
          <div className="overflow-x-auto rounded-xl border border-slate-800"><table className="min-w-full divide-y divide-slate-800 text-left text-xs"><thead className="bg-slate-900 text-slate-400"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Actor</th></tr></thead><tbody className="divide-y divide-slate-800 bg-slate-950">{history.map((event) => <tr key={event.review_id}><td className="whitespace-nowrap px-4 py-3 text-slate-400">{new Date(event.created_at).toLocaleString()}</td><td className="px-4 py-3 text-slate-300">{event.provider_kind} · {event.user_id.slice(0, 8)}</td><td className="px-4 py-3 font-bold text-white">{event.action}</td><td className="min-w-48 px-4 py-3 text-slate-300">{event.reason}</td><td className="px-4 py-3 font-mono text-slate-400">{event.actor_id?.slice(0, 8) || 'system signup'}</td></tr>)}</tbody></table></div>
        )}
      </section>

      {hasCapability(userProfile?.role, 'manage_demo_account_roles') && <section className="space-y-3">
        <h2 className="text-base font-black text-white">Restricted role assignment history</h2>
        {demoHistory.length === 0 ? <p className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-400">No restricted demo role assignments have been recorded.</p> : <div className="overflow-x-auto rounded-xl border border-slate-800"><table className="min-w-full divide-y divide-slate-800 text-left text-xs"><thead className="bg-slate-900 text-slate-400"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Account</th><th className="px-4 py-3">Role change</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Admin</th></tr></thead><tbody className="divide-y divide-slate-800 bg-slate-950">{demoHistory.map((event) => <tr key={event.event_id}><td className="whitespace-nowrap px-4 py-3 text-slate-400">{new Date(event.created_at).toLocaleString()}</td><td className="px-4 py-3 font-mono text-slate-300">{event.user_id.slice(0, 8)}</td><td className="px-4 py-3 font-bold text-white">{event.prior_role.replaceAll('_', ' ')} → {event.new_role.replaceAll('_', ' ')}{event.new_hospital_id ? ` · hospital ${event.new_hospital_id.slice(0, 8)}` : ''}</td><td className="min-w-48 px-4 py-3 text-slate-300">{event.reason}</td><td className="px-4 py-3 font-mono text-slate-400">{event.actor_id?.slice(0, 8) || 'unknown'}</td></tr>)}</tbody></table></div>}
      </section>}
    </main>
  );
};
