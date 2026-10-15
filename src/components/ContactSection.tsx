import React from 'react';
import { FlaskConical, Github, ShieldAlert } from 'lucide-react';

export const ContactSection: React.FC = () => (
  <section id="contact" className="py-20 bg-white dark:bg-slate-950 relative border-b border-slate-200 dark:border-slate-800 transition-colors duration-200">
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          <FlaskConical className="w-3.5 h-3.5" />
          <span className="text-xs font-bold uppercase tracking-wider">Prototype feedback</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">LifeLink AI is a demonstration project</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl mx-auto">
          This page does not send inquiries to an operations or engineering team. Please do not enter patient details, contact information, or active emergency reports. Review the source project for implementation details.
        </p>
        <div className="flex flex-col sm:flex-row justify-center items-center gap-3 pt-2">
          <a href="https://github.com/hitmos81007/LifeLink-AI" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-5 py-3 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl">
            <Github className="w-4 h-4" /> View project repository
          </a>
          <span className="inline-flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
            <ShieldAlert className="w-4 h-4" /> Not for real emergencies or clinical care
          </span>
        </div>
      </div>
    </div>
  </section>
);
