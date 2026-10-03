import React, { useState } from 'react';
import { ARCHITECTURE_SECTIONS } from '../data/architectureDocData';
import { DocSection } from '../types/architecture';
import { 
  CheckCircle2, 
  Code2, 
  Copy, 
  Check, 
  Search, 
  BookOpen, 
  Download, 
  Sparkles,
  ChevronRight,
  Layers,
  ShieldCheck,
  Server,
  Cpu
} from 'lucide-react';

export const DocViewer: React.FC = () => {
  const [activeSectionId, setActiveSectionId] = useState<string>(ARCHITECTURE_SECTIONS[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedFilename, setCopiedFilename] = useState<string | null>(null);

  const filteredSections = ARCHITECTURE_SECTIONS.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.contentMarkdown.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeSection = ARCHITECTURE_SECTIONS.find(s => s.id === activeSectionId) || ARCHITECTURE_SECTIONS[0];

  const handleCopyCode = (filename: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedFilename(filename);
    setTimeout(() => setCopiedFilename(null), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Sidebar Navigation / Table of Contents */}
      <div className="lg:col-span-4 xl:col-span-3 space-y-4">
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-sm sticky top-20">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-xs font-bold uppercase tracking-tight text-slate-800 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-600" />
              Architecture Modules
            </h2>
            <span className="text-[10px] mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold border border-slate-200">
              10 Modules
            </span>
          </div>

          {/* Search Bar */}
          <div className="relative mb-2.5">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Search specs & APIs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded pl-8 pr-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
            />
          </div>

          {/* Section List */}
          <div className="space-y-1 max-h-[calc(100vh-260px)] overflow-y-auto pr-0.5">
            {filteredSections.map((sec) => {
              const isActive = sec.id === activeSectionId;
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSectionId(sec.id)}
                  className={`w-full text-left p-2 rounded text-xs font-medium transition-all flex items-start gap-2 ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 border-l-2 border-blue-600 font-semibold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] mono font-bold shrink-0 mt-0.5 ${
                    isActive ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {sec.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs">{sec.title}</p>
                    <p className="text-[10px] text-slate-400 truncate">{sec.badge}</p>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${isActive ? 'rotate-90 text-blue-600' : 'text-slate-300'}`} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="lg:col-span-8 xl:col-span-9 space-y-5">
        {/* Section Header */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center space-x-2">
              <span className="w-6 h-6 rounded bg-blue-100 text-blue-700 mono text-xs font-bold flex items-center justify-center border border-blue-200">
                0{activeSection.number}
              </span>
              <span className="text-[10px] mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                {activeSection.badge}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 mono">
              REF: GOOG-ARCH-LLAI-{activeSection.id.toUpperCase()}
            </span>
          </div>

          <h1 className="text-xl font-bold text-slate-900 tracking-tight font-sans">
            {activeSection.title}
          </h1>
          <p className="text-xs text-blue-600 font-semibold mt-0.5">
            {activeSection.subtitle}
          </p>
          <p className="text-xs text-slate-600 mt-2.5 leading-relaxed border-t border-slate-100 pt-2.5">
            {activeSection.summary}
          </p>
        </div>

        {/* Key Takeaways */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-tight mb-2.5 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            Key Architectural Highlights
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {activeSection.keyTakeaways.map((takeaway, idx) => (
              <div key={idx} className="flex items-start space-x-2 bg-slate-50 p-2.5 rounded border border-slate-200/80 text-xs text-slate-700">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span className="leading-snug">{takeaway}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Markdown Content Block */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 text-slate-800 text-xs leading-relaxed space-y-3 shadow-sm">
          <div className="prose prose-xs max-w-none">
            {activeSection.contentMarkdown.split('\n\n').map((paragraph, i) => {
              if (paragraph.startsWith('###')) {
                return (
                  <h3 key={i} className="text-xs font-bold uppercase tracking-tight text-slate-900 mt-4 mb-2 border-b border-slate-200 pb-1 font-sans">
                    {paragraph.replace('###', '').trim()}
                  </h3>
                );
              }
              if (paragraph.startsWith('```')) {
                const codeContent = paragraph.replace(/```[a-z]*/, '').replace(/```/, '').trim();
                return (
                  <div key={i} className="my-2.5 bg-[#0F172A] rounded p-3.5 mono text-[11px] text-emerald-300 border border-slate-800 overflow-x-auto shadow-inner">
                    <pre>{codeContent}</pre>
                  </div>
                );
              }
              return (
                <p key={i} className="text-slate-700 text-xs leading-relaxed">
                  {paragraph}
                </p>
              );
            })}
          </div>
        </div>

        {/* Code Snippets if present */}
        {activeSection.codeSnippets && activeSection.codeSnippets.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5 text-blue-600" />
              Production Reference Implementation
            </h3>
            {activeSection.codeSnippets.map((snippet, idx) => (
              <div key={idx} className="bg-[#0F172A] border border-slate-800 rounded-lg overflow-hidden shadow-md">
                <div className="bg-slate-900 px-3.5 py-2 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="text-xs mono text-slate-300 ml-2 font-medium">
                      {snippet.filename}
                    </span>
                  </div>
                  <button
                    onClick={() => handleCopyCode(snippet.filename, snippet.code)}
                    className="flex items-center space-x-1 text-xs text-slate-400 hover:text-white bg-slate-800 px-2 py-0.5 rounded transition-colors"
                  >
                    {copiedFilename === snippet.filename ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400 text-[10px]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span className="text-[10px]">Copy Code</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-3.5 mono text-[11px] text-slate-200 overflow-x-auto leading-relaxed">
                  <pre>{snippet.code}</pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
