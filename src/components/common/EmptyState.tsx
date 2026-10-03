import React from 'react';
import { LucideIcon, Inbox, RefreshCw, AlertCircle } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionButton?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title,
  description = 'No records found in the centralized database.',
  actionButton,
  className = ''
}) => {
  return (
    <div className={`p-8 sm:p-12 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 my-4 flex flex-col items-center justify-center space-y-3 transition-all ${className}`}>
      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shadow-xs border border-slate-200 dark:border-slate-700">
        <Icon className="w-6 h-6" />
      </div>
      <div className="max-w-md space-y-1">
        <h4 className="text-base font-bold text-slate-800 dark:text-slate-200 tracking-tight">
          {title}
        </h4>
        {description && (
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
            {description}
          </p>
        )}
      </div>
      {actionButton && (
        <button
          onClick={actionButton.onClick}
          className="mt-2 inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
        >
          <span>{actionButton.label}</span>
        </button>
      )}
    </div>
  );
};

export const LoadingState: React.FC<{ message?: string; className?: string }> = ({
  message = 'Fetching live data from LifeLink API...',
  className = ''
}) => {
  return (
    <div className={`p-10 text-center flex flex-col items-center justify-center space-y-3 my-4 ${className}`}>
      <RefreshCw className="w-7 h-7 text-blue-600 dark:text-blue-400 animate-spin" />
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mono">
        {message}
      </p>
    </div>
  );
};

export const ErrorState: React.FC<{ message?: string; onRetry?: () => void }> = ({
  message = 'Failed to load records from LifeLink service.',
  onRetry
}) => {
  return (
    <div className="p-6 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-center flex flex-col items-center justify-center space-y-3 my-4">
      <AlertCircle className="w-8 h-8 text-rose-600 dark:text-rose-400" />
      <div>
        <h4 className="text-sm font-bold text-rose-900 dark:text-rose-200">
          Data Fetch Error
        </h4>
        <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">
          {message}
        </p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
        >
          Retry Connection
        </button>
      )}
    </div>
  );
};
