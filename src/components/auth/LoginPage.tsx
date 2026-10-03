import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Activity,
  LogIn,
  Lock,
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowLeft
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, setViewMode, authError, clearAuthError, resendConfirmation } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  const handleResendConfirmation = async () => {
    if (!email) {
      setLocalError('Please enter your email address to resend the confirmation email.');
      return;
    }
    setResendStatus('Sending confirmation email...');
    const res = await resendConfirmation(email);
    if (res.error) {
      setResendStatus(null);
      setLocalError('Resend error: ' + res.error);
    } else {
      setResendStatus(`Verification email resent to ${email}! Please check your inbox.`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();
    setIsSubmitting(true);

    try {
      await login(email, password);
    } catch (err: any) {
      setLocalError(err.message || 'Invalid email or password');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Navigation Header Back Button */}
      <div className="absolute top-6 left-6 z-10">
        <button
          onClick={() => setViewMode('landing')}
          className="px-3.5 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="flex justify-center items-center space-x-3">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/30">
            <Activity className="w-7 h-7" />
          </div>
          <span className="text-2xl font-black text-white tracking-tight">
            LifeLink <span className="text-blue-400">AI</span>
          </span>
        </div>
        <h2 className="mt-4 text-center text-xl font-extrabold text-white tracking-tight">
          Stakeholder Authentication Gateway
        </h2>
        <p className="mt-1 text-center text-xs text-slate-400">
          Sign in with your registered LifeLink AI Supabase credentials
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10 px-4 sm:px-0">
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 backdrop-blur-md">
          
          {/* Notification Messages */}
          {resendStatus && (
            <div className="bg-emerald-950/80 border border-emerald-800 text-emerald-200 p-3 rounded-xl text-xs flex items-start gap-2.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Confirmation Resent</p>
                <p className="text-[11px] text-emerald-300">{resendStatus}</p>
              </div>
            </div>
          )}

          {(localError || authError) && (
            <div className="bg-rose-950/80 border border-rose-800 text-rose-200 p-3 rounded-xl text-xs space-y-2 animate-in fade-in">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Authentication Failed</p>
                  <p className="text-[11px] text-rose-300">{localError || authError}</p>
                </div>
              </div>

              {((localError && localError.includes('Email not confirmed')) || (authError && authError.includes('Email not confirmed'))) && (
                <div className="pt-2 border-t border-rose-800/80 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-rose-300/90 font-medium">Need another confirmation link?</span>
                    <button
                      type="button"
                      onClick={handleResendConfirmation}
                      className="px-2.5 py-1 bg-rose-900 hover:bg-rose-800 text-white rounded text-[10px] font-bold cursor-pointer transition-all border border-rose-700"
                    >
                      Resend Link
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Authorized Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder="name@example.com"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Security Password
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99]"
            >
              <LogIn className="w-4 h-4" />
              <span>{isSubmitting ? 'Authenticating...' : 'Sign In'}</span>
            </button>
          </form>

          {/* Visible Create Account Link */}
          <div className="pt-4 border-t border-slate-700/60 text-center">
            <p className="text-xs text-slate-400">
              Don't have an account registered?{' '}
              <button
                type="button"
                onClick={() => setViewMode('signup')}
                className="text-blue-400 hover:text-blue-300 font-bold hover:underline cursor-pointer"
              >
                Create account
              </button>
            </p>
          </div>

        </div>

        {/* Security badge */}
        <div className="mt-4 text-center">
          <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            256-bit AES Encryption • Supabase Auth
          </p>
        </div>

      </div>
    </div>
  );
};
