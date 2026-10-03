import { SEQUENCE_WORKFLOWS } from '../data/sequenceFlowsData';
import { SequenceStep, SequenceWorkflow } from '../types/architecture';
import React, { useState } from 'react';
import { 
  Workflow, 
  Play, 
  RotateCcw, 
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  Activity, 
  ShieldCheck, 
  Sparkles,
  ChevronRight
} from 'lucide-react';

export const SequenceFlowView: React.FC = () => {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(SEQUENCE_WORKFLOWS[0].id);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [autoPlay, setAutoPlay] = useState<boolean>(false);

  const activeWorkflow = SEQUENCE_WORKFLOWS.find(w => w.id === selectedWorkflowId) || SEQUENCE_WORKFLOWS[0];

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'http':
        return <span className="px-2 py-0.5 text-[10px] mono font-semibold rounded bg-blue-50 text-blue-700 border border-blue-200">REST HTTP</span>;
      case 'ai':
        return <span className="px-2 py-0.5 text-[10px] mono font-semibold rounded bg-purple-50 text-purple-700 border border-purple-200">Gemini AI</span>;
      case 'firestore':
        return <span className="px-2 py-0.5 text-[10px] mono font-semibold rounded bg-amber-50 text-amber-800 border border-amber-200">Firestore</span>;
      case 'websocket':
        return <span className="px-2 py-0.5 text-[10px] mono font-semibold rounded bg-emerald-50 text-emerald-800 border border-emerald-200">Real-Time</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] mono font-semibold rounded bg-slate-100 text-slate-600 border border-slate-200">Internal</span>;
    }
  };

  const handleNextStep = () => {
    if (currentStepIndex < activeWorkflow.steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    }
  };

  const handleReset = () => {
    setCurrentStepIndex(0);
    setAutoPlay(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded bg-blue-50 text-blue-700 border border-blue-200">
            <Workflow className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-tight">API Communication & Operational Sequence Workflows</h2>
            <p className="text-xs text-slate-500">Step-by-Step Latency, Network Protocol, and Message Payload Inspector</p>
          </div>
        </div>

        {/* Workflow Switcher */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded border border-slate-200">
          {SEQUENCE_WORKFLOWS.map((wf) => (
            <button
              key={wf.id}
              onClick={() => {
                setSelectedWorkflowId(wf.id);
                setCurrentStepIndex(0);
              }}
              className={`px-2.5 py-1 text-[10px] mono rounded transition-colors cursor-pointer ${
                selectedWorkflowId === wf.id
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              {wf.title.split(' ')[0]} Flow
            </button>
          ))}
        </div>
      </div>

      {/* Workflow Controls Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div>
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight">{activeWorkflow.title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{activeWorkflow.description}</p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleReset}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold flex items-center gap-1 border border-slate-200 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            onClick={handleNextStep}
            disabled={currentStepIndex >= activeWorkflow.steps.length - 1}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-bold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
          >
            <span>Next Step ({currentStepIndex + 1}/{activeWorkflow.steps.length})</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Actors Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        {activeWorkflow.actors.map((actor, idx) => (
          <div key={idx} className="bg-slate-50 border border-slate-200 p-2 rounded text-center mono text-xs font-bold text-blue-900 shadow-xs">
            {actor}
          </div>
        ))}
      </div>

      {/* Steps Timeline Stack */}
      <div className="space-y-2.5">
        {activeWorkflow.steps.map((step, idx) => {
          const isActive = idx === currentStepIndex;
          const isPassed = idx < currentStepIndex;

          return (
            <div
              key={idx}
              onClick={() => setCurrentStepIndex(idx)}
              className={`p-3.5 rounded-lg border transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-50/80 border-blue-400 ring-1 ring-blue-400/30 text-slate-900 shadow-xs'
                  : isPassed
                  ? 'bg-white border-slate-200 text-slate-700'
                  : 'bg-slate-50/60 border-slate-200 text-slate-400 opacity-70'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center space-x-2">
                  <span className={`w-5 h-5 rounded flex items-center justify-center mono text-xs font-bold ${
                    isActive ? 'bg-blue-600 text-white' : isPassed ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {step.stepNumber}
                  </span>
                  <div className="flex items-center space-x-1.5 mono text-xs font-bold">
                    <span className="text-slate-800">{step.from}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-blue-700">{step.to}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {getTypeBadge(step.type)}
                  <span className="text-[10px] mono font-semibold text-slate-600 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-600" />
                    {step.latencyMs}ms
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-700 font-medium mb-2">
                {step.description}
              </p>

              <div className="bg-[#0F172A] p-2.5 rounded font-mono text-[11px] text-emerald-300 overflow-x-auto shadow-inner">
                <span className="text-slate-400 block text-[10px] mb-0.5">Payload Data:</span>
                {step.payload}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
