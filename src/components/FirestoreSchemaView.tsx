import { FIRESTORE_COLLECTIONS_DATA, FIRESTORE_SECURITY_RULES_CODE } from '../data/firestoreSchemaData';
import React, { useState } from 'react';
import { 
  Database, 
  Key, 
  ShieldCheck, 
  FileJson, 
  Search, 
  Layers, 
  Lock, 
  ListTree,
  Copy,
  Check
} from 'lucide-react';

export const FirestoreSchemaView: React.FC = () => {
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>(FIRESTORE_COLLECTIONS_DATA[0].id);
  const [activeTab, setActiveTab] = useState<'collections' | 'rules'>('collections');
  const [copiedRules, setCopiedRules] = useState(false);

  const activeCollection = FIRESTORE_COLLECTIONS_DATA.find(c => c.id === selectedCollectionId) || FIRESTORE_COLLECTIONS_DATA[0];

  const handleCopyRules = () => {
    navigator.clipboard.writeText(FIRESTORE_SECURITY_RULES_CODE);
    setCopiedRules(true);
    setTimeout(() => setCopiedRules(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-4">
      {/* Sub-Header Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded bg-amber-50 text-amber-700 border border-amber-200">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Firestore Database Architecture</h2>
            <p className="text-xs text-slate-500">NoSQL Document Schemas, Compound Indexes, and Security Rules</p>
          </div>
        </div>

        <div className="flex space-x-1 bg-slate-100 p-1 rounded border border-slate-200">
          <button
            onClick={() => setActiveTab('collections')}
            className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
              activeTab === 'collections'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Collections & Schemas
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-3 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1.5 ${
              activeTab === 'rules'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            Security Rules (firestore.rules)
          </button>
        </div>
      </div>

      {activeTab === 'collections' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Collection Selector Sidebar */}
          <div className="lg:col-span-4 space-y-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Top-Level Collections
            </h3>
            {FIRESTORE_COLLECTIONS_DATA.map((col) => {
              const isSelected = col.id === selectedCollectionId;
              return (
                <button
                  key={col.id}
                  onClick={() => setSelectedCollectionId(col.id)}
                  className={`w-full text-left p-2.5 rounded border text-xs transition-all ${
                    isSelected
                      ? 'bg-amber-50 border-amber-300 text-amber-900 font-semibold shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="mono text-xs text-amber-800 font-bold">{col.name}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 mono">
                      {col.fields.length} Fields
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-2">{col.description}</p>
                </button>
              );
            })}
          </div>

          {/* Collection Inspector */}
          <div className="lg:col-span-8 space-y-5">
            <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="mono text-base font-bold text-amber-800">
                      /{activeCollection.name}
                    </span>
                    <span className="text-[10px] mono font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                      ID: {activeCollection.id}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{activeCollection.description}</p>
                </div>
              </div>

              {/* Security Scope Tag */}
              <div className="bg-slate-50 p-3 rounded border border-slate-200 flex items-start space-x-2 text-xs text-slate-700">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-900">Security Access Scope: </span>
                  <span className="text-slate-600">{activeCollection.securityScope}</span>
                </div>
              </div>

              {/* Schema Fields Table */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-tight mb-2 mono">
                  Field Definitions & Constraints
                </h4>
                <div className="border border-slate-200 rounded overflow-x-auto bg-white">
                  <table className="w-full text-left text-xs text-slate-800">
                    <thead className="bg-slate-50 text-slate-600 mono text-[10px] uppercase border-b border-slate-200">
                      <tr>
                        <th className="p-2">Field Name</th>
                        <th className="p-2">Data Type</th>
                        <th className="p-2">Required</th>
                        <th className="p-2">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 mono text-[11px]">
                      {activeCollection.fields.map((f, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="p-2 font-bold text-amber-800">{f.name}</td>
                          <td className="p-2 text-blue-600 font-medium">{f.type}</td>
                          <td className="p-2">
                            {f.required ? (
                              <span className="text-rose-600 text-[10px] font-bold">YES</span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">OPTIONAL</span>
                            )}
                          </td>
                          <td className="p-2 text-slate-600 font-sans text-xs">{f.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sample Document JSON */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-tight mb-2 mono flex items-center gap-1.5">
                  <FileJson className="w-4 h-4 text-emerald-600" />
                  Sample Document Instance JSON
                </h4>
                <div className="bg-[#0F172A] border border-slate-800 rounded p-3.5 mono text-[11px] text-emerald-300 overflow-x-auto shadow-inner">
                  <pre>{JSON.stringify(activeCollection.sampleDocument, null, 2)}</pre>
                </div>
              </div>

              {/* Indexing Strategies */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-tight mb-2 mono flex items-center gap-1.5">
                  <ListTree className="w-4 h-4 text-blue-600" />
                  Compound Index Configuration
                </h4>
                <div className="space-y-1.5">
                  {activeCollection.indexes.map((idx, i) => (
                    <div key={i} className="bg-slate-50 p-2.5 rounded border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <div className="flex items-center space-x-2">
                        <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 mono text-[10px] font-bold">
                          {idx.queryType}
                        </span>
                        <span className="mono text-slate-800 font-semibold">
                          [{idx.fields.join(', ')}]
                        </span>
                      </div>
                      <span className="text-slate-500 text-[11px] font-sans">{idx.purpose}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Firestore Security Rules Viewer */
        <div className="bg-[#0F172A] border border-slate-800 rounded-lg overflow-hidden shadow-md">
          <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Lock className="w-4 h-4 text-amber-400" />
              <span className="mono text-xs font-bold text-white">
                infra/firestore.rules
              </span>
            </div>
            <button
              onClick={handleCopyRules}
              className="flex items-center space-x-1.5 text-xs text-slate-300 bg-slate-800 px-2.5 py-1 rounded hover:bg-slate-700 transition-colors"
            >
              {copiedRules ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 text-[10px]">Rules Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="text-[10px]">Copy Security Rules</span>
                </>
              )}
            </button>
          </div>
          <div className="p-4 mono text-xs text-amber-200/90 leading-relaxed overflow-x-auto bg-[#0F172A]">
            <pre>{FIRESTORE_SECURITY_RULES_CODE}</pre>
          </div>
        </div>
      )}
    </div>
  );
};
