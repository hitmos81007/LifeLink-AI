import React from 'react';
import { Loader2 } from 'lucide-react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div
      className={`animate-pulse bg-slate-200 dark:bg-slate-800 rounded-lg ${className}`}
    />
  );
};

export const SkeletonCard: React.FC = () => {
  return (
    <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-3 w-full" />
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
        <Skeleton className="h-3 w-40" />
      </div>
    </div>
  );
};

export const LoadingState: React.FC<{ label?: string }> = ({
  label = 'Loading healthcare operational feeds...',
}) => {
  return (
    <div className="min-h-[250px] w-full flex flex-col items-center justify-center space-y-3 p-8 text-center">
      <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
      <p className="text-xs font-mono font-medium text-slate-600 dark:text-slate-400">
        {label}
      </p>
    </div>
  );
};
