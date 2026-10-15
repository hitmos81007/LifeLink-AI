import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Activity,
  Mail,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Send
} from 'lucide-react';

export const ForgotPasswordPage: React.FC = () => {
  const { resetPassword, setViewMode, authError, clearAuthError } = useAuth();

  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();

    if (!email.trim()) {
      setLocalError('Please enter your registered email address.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await resetPassword(email);
      if (res.error) {
        setLocalError(res.error);
      } else {
        setIsSent(true);
      }
    } catch (err: any) {
      setLocalError(err.message || 'Failed to send password reset email. Please verify address.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Navigation Header Back Button */}
      <div className="absolute top-6 left-6 z-10">
        <button
          onClick={() => setViewMode('login')}
          className="px-3.5 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Sign In</span>
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
          Reset Password
        </h2>
        <p className="mt-1 text-center text-xs text-slate-400">
          Enter your registered email to receive a password reset link
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10 px-4 sm:px-0">
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 backdrop-blur-md">
          
          {isSent ? (
            <div className="text-center py-4 space-y-4 animate-in fade-in">
              <div className="w-12 h-12 rounded-full bg-emerald-950/80 border border-emerald-700 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-white">Reset Link Dispatched!</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                A password reset authorization link has been sent to <strong>{email}</strong> via Supabase Auth.
              </p>
              <button
                type="button"
                onClick={() => setViewMode('login')}
                className="w-full py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-md cursor-pointer transition-all"
              >
                Return to Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {(localError || authError) && (
                <div className="bg-rose-950/80 border border-rose-800 text-rose-200 p-3 rounded-xl text-xs flex items-start gap-2.5 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Reset Error</p>
                    <p className="text-[11px] text-rose-300">{localError || authError}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Registered Email Address *
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

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? 'Sending Link...' : 'Send Password Reset Email'}</span>
              </button>

              <div className="pt-4 border-t border-slate-700/60 text-center">
                <button
                  type="button"
                  onClick={() => setViewMode('login')}
                  className="text-xs text-blue-400 hover:text-blue-300 font-bold hover:underline cursor-pointer"
                >
                  ← Return to Sign In
                </button>
              </div>

            </form>
          )}

        </div>
      </div>
    </div>
  );
};
