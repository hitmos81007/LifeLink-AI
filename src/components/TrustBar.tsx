import React from 'react';
import { ShieldCheck, Database, UserRoundCheck, FlaskConical, Sparkles, Wrench } from 'lucide-react';

const prototypePrinciples = [
  { icon: ShieldCheck, title: 'Supabase Auth', detail: 'Account-based access' },
  { icon: Database, title: 'PostgreSQL + RLS', detail: 'Database-backed permissions' },
  { icon: UserRoundCheck, title: 'Human review', detail: 'People retain decision authority' },
  { icon: FlaskConical, title: 'Synthetic data', detail: 'Demonstration records only' },
  { icon: Sparkles, title: 'AI decision support', detail: 'Recommendations need review' },
  { icon: Wrench, title: 'Prototype', detail: 'Not a production care system' }
];

export const TrustBar: React.FC = () => (
  <section className="bg-slate-900 text-white py-10 border-y border-slate-800">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-8">
        <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mono">
          Prototype architecture and operating boundaries
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-stretch text-center">
        {prototypePrinciples.map(({ icon: Icon, title, detail }) => (
          <div key={title} className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/60 flex flex-col items-center justify-center">
            <Icon className="w-5 h-5 text-blue-400 mb-2" />
            <p className="text-xs font-bold text-slate-200">{title}</p>
            <p className="text-[10px] text-slate-400 mt-1">{detail}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
