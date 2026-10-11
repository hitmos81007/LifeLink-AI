import React from 'react';
import { AlertTriangle } from 'lucide-react';

export const PrototypeDataNotice: React.FC = () => (
  <aside
    aria-label="Prototype data notice"
    className="flex items-start gap-3 rounded-xl border border-amber-800/80 bg-amber-950/40 p-4 text-amber-100"
  >
    <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
    <div className="space-y-1">
      <h2 className="text-xs font-bold uppercase tracking-wide">Prototype data only</h2>
      <p className="text-xs leading-relaxed text-amber-100/80">
        Changes here are saved to the connected Supabase database and shared with this prototype's other views. Use fictional test values only; these records do not arrange real care, transport, or dispatch.
      </p>
    </div>
  </aside>
);
