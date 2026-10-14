import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught Error in UI Component:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] w-full p-6 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-center space-y-4 my-4 shadow-sm">
          <div className="p-3 bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-2xl border border-rose-200 dark:border-rose-800/60">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-1 max-w-md">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Component Execution Interrupted
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              An unexpected error occurred while rendering this module. The application remains isolated and operational.
            </p>
          </div>

          {this.state.error && (
            <div className="w-full max-w-lg bg-slate-900 text-slate-200 p-3 rounded-xl text-left font-mono text-[11px] overflow-x-auto border border-slate-800 max-h-32">
              <span className="text-rose-400 font-bold">Error:</span> {this.state.error.message}
            </div>
          )}

          <div className="flex items-center space-x-3 pt-2">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Component</span>
            </button>

            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 focus:outline-hidden focus:ring-2 focus:ring-slate-400"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Reload Application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}


