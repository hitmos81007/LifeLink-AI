import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, RotateCw } from 'lucide-react';
import { getResourceTransferEvents, ResourceTransferEvent } from '../services/resourceTransferService';

interface ResourceTransferTimelineProps {
  transferId: string;
}

const statusLabels: Record<string, string> = {
  Pending: 'Request submitted',
  Approved: 'Approved by source hospital',
  Rejected: 'Rejected by source hospital',
  'In Transit': 'Simulated handoff recorded',
  Completed: 'Simulated receipt recorded'
};

function formatEventTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString();
}

function TransferEventRow({ event, isLast }: { event: ResourceTransferEvent; isLast: boolean }) {
  const isRejected = event.to_status === 'Rejected';
  const isComplete = event.to_status === 'Completed';
  const iconClass = isRejected ? 'text-rose-300' : isComplete ? 'text-emerald-300' : 'text-sky-300';

  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!isLast && <span aria-hidden="true" className="absolute left-[9px] top-5 h-full w-px bg-slate-700" />}
      <span className={`relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 ${iconClass}`}>
        {isRejected ? <AlertTriangle className="h-3 w-3" /> : isComplete ? <CheckCircle2 className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-semibold text-slate-100">{statusLabels[event.to_status] || event.event_type.replaceAll('_', ' ')}</span>
          <time className="text-[10px] text-slate-400">{formatEventTime(event.created_at)}</time>
        </div>
        <p className="mt-0.5 text-[10px] text-slate-400">
          {event.from_status ? `${event.from_status} → ` : ''}{event.to_status} · {event.quantity} {event.quantity === 1 ? 'unit' : 'units'}
        </p>
      </div>
    </li>
  );
}

export const ResourceTransferTimeline: React.FC<ResourceTransferTimelineProps> = ({ transferId }) => {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<ResourceTransferEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getResourceTransferEvents(transferId)
      .then((rows) => { if (!cancelled) setEvents(rows); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the transfer timeline.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [expanded, transferId, loadAttempt]);

  return (
    <div className="font-sans">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[10px] font-bold text-slate-300 hover:border-slate-500 hover:text-white"
      >
        <Clock3 className="h-3.5 w-3.5" />
        {expanded ? 'Hide timeline' : 'View timeline'}
      </button>
      {expanded && (
        <section aria-label="Transfer timeline" className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-white">Transfer timeline</h3>
            <p className="text-[10px] text-slate-500">Handoff and receipt entries record simulated steps; no shipment is arranged.</p>
          </div>
          {loading ? (
            <p className="flex items-center gap-2 text-xs text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" />Loading timeline from Supabase…</p>
          ) : error ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-xs text-rose-300">
              <span>{error}</span>
              <button type="button" onClick={() => setLoadAttempt((value) => value + 1)} className="inline-flex items-center gap-1 font-bold hover:text-rose-100">
                <RotateCw className="h-3.5 w-3.5" />Retry
              </button>
            </div>
          ) : events.length === 0 ? (
            <p className="text-xs text-slate-400">No timeline events are recorded for this transfer yet.</p>
          ) : (
            <ol className="mt-1">{events.map((event, index) => <TransferEventRow key={event.event_id} event={event} isLast={index === events.length - 1} />)}</ol>
          )}
        </section>
      )}
    </div>
  );
};
