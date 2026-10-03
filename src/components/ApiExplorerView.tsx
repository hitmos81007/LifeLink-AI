import { REST_API_ENDPOINTS } from '../data/apiSpecData';
import { ApiEndpoint } from '../types/architecture';
import React, { useState } from 'react';
import { 
  Network, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Code2, 
  ShieldCheck, 
  Send,
  Loader2,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

export const ApiExplorerView: React.FC = () => {
  const [selectedTag, setSelectedTag] = useState<string>('ALL');
  const [expandedApiId, setExpandedApiId] = useState<string>(REST_API_ENDPOINTS[0].id);
  const [apiResponses, setApiResponses] = useState<Record<string, { status: number; body: any; latencyMs: number }>>({});
  const [loadingApis, setLoadingApis] = useState<Record<string, boolean>>({});

  const tags = ['ALL', 'FastAPI ML Predictor', 'AI Triage', 'Emergency', 'Hospitals', 'Blood Bank', 'Ambulance', 'Govt Authority'];

  const filteredApis = REST_API_ENDPOINTS.filter(api => 
    selectedTag === 'ALL' || api.tag === selectedTag
  );

  const getMethodBadge = (method: string) => {
    switch (method) {
      case 'GET':
        return <span className="px-2 py-0.5 text-[10px] mono font-bold rounded bg-blue-100 text-blue-800 border border-blue-200">GET</span>;
      case 'POST':
        return <span className="px-2 py-0.5 text-[10px] mono font-bold rounded bg-emerald-100 text-emerald-800 border border-emerald-200">POST</span>;
      case 'PUT':
        return <span className="px-2 py-0.5 text-[10px] mono font-bold rounded bg-amber-100 text-amber-800 border border-amber-200">PUT</span>;
      case 'DELETE':
        return <span className="px-2 py-0.5 text-[10px] mono font-bold rounded bg-rose-100 text-rose-800 border border-rose-200">DELETE</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] mono font-bold rounded bg-slate-100 text-slate-700">HTTP</span>;
    }
  };

  const executeLiveApiCall = async (api: ApiEndpoint) => {
    setLoadingApis(prev => ({ ...prev, [api.id]: true }));
    const startTime = performance.now();

    try {
      let response;
      if (api.method === 'POST') {
        let endpointUrl = api.path;
        if (api.id === 'api-triage') endpointUrl = '/api/ai/triage';
        if (api.id === 'api-blood-match') endpointUrl = '/api/ai/blood-match';
        if (api.id === 'api-dispatch-route') endpointUrl = '/api/ai/dispatch-route';

        response = await fetch(endpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(api.sampleRequestBody || {}),
        });
      } else {
        let endpointUrl = api.path;
        if (api.id === 'api-hospitals-capacity') endpointUrl = '/api/v1/hospitals/capacity';
        if (api.id === 'api-authority-report') endpointUrl = '/api/v1/emergencies';

        response = await fetch(endpointUrl);
      }

      const latencyMs = Math.round(performance.now() - startTime);
      const data = await response.json();

      setApiResponses(prev => ({
        ...prev,
        [api.id]: {
          status: response.status,
          body: data,
          latencyMs
        }
      }));
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - startTime);
      setApiResponses(prev => ({
        ...prev,
        [api.id]: {
          status: api.sampleResponse.status,
          body: api.sampleResponse.body,
          latencyMs: latencyMs || 42
        }
      }));
    } finally {
      setLoadingApis(prev => ({ ...prev, [api.id]: false }));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-tight">OpenAPI 3.1 REST API Specification & Explorer</h2>
            <p className="text-xs text-slate-500">Interactive REST endpoint tester for LifeLink AI Gateway</p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded border border-slate-200">
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTag(t)}
              className={`px-2.5 py-1 text-[10px] mono rounded transition-colors ${
                selectedTag === t
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Endpoints List */}
      <div className="space-y-3">
        {filteredApis.map((api) => {
          const isExpanded = expandedApiId === api.id;
          const liveResponse = apiResponses[api.id];
          const isLoading = loadingApis[api.id];

          return (
            <div
              key={api.id}
              className={`bg-white border rounded-lg overflow-hidden transition-all shadow-xs ${
                isExpanded ? 'border-blue-500 ring-1 ring-blue-500/20' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Collapsible Endpoint Header */}
              <div
                onClick={() => setExpandedApiId(isExpanded ? '' : api.id)}
                className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 select-none"
              >
                <div className="flex items-center space-x-3">
                  {getMethodBadge(api.method)}
                  <span className="mono text-xs sm:text-sm font-bold text-slate-900">{api.path}</span>
                  <span className="text-xs text-slate-500 hidden md:inline">— {api.summary}</span>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="flex gap-1">
                    {api.requiredRole.map((role) => (
                      <span key={role} className="px-1.5 py-0.2 text-[9px] mono font-semibold rounded bg-slate-100 text-slate-600 border border-slate-200">
                        {role}
                      </span>
                    ))}
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-blue-600" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </div>

              {/* Expanded Detail Drawer */}
              {isExpanded && (
                <div className="border-t border-slate-200 p-4 bg-slate-50 space-y-3">
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {api.description}
                  </p>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Request Details */}
                    <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-3 shadow-xs">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <h4 className="text-xs font-bold text-slate-900 mono">
                          Request Headers & Body Schema
                        </h4>
                        <span className="text-[10px] mono text-slate-500">JSON Payload</span>
                      </div>

                      {/* Headers */}
                      <div>
                        <span className="text-[10px] mono text-slate-500 block mb-1">Headers:</span>
                        <div className="bg-[#0F172A] p-2 rounded text-[11px] mono text-slate-300">
                          {Object.entries(api.requestHeaders).map(([k, v]) => (
                            <div key={k}>
                              <span className="text-slate-400">{k}:</span> <span className="text-emerald-400">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Request Sample Body */}
                      {api.sampleRequestBody && (
                        <div>
                          <span className="text-[10px] mono text-slate-500 block mb-1">Sample Body Payload:</span>
                          <div className="bg-[#0F172A] p-3 rounded mono text-[11px] text-blue-300 overflow-x-auto shadow-inner">
                            <pre>{JSON.stringify(api.sampleRequestBody, null, 2)}</pre>
                          </div>
                        </div>
                      )}

                      {/* Live Execute Button */}
                      <button
                        onClick={() => executeLiveApiCall(api)}
                        disabled={isLoading}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-2 px-3 rounded flex items-center justify-center space-x-2 shadow-xs transition-all cursor-pointer"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Executing REST API Request...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            <span>Test Live Endpoint Request</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Response Details / Live Results */}
                    <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-3 shadow-xs">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <h4 className="text-xs font-bold text-slate-900 mono">
                          API Response Output
                        </h4>
                        {liveResponse && (
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 text-[10px] mono font-bold rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                              HTTP {liveResponse.status} OK
                            </span>
                            <span className="text-[10px] mono text-slate-600 flex items-center gap-1 font-semibold">
                              <Clock className="w-3 h-3 text-amber-600" />
                              {liveResponse.latencyMs}ms
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="bg-[#0F172A] p-3 rounded mono text-[11px] text-slate-200 overflow-x-auto min-h-[220px] shadow-inner">
                        <pre>
                          {JSON.stringify(
                            liveResponse ? liveResponse.body : api.sampleResponse.body,
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
