import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserRole, getRoleDisplayLabel } from '../../types/database';
import { ThemeToggle } from '../ui/ThemeToggle';
import { NotificationCenter } from '../NotificationCenter';
import {
  Activity,
  LogOut,
  ShieldCheck,
  Building2,
  HeartPulse,
  Droplets,
  Ambulance,
  Stethoscope,
  ArrowRightLeft,
  Home
} from 'lucide-react';

import { QuickDemoRoleSwitcher } from '../common/QuickDemoRoleSwitcher';

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeRole: UserRole | string;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, activeRole }) => {
  const { userProfile, logout, setViewMode } = useAuth();

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'patient': return <HeartPulse className="w-4 h-4 text-rose-500" />;
      case 'hospital_admin': return <Building2 className="w-4 h-4 text-blue-500" />;
      case 'blood_bank_admin': return <Droplets className="w-4 h-4 text-red-500" />;
      case 'ambulance_admin': return <Ambulance className="w-4 h-4 text-amber-500" />;
      case 'government_admin': return <ShieldCheck className="w-4 h-4 text-emerald-500" />;
      case 'clinician_reviewer': return <Stethoscope className="w-4 h-4 text-teal-500" />;
      case 'hospital_approver': return <ArrowRightLeft className="w-4 h-4 text-indigo-500" />;
      default: return <ShieldCheck className="w-4 h-4 text-slate-500" />;
    }
  };

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case 'patient': return 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/80 text-rose-800 dark:text-rose-300';
      case 'hospital_admin': return 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800/80 text-blue-800 dark:text-blue-300';
      case 'blood_bank_admin': return 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800/80 text-red-800 dark:text-red-300';
      case 'ambulance_admin': return 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/80 text-amber-800 dark:text-amber-300';
      case 'government_admin': return 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-300';
      case 'clinician_reviewer': return 'bg-teal-50 dark:bg-teal-950/60 border-teal-200 dark:border-teal-800/80 text-teal-800 dark:text-teal-300';
      case 'hospital_approver': return 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800/80 text-indigo-800 dark:text-indigo-300';
      default: return 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-300';
    }
  };

  const displayLabel = getRoleDisplayLabel(activeRole as UserRole);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans antialiased transition-colors duration-200">
      
      {/* Top Header Bar */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          
          {/* Logo & Platform Name */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setViewMode('landing')}>
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-md">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                  LifeLink <span className="text-blue-600 dark:text-blue-400">AI</span>
                </span>
                <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded font-mono uppercase">
                  Portal
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Emergency Medical Command System
              </p>
            </div>
          </div>

          {/* User Profile Badge & Role Switcher */}
          <div className="flex items-center space-x-2.5">
            {/* Quick 1-Click Role Switcher */}
            <QuickDemoRoleSwitcher />

            <div className={`hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${getRoleBadgeStyle(activeRole)}`}>
              {getRoleIcon(activeRole)}
              <span>{displayLabel}</span>
            </div>

            <div className="flex items-center space-x-2 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 px-3 py-1.5 rounded-xl text-xs">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[11px]">
                {userProfile?.full_name ? userProfile.full_name.charAt(0) : 'U'}
              </div>
              <div className="text-left hidden md:block">
                <p className="font-bold text-slate-900 dark:text-white leading-tight truncate max-w-[140px]">
                  {userProfile?.full_name || 'Authenticated User'}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[140px]">
                  {userProfile?.email}
                </p>
              </div>
            </div>

            {/* Notification Center */}
            <NotificationCenter />

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Home button */}
            <button
              onClick={() => setViewMode('landing')}
              className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Return to Public Homepage"
            >
              <Home className="w-4 h-4" />
            </button>

            {/* Logout button */}
            <button
              onClick={logout}
              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900 border border-rose-200 dark:border-rose-800/80 text-rose-700 dark:text-rose-300 hover:text-rose-900 dark:hover:text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>

        </div>

        {/* Role Protected Banner */}
        <div className="bg-emerald-50/80 dark:bg-emerald-950/40 border-t border-emerald-200/60 dark:border-emerald-900/60 py-1.5 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="font-bold">Role Protected Session:</span>
              <span className="font-medium">Logged in as <strong className="underline">{displayLabel}</strong> ({userProfile?.email})</span>
            </div>
            <span className="text-[11px] opacity-80 hidden sm:inline">Supabase Authenticated</span>
          </div>
        </div>
      </header>

      {/* Main Dashboard Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {children}
      </main>

    </div>
  );
};
