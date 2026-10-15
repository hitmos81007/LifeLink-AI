import React from 'react';

const questions = [
  {
    question: 'What is LifeLink AI?',
    answer: 'LifeLink AI is a prototype for coordinating emergency healthcare resources across hospitals, blood banks, and ambulance providers. It supports information sharing and human review; it does not replace emergency services or clinical judgment.',
  },
  {
    question: 'Why do provider accounts need approval?',
    answer: 'Hospital, blood bank, and ambulance provider accounts remain inactive until a platform administrator checks the submitted registration, licence, or operating authorization and approves the account.',
  },
  {
    question: 'How are provider documents protected?',
    answer: 'Verification files are stored in a private Supabase bucket. The account owner and active platform administrators can access them; administrator viewing uses a short-lived secure link.',
  },
  {
    question: 'Are resource availability and forecasts live?',
    answer: 'Availability and forecasts depend on provider-submitted records and configured data sources. Sample records are labelled synthetic; the prototype should not be treated as a source of guaranteed live availability.',
  },
  {
    question: 'Does a recommendation dispatch an ambulance or reserve stock?',
    answer: 'No. Recommendations are advisory. Resource transfers and operational actions require the relevant human approval and confirmation in the appropriate workflow.',
  },
];

export const FAQSection: React.FC = () => (
  <section id="faq" className="bg-slate-50 px-4 py-16 dark:bg-slate-900 sm:px-6 lg:px-8" aria-labelledby="faq-heading">
    <div className="mx-auto max-w-4xl">
      <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Need to know</p>
      <h2 id="faq-heading" className="mt-2 text-center text-3xl font-black tracking-tight text-slate-900 dark:text-white">Frequently asked questions</h2>
      <div className="mt-8 space-y-3">
        {questions.map(({ question, answer }) => (
          <details key={question} className="group rounded-xl border border-slate-200 bg-white p-5 open:border-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:open:border-blue-700">
            <summary className="cursor-pointer list-none font-bold text-slate-900 marker:hidden dark:text-white">
              <span className="flex items-center justify-between gap-4">{question}<span aria-hidden="true" className="text-blue-600 transition group-open:rotate-45">+</span></span>
            </summary>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">{answer}</p>
          </details>
        ))}
      </div>
    </div>
  </section>
);
